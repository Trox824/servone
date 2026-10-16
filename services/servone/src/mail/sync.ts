import type { Blob, Ref } from '@hcengineering/core'
import {
  encodeLocation, foldersOf, type FolderRole, type ImapAction, type MailAccountCard, type MailFolderCard, type MailMessageCard, type MailThreadCard,
  type MessageChange, planActions, readLocation
} from '@servone/mail'
import type { ImapFlow } from 'imapflow'
import type { Transporter } from 'nodemailer'
import { types } from 'util'
import type { BlobStore } from './blobs'
import type { MailCards } from './cards'
import { FETCH_QUERY, toFetchedMessage, toListedFolder } from './imap'
import { buildMime, newMessageId, type OutgoingMail } from './smtp'
import type { MailStore } from './store'

export const BACKFILL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const BATCH_SIZE = 100
export const POLL_INTERVAL_MS = 5 * 60 * 1000
// Gmail and Microsoft file the Sent copy a moment after SMTP accepts; searching sooner would append a duplicate.
export const SENT_COPY_WAIT_MS = 3000
// INBOX first so the user can read within seconds; Sent next because replies thread against it.
const ROLE_ORDER: FolderRole[] = ['inbox', 'sent', 'drafts', 'archive', 'all', 'other', 'spam', 'trash']

export interface MailboxSyncDeps {
  imap: ImapFlow
  cards: MailCards
  store: MailStore
  account: Ref<MailAccountCard>
  now: () => number
  report: (event: string, fields: { mailbox: string, detail?: string }) => void
}

