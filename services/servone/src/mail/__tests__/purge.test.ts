import { type AccountUuid, type Blob, MeasureMetricsContext, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import type { Attachment } from '@hcengineering/attachment'
import { mailboxSpaceId, type MailAccountCard, type MailFolderCard, type MailThreadCard } from '@servone/mail'
import type { BlobStore } from '../blobs'
import { FakeMailCards } from './fake-cards'
import { FakeKeyValueClient } from './fake-kv'

const mockCardsBySpace = new Map<string, FakeMailCards>()
jest.mock('../cards', () => ({
  ...jest.requireActual('../cards'),
  createMailCards: (_client: never, space: string) => mockCardsBySpace.get(space)
}))

import { REMOVE_BATCH } from '../cards'
import { MailPurge, purgeMailbox } from '../purge'

const WORKSPACE = 'ws-1' as WorkspaceUuid
const OWNER = 'owner-1' as AccountUuid
const OTHER_OWNER = 'owner-2' as AccountUuid
const JOB_KEY = `purge/${WORKSPACE}/${OWNER}`
const noPause = async (): Promise<void> => {}

function fakeBlobs (): BlobStore & { remove: jest.Mock<Promise<void>, [Array<Ref<Blob>>]> } {
  return {
    put: async () => { throw new Error('purge never writes blobs') },
    read: async () => { throw new Error('purge never reads blobs') },
    remove: jest.fn(async (_blobs: Array<Ref<Blob>>) => {})
  }
}

async function seedMailbox (threadCount: number, messageCount: number): Promise<FakeMailCards> {
  const cards = new FakeMailCards()
  const account: Ref<MailAccountCard> = await cards.createAccount('linh@example.vn', {
    mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'removing',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  const inbox: Ref<MailFolderCard> = await cards.createFolder('INBOX', {
    mailAccount: account, mailPath: 'INBOX', mailRole: 'inbox', mailUidValidity: 1, mailHighestModSeq: '', mailUnread: 3, mailTotal: 3
  })
  let thread: Ref<MailThreadCard> | undefined
  for (let index = 0; index < threadCount; index++) {
    thread = await cards.createThread(`t${index}`, {
      mailAccount: account, mailSubjectKey: `t${index}`, mailParticipants: [], mailLastMessageAt: index, mailSnippet: '', mailFolders: [inbox],
      mailHasUnread: false, mailIsStarred: false, mailHasAttachments: false, mailMessageCount: 1, mailProviderThreadId: ''
    })
  }
  for (let index = 0; index < messageCount && thread !== undefined; index++) {
    await cards.createMessage(`m${index}`, {
      mailThread: thread, mailMessageId: `<m${index}@example.vn>`, mailInReplyTo: '', mailReferences: [], mailFrom: '', mailTo: [], mailCc: [],
      mailBcc: [], mailSentAt: index, mailSnippet: '', mailIsRead: true, mailIsStarred: false, mailIsDraft: false, mailLocations: [],
      mailFolders: [inbox], mailProviderMessageId: '', mailBodyBlob: index === 0 ? `body-${index}` : '', mailRawBlob: index === 0 ? `raw-${index}` : '',
      mailHasAttachments: false, mailTargetFolder: null, mailIsDeleted: false
    })
  }
  return cards
}

function seedAttachment (cards: FakeMailCards, file: string): void {
  cards.attachments.push({ _id: `att-${file}`, file: file as Ref<Blob> } as Attachment)
}

describe('purgeMailbox', () => {
  it('removes folders first, then attachments, messages, threads in batches, and the account last', async () => {
    const cards = await seedMailbox(REMOVE_BATCH + 1, 2 * REMOVE_BATCH + 1)
    seedAttachment(cards, 'file-1')
    const removeAll = jest.spyOn(cards, 'removeAll')
    const blobs = fakeBlobs()
    const pause = jest.fn(noPause)

    await purgeMailbox(cards, blobs, pause)

    expect(removeAll.mock.calls[0][0].every((card) => 'mailPath' in card)).toBe(true)
    expect(removeAll.mock.calls.every(([batch]) => batch.length <= REMOVE_BATCH)).toBe(true)
    expect(removeAll.mock.calls[removeAll.mock.calls.length - 1][0].every((card) => 'mailEmail' in card)).toBe(true)
    // 1 attachment page + 3 message pages + 2 thread pages, each followed by a pause.
    expect(pause).toHaveBeenCalledTimes(6)
    expect([cards.accounts, cards.folders, cards.threads, cards.messages, cards.attachments].every((docs) => docs.length === 0)).toBe(true)
    expect(blobs.remove).toHaveBeenCalledWith(['file-1'])
    expect(blobs.remove).toHaveBeenCalledWith(['body-0', 'raw-0'])
  })

  it('finishes a mailbox a previous run already half removed', async () => {
    const cards = await seedMailbox(3, 5)
    cards.folders = []
    cards.threads = []

    await purgeMailbox(cards, fakeBlobs(), noPause)

    expect(cards.messages).toHaveLength(0)
    expect(cards.accounts).toHaveLength(0)
  })

  it('keeps the account while storage refuses to drop blobs, so the mailbox stays hidden and retryable', async () => {
    const cards = await seedMailbox(1, 1)
    const blobs = fakeBlobs()
    blobs.remove.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(purgeMailbox(cards, blobs, noPause)).rejects.toThrow('storage unavailable')

    expect(cards.accounts).toHaveLength(1)
    expect(cards.messages).toHaveLength(1)
  })
})

describe('MailPurge', () => {
  beforeEach(() => {
    mockCardsBySpace.clear()
    jest.clearAllMocks()
  })

  function newPurge (kv: FakeKeyValueClient): MailPurge {
    // createMailCards is mocked by space, so the workspace client is never used.
    return new MailPurge(new MeasureMetricsContext('test', {}), kv, jest.fn(), async () => fakeBlobs(), 0)
  }

  it('keeps the job in KVS until the mailbox is gone, then drops it', async () => {
    const cards = await seedMailbox(2, 2)
    mockCardsBySpace.set(mailboxSpaceId(OWNER), cards)
    const kv = new FakeKeyValueClient()
    await kv.setValue(JOB_KEY, { queuedAt: 0 })

    expect(await newPurge(kv).drain()).toBe(false)

    expect(kv.store.size).toBe(0)
    expect(cards.accounts).toHaveLength(0)
  })

  it('keeps a failed job queued without blocking the next mailbox', async () => {
    const failing = await seedMailbox(2, 2)
    const healthy = await seedMailbox(1, 1)
    mockCardsBySpace.set(mailboxSpaceId(OWNER), failing)
    mockCardsBySpace.set(mailboxSpaceId(OTHER_OWNER), healthy)
    jest.spyOn(failing, 'findMessages').mockRejectedValueOnce(new Error('transactor unavailable'))
    const kv = new FakeKeyValueClient()
    await kv.setValue(JOB_KEY, { queuedAt: 0 })
    await kv.setValue(`purge/${WORKSPACE}/${OTHER_OWNER}`, { queuedAt: 0 })
    const purge = newPurge(kv)

    expect(await purge.drain()).toBe(true)
    expect([...kv.store.keys()]).toEqual([JOB_KEY])
    expect(healthy.accounts).toHaveLength(0)

    expect(await purge.drain()).toBe(false)
    expect(kv.store.size).toBe(0)
    expect(failing.messages).toHaveLength(0)
  })

  it('picks up a job queued while a drain is already running', async () => {
    mockCardsBySpace.set(mailboxSpaceId(OWNER), await seedMailbox(1, 1))
    const other = await seedMailbox(1, 1)
    mockCardsBySpace.set(mailboxSpaceId(OTHER_OWNER), other)
    const kv = new FakeKeyValueClient()
    await kv.setValue(JOB_KEY, { queuedAt: 0 })
    const purge = newPurge(kv)

    const first = purge.drain()
    await kv.setValue(`purge/${WORKSPACE}/${OTHER_OWNER}`, { queuedAt: 0 })
    await Promise.all([first, purge.drain()])

    expect(kv.store.size).toBe(0)
    expect(other.accounts).toHaveLength(0)
  })

  it('drops a job key it cannot parse', async () => {
    const kv = new FakeKeyValueClient()
    await kv.setValue('purge/garbage', { queuedAt: 0 })

    expect(await newPurge(kv).drain()).toBe(false)
    expect(kv.store.size).toBe(0)
  })
})
