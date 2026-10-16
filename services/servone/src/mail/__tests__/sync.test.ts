import type { Blob, Ref } from '@hcengineering/core'
import type { FolderRole, MailAccountCard, MailFolderCard, MailMessageCard, MailThreadCard } from '@servone/mail'
import type { FetchMessageObject, ImapFlow, ListResponse } from 'imapflow'
import nodemailer from 'nodemailer'
import { BodyFetcher } from '../bodies'
import type { BlobStore } from '../blobs'
import { openImap } from '../imap'
import { MailStore } from '../store'
import { MailboxSync } from '../sync'
import { FakeMailCards } from './fake-cards'

class NoBlobs implements BlobStore {
  async put (): Promise<Ref<Blob>> { throw new Error('no blob writes expected') }
  async read (): Promise<Buffer> { return Buffer.alloc(0) }
  async remove (): Promise<void> { throw new Error('no blob removals expected') }
}

class FakeAttachmentBlobs implements BlobStore {
  constructor (private readonly files: Record<string, Buffer>) {}
  async put (): Promise<Ref<Blob>> { throw new Error('no blob writes expected') }
  async read (blob: Ref<Blob>): Promise<Buffer> {
    const content = this.files[blob]
    if (content === undefined) throw new Error(`unexpected blob ${blob}`)
    return content
  }

  async remove (): Promise<void> { throw new Error('no blob removals expected') }
}

// Never connected: any IMAP command rejects, so these tests prove the code paths stay off the wire.
function offlineImap (): ImapFlow {
  return openImap({ endpoint: { host: '127.0.0.1', port: 1, security: 'plain' }, address: '127.0.0.1', servername: 'localhost', username: 'x', auth: { pass: 'x' } }, false)
}

interface Setup {
  cards: FakeMailCards
  sync: MailboxSync
  imap: ImapFlow
  reports: string[]
  addMessage: (locations: string[]) => Promise<Ref<MailMessageCard>>
  addFolder: (path: string, role: FolderRole) => Promise<Ref<MailFolderCard>>
}

async function setup (): Promise<Setup> {
  const cards = new FakeMailCards()
  const account: Ref<MailAccountCard> = await cards.createAccount('linh@example.vn', {
    mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'ready',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  const reports: string[] = []
  const imap = offlineImap()
  const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: (event) => { reports.push(event) } })
  const addMessage = async (locations: string[]): Promise<Ref<MailMessageCard>> => await cards.createMessage('Báo giá', {
    mailThread: 'thread' as Ref<MailThreadCard>, mailMessageId: '<m@x>', mailInReplyTo: '', mailReferences: [], mailFrom: 'khach@example.vn', mailTo: [], mailCc: [], mailBcc: [],
    mailSentAt: 1000, mailSnippet: '', mailIsRead: true, mailIsStarred: false, mailIsDraft: false, mailLocations: locations, mailFolders: [],
    mailProviderMessageId: '', mailBodyBlob: '', mailRawBlob: '', mailHasAttachments: false, mailTargetFolder: null, mailIsDeleted: false
  })
  const addFolder = async (path: string, role: FolderRole): Promise<Ref<MailFolderCard>> => await cards.createFolder(path, {
    mailAccount: account, mailPath: path, mailRole: role, mailUidValidity: 1, mailHighestModSeq: '', mailUnread: 0, mailTotal: 0
  })
  return { cards, sync, imap, reports, addMessage, addFolder }
}

function listedInbox (): ListResponse {
  return {
    path: 'INBOX', pathAsListed: 'INBOX', name: 'INBOX', delimiter: '/', parent: [], parentPath: '',
    flags: new Set(), specialUse: undefined, specialUseSource: undefined, listed: true, subscribed: true
  }
}

function fetchedOf (uid: number): FetchMessageObject {
  return { uid, seq: uid, size: 0, flags: new Set() }
}

describe('MailboxSync.applyChange', () => {
  it('drops a change on a card with a malformed location and reverts it', async () => {
    const { cards, sync, reports, addMessage } = await setup()
    const id = await addMessage(['not-a-location'])
    await cards.updateMessage(id, { mailIsRead: false })
    await sync.applyChange(id, { mailIsRead: false })
    expect(reports).toEqual(['mail change dropped'])
    expect(cards.messages[0]).toMatchObject({ mailIsRead: true, mailTargetFolder: null, mailLocations: ['not-a-location'] })
  })

  it('reverts and reports a move that cannot be planned instead of dropping it silently', async () => {
    const { cards, sync, reports, addMessage, addFolder } = await setup()
    const all = await addFolder('[Gmail]/All Mail', 'all')
    const work = await addFolder('Work', 'other')
    const id = await addMessage([`40@${all}`])
    await cards.updateMessage(id, { mailTargetFolder: work })
    await sync.applyChange(id, { mailTargetFolder: work })
    expect(reports).toEqual(['mail move not possible'])
    expect(cards.messages[0]).toMatchObject({ mailTargetFolder: null, mailLocations: [`40@${all}`] })
  })
})