function chunks<T> (list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function revertOf (change: MessageChange): Partial<Pick<MailMessageCard, 'mailIsRead' | 'mailIsStarred' | 'mailTargetFolder' | 'mailIsDeleted'>> {
  const reverted: Partial<Pick<MailMessageCard, 'mailIsRead' | 'mailIsStarred' | 'mailTargetFolder' | 'mailIsDeleted'>> = { mailTargetFolder: null }
  if (change.mailIsRead !== undefined) reverted.mailIsRead = !change.mailIsRead
  if (change.mailIsStarred !== undefined) reverted.mailIsStarred = !change.mailIsStarred
  if (change.mailIsDeleted === true) reverted.mailIsDeleted = false
  return reverted
}

export class MailboxSync {
  constructor (protected readonly deps: MailboxSyncDeps) {}

  async syncFolders (): Promise<MailFolderCard[]> {
    const listed = (await this.deps.imap.list()).map(toListedFolder).filter((folder) => folder !== undefined)
    const existing = await this.deps.cards.findFolders({ mailAccount: this.deps.account })
    for (const folder of listed) {
      const card = existing.find((it) => it.mailPath === folder.path)
      if (card !== undefined) {
        if (card.mailRole !== folder.role) await this.deps.cards.updateFolder(card._id, { mailRole: folder.role })
        continue
      }
      await this.deps.cards.createFolder(folder.name, {
        mailAccount: this.deps.account, mailPath: folder.path, mailRole: folder.role, mailUidValidity: 0, mailHighestModSeq: '', mailUnread: 0, mailTotal: 0
      })
    }
    for (const card of existing) {
      if (listed.some((folder) => folder.path === card.mailPath)) continue
      await this.deps.store.forgetFolder(card._id)
      await this.deps.store.flushThreads()
      await this.deps.cards.removeFolder(card._id)
    }
    const folders = await this.deps.cards.findFolders({ mailAccount: this.deps.account })
    return folders.sort((a, b) => ROLE_ORDER.indexOf(a.mailRole) - ROLE_ORDER.indexOf(b.mailRole))
  }

  async backfill (): Promise<void> {
    await this.deps.cards.updateAccount(this.deps.account, { mailStatus: 'backfilling', mailBackfillDone: 0, mailBackfillTotal: 0 })
    const since = new Date(this.deps.now() - BACKFILL_DAYS * DAY_MS)
    let done = 0
    let total = 0
    for (const folder of await this.syncFolders()) {
      const uids = await this.run(async () => {
        const lock = await this.deps.imap.getMailboxLock(folder.mailPath)
        try {
          const found = (await this.deps.imap.search({ since }, { uid: true })) || []
          found.sort((a, b) => b - a)
          return found
        } finally {
          lock.release()
        }
      })
      total += uids.length
      await this.deps.cards.updateAccount(this.deps.account, { mailBackfillTotal: total })
      for (const batch of chunks(uids, BATCH_SIZE)) {
        // Each batch is its own run() task so a body the user opens mid-backfill is fetched between batches instead of after the whole backfill.
        await this.run(async () => {
          const lock = await this.deps.imap.getMailboxLock(folder.mailPath)
          try {
            await this.fetchBatch(folder._id, batch)
            await this.deps.store.flushThreads()
          } finally {
            lock.release()
          }
        })
        done += batch.length
        await this.deps.cards.updateAccount(this.deps.account, { mailBackfillDone: done })
      }
      // Last, and under the folder's own lock: run() reselects INBOX between tasks, and a non-zero uidValidity marks the folder done.
      await this.run(async () => {
        const lock = await this.deps.imap.getMailboxLock(folder.mailPath)
        try {
          await this.rememberMailboxState(folder)
        } finally {
          lock.release()
        }
      })
    }
    await this.deps.cards.updateAccount(this.deps.account, { mailStatus: 'ready', mailLastSyncAt: this.deps.now() })
  }

  private async fetchBatch (folder: Ref<MailFolderCard>, uids: number[]): Promise<void> {
    for await (const message of this.deps.imap.fetch(uids.join(','), FETCH_QUERY, { uid: true })) {
      await this.deps.store.upsertMessage(toFetchedMessage(message, folder))
    }
  }

  private queue: Promise<void> = Promise.resolve()
  private isWatching = false
  private inboxPath = ''
  private idleLoopPromise: Promise<void> = Promise.resolve()
  private onInboxChange?: (event: { path: string }) => void
  private isCatchUpQueued = false
  private isCatchUpDirty = false

  // One IMAP connection runs one command at a time; every task goes through here so mailbox locks never interleave.
  // imapflow IDLEs on whichever mailbox is selected, so a task that left another folder selected hands INBOX back.
  async run<T> (task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      try {
        return await task()
      } finally {
        await this.reselectInbox()
      }
    })
    this.queue = next.then(() => undefined, () => undefined)
    return await next
  }

  private async reselectInbox (): Promise<void> {
    if (!this.isWatching || !this.deps.imap.usable) return
    const selected = this.deps.imap.mailbox
    if (selected !== false && selected.path === this.inboxPath) return
    await this.deps.imap.mailboxOpen(this.inboxPath)
  }

  async applyChange (messageId: Ref<MailMessageCard>, change: MessageChange): Promise<void> {
    await this.run(async () => {
      const [message] = await this.deps.cards.findMessages({ _id: messageId }, { limit: 1 })
      if (message === undefined) return
      const parsed = message.mailLocations.map(readLocation).filter((location) => location !== undefined)
      if (parsed.length !== message.mailLocations.length) {
        // A retry cannot fix a bad location, and throwing would stall every later change behind this one.
        this.deps.report('mail change dropped', { mailbox: this.deps.account, detail: `message ${message._id} has a malformed location` })
        await this.deps.cards.updateMessage(message._id, revertOf(change))
        return
      }
      const folders = await this.deps.cards.findFolders({ mailAccount: this.deps.account })
      const roles = new Map(folders.map((folder) => [folder._id, folder.mailRole]))
      const actions = planActions(change, parsed, roles)
      const target = change.mailTargetFolder
      const isMoveUnplanned = target !== undefined && target !== null && !actions.some((action) => action.kind === 'move') &&
        !parsed.some((location) => location.folder === target)
      if (isMoveUnplanned) {
        this.deps.report('mail move not possible', { mailbox: this.deps.account, detail: `message ${message._id} to folder ${target}` })
        await this.deps.cards.updateMessage(message._id, revertOf(change))
        return
      }
      let locations = message.mailLocations
      try {
        for (const action of actions) locations = await this.perform(action, folders, locations)
        if (change.mailIsDeleted === true) await this.deps.cards.removeMessage(message._id)
        else await this.deps.cards.updateMessage(message._id, { mailLocations: locations, mailFolders: foldersOf(locations), mailTargetFolder: null })
      } catch (error) {
        // isNativeError: imapflow and socket errors come from another realm under jest, so instanceof fails.
        if (!types.isNativeError(error)) throw error
        // Actions that already ran stay applied on the server, so keep the locations they produced.
        await this.deps.cards.updateMessage(message._id, { ...revertOf(change), mailLocations: locations, mailFolders: foldersOf(locations) })
        await this.deps.cards.updateAccount(this.deps.account, { mailLastError: error.message })
      }
      await this.deps.store.flushThreadOf(message.mailThread)
    })
  }

  private async perform (action: ImapAction, folders: MailFolderCard[], locations: string[]): Promise<string[]> {
    const source = folders.find((folder) => folder._id === action.folder)
    if (source === undefined) throw new Error(`Unknown folder ${action.folder}`)
    const range = action.uids.join(',')
    const lock = await this.deps.imap.getMailboxLock(source.mailPath)
    try {
      if (action.kind === 'addFlags') await this.deps.imap.messageFlagsAdd(range, action.flags, { uid: true })
      if (action.kind === 'removeFlags') await this.deps.imap.messageFlagsRemove(range, action.flags, { uid: true })
      if (action.kind === 'addFlags' || action.kind === 'removeFlags') await this.rememberCounts(source)
      const moved = action.uids.map((uid) => encodeLocation({ uid, folder: action.folder }))
      if (action.kind === 'expunge') {
        await this.deps.imap.messageDelete(range, { uid: true })
        return locations.filter((location) => !moved.includes(location))
      }
      if (action.kind === 'move') {
        const target = folders.find((folder) => folder._id === action.target)
        if (target === undefined) throw new Error(`Unknown folder ${action.target}`)
        const copied = await this.deps.imap.messageMove(range, target.mailPath, { uid: true })
        if (copied === false) throw new Error(`MOVE to ${target.mailPath} was refused`)
        // Without UIDPLUS the server gives no new UIDs; the next poll of the target folder adds the location.
        const added = [...(copied.uidMap?.values() ?? [])].map((uid) => encodeLocation({ uid, folder: action.target }))
        return [...locations.filter((location) => !moved.includes(location)), ...added]
      }
      return locations
    } finally {
      lock.release()
    }
  }

  async saveDraft (message: MailMessageCard, blobs: BlobStore): Promise<void> {
    const outgoing = await this.outgoingOf(message, blobs)
    const raw = await buildMime(outgoing)
    await this.run(async () => {
      const drafts = await this.folderByRole('drafts')
      const appended = await this.deps.imap.append(drafts.mailPath, raw, ['\\Draft', '\\Seen'])
      if (appended === false) throw new Error('Drafts APPEND was refused')
      const locations = message.mailLocations.map(readLocation).filter((location) => location !== undefined)
      const previous = locations.filter((location) => location.folder === drafts._id)
      if (previous.length > 0) {
        const lock = await this.deps.imap.getMailboxLock(drafts.mailPath)
        try {
          await this.deps.imap.messageDelete(previous.map((location) => location.uid).join(','), { uid: true })
        } finally {
          lock.release()
        }
      }
      const location = encodeLocation({ uid: Number(appended.uid), folder: drafts._id })
      const others = locations.filter((location) => location.folder !== drafts._id).map(encodeLocation)
      await this.deps.cards.updateMessage(message._id, { mailLocations: [...others, location], mailFolders: foldersOf([...others, location]), mailMessageId: outgoing.messageId })
    })
  }

  private readonly sending = new Map<Ref<MailMessageCard>, Promise<string>>()

  // A double click must not send twice: the second call joins the first.
  async send (draft: MailMessageCard, blobs: BlobStore, transport: Transporter): Promise<string> {
    const inFlight = this.sending.get(draft._id)
    if (inFlight !== undefined) return await inFlight
    const sending = this.deliver(draft, blobs, transport).finally(() => { this.sending.delete(draft._id) })
    this.sending.set(draft._id, sending)
    return await sending
  }

  private async deliver (draft: MailMessageCard, blobs: BlobStore, transport: Transporter): Promise<string> {
    // Folders are resolved before SMTP: a refusal after the mail is accepted would make the user retry and send it twice.
    const sent = await this.folderByRole('sent')
    const folders = await this.deps.cards.findFolders({ mailAccount: this.deps.account })
    const draftCopies = draft.mailLocations.map(readLocation).filter((location) => location !== undefined).flatMap((location) => {
      const folder = folders.find((it) => it._id === location.folder)
      return folder === undefined ? [] : [{ path: folder.mailPath, uid: location.uid }]
    })
    const outgoing = await this.outgoingOf(draft, blobs)
    const messageId = outgoing.messageId
    // Persisted before SMTP so a retry after a failed Sent copy reuses the Message-ID: the Sent search then finds it and recipients can dedupe.
    if (draft.mailMessageId !== messageId) await this.deps.cards.updateMessage(draft._id, { mailMessageId: messageId })
    const raw = await buildMime(outgoing)
    await transport.sendMail({ envelope: { from: outgoing.from, to: [...outgoing.to, ...outgoing.cc, ...outgoing.bcc] }, raw })
    // One task, so a Drafts catch-up cannot run between the card removal and the IMAP delete and recreate the draft.
    await this.run(async () => {
      await this.deps.cards.removeMessage(draft._id)
      await this.reportFailure('mail draft cleanup failed', draftCopies.map((copy) => copy.path).join(','), async () => {
        for (const copy of draftCopies) {
          const lock = await this.deps.imap.getMailboxLock(copy.path)
          try {
            await this.deps.imap.messageDelete(String(copy.uid), { uid: true })
          } finally {
            lock.release()
          }
        }
      })
      await this.deps.store.flushThreadOf(draft.mailThread)
    })
    await new Promise((resolve) => setTimeout(resolve, SENT_COPY_WAIT_MS))
    await this.reportFailure('mail sent copy failed', sent.mailPath, async () => await this.run(async () => {
      const lock = await this.deps.imap.getMailboxLock(sent.mailPath)
      try {
        const found = (await this.deps.imap.search({ header: { 'message-id': messageId } }, { uid: true })) || []
        if (found.length === 0) await this.deps.imap.append(sent.mailPath, raw, ['\\Seen'])
      } finally {
        lock.release()
      }
    }))
    return messageId
  }

  // The mail is already delivered, so an IMAP failure here is reported instead of telling the user the send failed.
  private async reportFailure (event: string, mailbox: string, step: () => Promise<void>): Promise<void> {
    try {
      await step()
    } catch (error) {
      if (!types.isNativeError(error)) throw error
      this.deps.report(event, { mailbox, detail: error.message })
    }
  }

  async refreshThread (thread: Ref<MailThreadCard>): Promise<void> {
    await this.run(async () => { await this.deps.store.flushThreadOf(thread) })
  }

  private async outgoingOf (message: MailMessageCard, blobs: BlobStore): Promise<OutgoingMail> {
    const html = message.mailBodyBlob === '' ? '' : (await blobs.read(message.mailBodyBlob as Ref<Blob>)).toString('utf8')
    return {
      from: message.mailFrom,
      to: message.mailTo,
      cc: message.mailCc,
      bcc: message.mailBcc,
      subject: message.title,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      messageId: message.mailMessageId !== '' ? message.mailMessageId : newMessageId(message.mailFrom),
      inReplyTo: message.mailInReplyTo,
      references: message.mailReferences,
      attachments: await Promise.all((await this.deps.cards.attachmentsOf(message._id)).map(async (file) => ({
        filename: file.name,
        contentType: file.contentType,
        content: await blobs.read(file.blob)
      })))
    }
  }

  async watchInbox (): Promise<void> {
    const inbox = await this.folderByRole('inbox')
    this.onInboxChange = (event) => {
      if (event.path !== inbox.mailPath) return
      this.scheduleCatchUp(inbox)
    }
    this.deps.imap.on('exists', this.onInboxChange)
    this.deps.imap.on('expunge', this.onInboxChange)
    this.deps.imap.on('flags', this.onInboxChange)
    this.inboxPath = inbox.mailPath
    this.isWatching = true
    await this.run(async () => { await this.deps.imap.mailboxOpen(inbox.mailPath) })
    this.idleLoopPromise = this.idleLoop(inbox.mailPath)
    // Mail that landed after the last sync raises no IDLE event, so INBOX is caught up once here.
    this.scheduleCatchUp(inbox)
  }

  // exists/expunge/flags fire once per changed message, so one user action can raise several events;
  // the dirty bit folds a burst into a single run, plus one more if events land while that run is in flight.
  private scheduleCatchUp (inbox: MailFolderCard): void {
    if (this.isCatchUpQueued) {
      this.isCatchUpDirty = true
      return
    }
    this.isCatchUpQueued = true
    void this.run(async () => {
      do {
        this.isCatchUpDirty = false
        await this.catchUp(inbox)
      } while (this.isCatchUpDirty)
    })
      .catch((error: Error) => {
        this.deps.report('mail catch-up failed', { mailbox: inbox.mailPath, detail: error.message })
      })
      .finally(() => { this.isCatchUpQueued = false })
  }

  // imapflow only starts IDLE on its own after 15s of inactivity (AUTO_IDLE_DELAY); this loop keeps
  // push updates near-instant, re-entering IDLE whenever a command (ours or the server's) breaks it.
  private async idleLoop (mailPath: string): Promise<void> {
    while (this.isWatching) {
      try {
        await this.deps.imap.idle()
      } catch (error: unknown) {
        if (this.isWatching && types.isNativeError(error)) {
          this.deps.report('mail idle failed', { mailbox: mailPath, detail: error.message })
        }
        return
      }
    }
  }

  // Unhooks the listeners so no new catch-up gets queued, then NOOPs to break the pending IDLE and
  // awaits the loop so it has actually stopped once this resolves.
  async stopWatching (): Promise<void> {
    this.isWatching = false
    if (this.onInboxChange !== undefined) {
      this.deps.imap.off('exists', this.onInboxChange)
      this.deps.imap.off('expunge', this.onInboxChange)
      this.deps.imap.off('flags', this.onInboxChange)
      this.onInboxChange = undefined
    }
    if (this.deps.imap.usable) await this.deps.imap.noop()
    await this.idleLoopPromise
  }

  async pollAll (): Promise<void> {
    await this.run(async () => {
      for (const folder of await this.syncFolders()) {
        if (folder.mailRole !== 'inbox') await this.catchUp(folder)
      }
      await this.deps.cards.updateAccount(this.deps.account, { mailLastSyncAt: this.deps.now() })
    })
  }

  // Callers hold the queue (run); INBOX catch-up is called from IDLE events while INBOX is already selected.
  async catchUp (folder: MailFolderCard): Promise<void> {
    const lock = await this.deps.imap.getMailboxLock(folder.mailPath)
    try {
      const mailbox = this.deps.imap.mailbox
      if (mailbox === false) return
      if (folder.mailUidValidity !== 0 && folder.mailUidValidity !== Number(mailbox.uidValidity)) {
        await this.deps.store.forgetFolder(folder._id)
        await this.deps.store.flushThreads()
        await this.deps.cards.updateFolder(folder._id, { mailHighestModSeq: '' })
        folder = { ...folder, mailHighestModSeq: '' }
      }
      const since = new Date(this.deps.now() - BACKFILL_DAYS * DAY_MS)
      const current = new Set((await this.deps.imap.search({ since }, { uid: true })) || [])
      const known = await this.deps.store.uidsIn(folder._id)
      for (const uid of known) if (!current.has(uid)) await this.deps.store.removeLocation(folder._id, uid)
      const fresh = [...current].filter((uid) => !known.has(uid))
      for (const batch of chunks(fresh, BATCH_SIZE)) {
        await this.fetchBatch(folder._id, batch)
      }
      await this.syncFlags(folder, [...current].filter((uid) => known.has(uid)))
      await this.deps.store.flushThreads()
      await this.rememberMailboxState(folder)
    } finally {
      lock.release()
    }
  }

  private async syncFlags (folder: MailFolderCard, uids: number[]): Promise<void> {
    if (uids.length === 0) return
    const canUseModseq = folder.mailHighestModSeq !== '' && this.deps.imap.enabled.has('CONDSTORE')
    const options = canUseModseq ? { uid: true, changedSince: BigInt(folder.mailHighestModSeq) } : { uid: true }
    const range = canUseModseq ? '1:*' : uids.join(',')
    for await (const message of this.deps.imap.fetch(range, { uid: true, flags: true }, options)) {
      const flags = message.flags ?? new Set<string>()
      await this.deps.store.updateFlags(folder._id, message.uid, { isRead: flags.has('\\Seen'), isStarred: flags.has('\\Flagged') })
    }
  }

  protected async folderByRole (role: FolderRole): Promise<MailFolderCard> {
    const [folder] = await this.deps.cards.findFolders({ mailAccount: this.deps.account, mailRole: role })
    if (folder === undefined) throw new Error(`Mailbox has no ${role} folder`)
    return folder
  }

  // Callers hold the folder's lock.
  protected async rememberMailboxState (folder: MailFolderCard): Promise<void> {
    const mailbox = this.deps.imap.mailbox
    if (mailbox === false) return
    await this.deps.cards.updateFolder(folder._id, {
      mailUidValidity: Number(mailbox.uidValidity),
      mailHighestModSeq: mailbox.highestModseq !== undefined ? mailbox.highestModseq.toString() : '',
      ...await this.folderCounts()
    })
  }

  // Separate from rememberMailboxState: bumping highestModSeq after our own flag change would skip other clients' changes.
  private async rememberCounts (folder: MailFolderCard): Promise<void> {
    if (this.deps.imap.mailbox === false) return
    await this.deps.cards.updateFolder(folder._id, await this.folderCounts())
  }

  // Scoped to the backfill window so the badge matches the list; older unread mail is never imported.
  private async folderCounts (): Promise<Pick<MailFolderCard, 'mailUnread' | 'mailTotal'>> {
    const since = new Date(this.deps.now() - BACKFILL_DAYS * DAY_MS)
    const unseen = (await this.deps.imap.search({ since, seen: false }, { uid: true })) || []
    const all = (await this.deps.imap.search({ since }, { uid: true })) || []
    return { mailUnread: unseen.length, mailTotal: all.length }
  }
}
