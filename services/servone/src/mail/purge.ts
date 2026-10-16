import type { AccountUuid, Blob, MeasureContext, Ref, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import { mailboxSpaceId } from '@servone/mail'
import type { BlobStore } from './blobs'
import { createMailCards, type MailCards, REMOVE_BATCH } from './cards'
import type { WorkspaceClients } from './clients'

// Each removal batch costs the transactor ~20 s of trigger work; the pause leaves it room for live traffic.
export const PURGE_PAUSE_MS = 2_000
// A job that failed (transactor or storage down) is retried from whatever is left in the mailbox.
const RETRY_MS = 60_000
const JOB_PREFIX = 'purge/'

export interface PurgeJob {
  workspace: WorkspaceUuid
  owner: AccountUuid
}

const jobKey = (job: PurgeJob): string => `${JOB_PREFIX}${job.workspace}/${job.owner}`

function parseJobKey (key: string): PurgeJob | undefined {
  const [, workspace, owner] = key.split('/')
  return workspace !== undefined && owner !== undefined ? { workspace: workspace as WorkspaceUuid, owner: owner as AccountUuid } : undefined
}

export async function purgeMailbox (cards: MailCards, blobs: BlobStore, pause: () => Promise<void>): Promise<void> {
  // Folders first: the sidebar unread badge sums the inbox folder's count.
  await cards.removeAll(await cards.findFolders({}))
  for (let page = await cards.findAttachments(REMOVE_BATCH); page.length > 0; page = await cards.findAttachments(REMOVE_BATCH)) {
    await blobs.remove(page.map((doc) => doc.file))
    await cards.removeAll(page)
    await pause()
  }
  for (let page = await cards.findMessages({}, { limit: REMOVE_BATCH }); page.length > 0; page = await cards.findMessages({}, { limit: REMOVE_BATCH })) {
    await blobs.remove(page.flatMap((message) => [message.mailBodyBlob, message.mailRawBlob]).filter((blob) => blob !== '').map((blob) => blob as Ref<Blob>))
    await cards.removeAll(page)
    await pause()
  }
  for (let page = await cards.findThreads({}, REMOVE_BATCH); page.length > 0; page = await cards.findThreads({}, REMOVE_BATCH)) {
    await cards.removeAll(page)
    await pause()
  }
  // Account last: while it exists in 'removing' the owner cannot connect into a half-emptied space.
  const account = await cards.findAccount()
  if (account !== undefined) await cards.removeAll([account])
}

// Jobs live in KVS, so a purge survives the browser closing, a deploy or a crash: resume() continues it on startup.
export class MailPurge {
  private draining: Promise<boolean> | undefined
  private isDirty = false
  private retry: NodeJS.Timeout | undefined

  constructor (
    private readonly ctx: MeasureContext,
    private readonly kv: KeyValueClient,
    private readonly clients: WorkspaceClients,
    private readonly blobsFor: (workspace: WorkspaceUuid) => Promise<BlobStore>,
    private readonly pauseMs: number
  ) {}

  async enqueue (job: PurgeJob): Promise<void> {
    await this.kv.setValue(jobKey(job), { queuedAt: Date.now() })
    this.resume()
  }

  resume (): void {
    this.drain().then(
      (hasFailed) => { if (hasFailed) this.scheduleRetry() },
      (error: Error) => {
        this.ctx.error('mail purge queue unreadable, retrying', { error: error.message })
        this.scheduleRetry()
      }
    )
  }

  stop (): void {
    clearTimeout(this.retry)
    this.retry = undefined
  }

  // Resolves true when a job failed and stays queued. A job queued while a drain runs gets one more pass.
  async drain (): Promise<boolean> {
    if (this.draining !== undefined) {
      this.isDirty = true
      return await this.draining
    }
    this.draining = (async () => {
      let hasFailed = false
      do {
        this.isDirty = false
        hasFailed = (await this.drainOnce()) || hasFailed
      } while (this.isDirty)
      return hasFailed
    })()
    try {
      return await this.draining
    } finally {
      this.draining = undefined
    }
  }

  private scheduleRetry (): void {
    if (this.retry !== undefined) return
    this.retry = setTimeout(() => {
      this.retry = undefined
      this.resume()
    }, RETRY_MS)
  }

  private async drainOnce (): Promise<boolean> {
    let hasFailed = false
    const listed = await this.kv.listKeys(JOB_PREFIX)
    for (const key of listed?.keys ?? []) {
      const job = parseJobKey(key)
      if (job === undefined) {
        this.ctx.warn('mail purge job key unreadable, dropped', { key })
        await this.kv.deleteKey(key)
        continue
      }
      const started = Date.now()
      try {
        const cards = createMailCards(await this.clients(job.workspace), mailboxSpaceId(job.owner))
        await purgeMailbox(cards, await this.blobsFor(job.workspace), async () => { await new Promise((resolve) => setTimeout(resolve, this.pauseMs)) })
        await this.kv.deleteKey(key)
        this.ctx.info('mail purge done', { ...job, ms: Date.now() - started })
      } catch (error) {
        // One mailbox that cannot be purged must not hold up the others; it stays queued for the retry.
        hasFailed = true
        this.ctx.error('mail purge failed, will retry', { ...job, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return hasFailed
  }
}