describe('MailboxSync folder counts', () => {
  it('refreshes the folder unread count after marking a message read', async () => {
    const { cards, sync, imap, addMessage, addFolder } = await setup()
    const inbox = await addFolder('INBOX', 'inbox')
    const id = await addMessage([`7@${inbox}`])
    await cards.updateMessage(id, { mailIsRead: true })
    imap.mailbox = { path: 'INBOX', delimiter: '/', flags: new Set(), uidValidity: 1n, uidNext: 13, exists: 12 }
    jest.spyOn(imap, 'getMailboxLock').mockImplementation(async (path) => ({ path: String(path), release: () => {} }))
    jest.spyOn(imap, 'messageFlagsAdd').mockResolvedValue(true)
    const search = jest.spyOn(imap, 'search').mockImplementation(async (query) => query.seen === false ? [3, 4] : [3, 4, 5])

    await sync.applyChange(id, { mailIsRead: true })

    expect(cards.folders.find((folder) => folder._id === inbox)).toMatchObject({ mailUnread: 2, mailTotal: 3 })
    for (const [query] of search.mock.calls) expect(query.since).toBeInstanceOf(Date)
  })
})

describe('MailboxSync.send', () => {
  it('attaches the draft files to the outgoing MIME', async () => {
    const { cards, sync, addMessage, addFolder } = await setup()
    await addFolder('Sent', 'sent')
    const id = await addMessage([])
    await cards.attachFile(id, { name: 'a.pdf', blob: 'b-1' as Ref<Blob>, size: 3, contentType: 'application/pdf' })
    const draft = cards.messages.find((message) => message._id === id)
    if (draft === undefined) throw new Error('draft not found')
    const blobs = new FakeAttachmentBlobs({ 'b-1': Buffer.from('pdf') })
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    const sendMail = jest.spyOn(transport, 'sendMail')
    await sync.send(draft, blobs, transport)
    const sent = sendMail.mock.calls[0][0]
    const raw = sent.raw
    const mime = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : ''
    expect(mime).toContain('filename=a.pdf')
    expect(mime).toContain('Content-Type: application/pdf')
  })
})

describe('MailboxSync.backfill', () => {
  it('runs a queued task between batches instead of making it wait for the whole backfill', async () => {
    const { sync, imap, addFolder } = await setup()
    await addFolder('INBOX', 'inbox')
    const firstBatch = Array.from({ length: 100 }, (_, i) => i + 1)
    const secondBatch = Array.from({ length: 50 }, (_, i) => i + 101)
    const events: string[] = []

    jest.spyOn(imap, 'list').mockResolvedValue([listedInbox()])
    jest.spyOn(imap, 'getMailboxLock').mockImplementation(async (path) => ({ path: String(path), release: () => {} }))
    jest.spyOn(imap, 'search').mockResolvedValue([...firstBatch, ...secondBatch])
    let fetchCalls = 0
    jest.spyOn(imap, 'fetch').mockImplementation((range) => {
      const uids = String(range).split(',').map(Number)
      fetchCalls += 1
      events.push(`fetch:${uids.length}`)
      if (fetchCalls === 1) {
        // Queued mid-first-batch: proves a body the user opens runs between batches, not after the whole backfill.
        void sync.run(async () => { events.push('queued-task') })
      }
      return (async function * (): AsyncGenerator<FetchMessageObject, false | void, undefined> {
        for (const uid of uids) yield fetchedOf(uid)
      })()
    })

    await sync.backfill()

    expect(events).toEqual(['fetch:100', 'queued-task', 'fetch:50'])
  })
})

describe('BodyFetcher', () => {
  it('skips messages without a usable location', async () => {
    const { cards, sync, addMessage } = await setup()
    await addMessage([])
    await addMessage(['not-a-location'])
    await expect(new BodyFetcher(sync, offlineImap(), cards, new NoBlobs()).fetchPending(10)).resolves.toBe(2)
  })
})
