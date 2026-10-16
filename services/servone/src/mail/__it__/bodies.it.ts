import type { Blob, Ref } from '@hcengineering/core'
import { openImap } from '../imap'
import { BodyFetcher } from '../bodies'
import type { BlobStore } from '../blobs'
import { MailStore } from '../store'
import { MailboxSync } from '../sync'
import { FakeMailCards } from '../__tests__/fake-cards'
import { startMailbox } from './harness'

class MemoryBlobs implements BlobStore {
  stored = new Map<string, { content: Buffer, contentType: string }>()
  async put (content: Buffer, contentType: string): Promise<Ref<Blob>> {
    const id = `blob-${this.stored.size}` as Ref<Blob>
    this.stored.set(id, { content, contentType })
    return id
  }

  async read (blob: Ref<Blob>): Promise<Buffer> {
    return this.stored.get(blob)?.content ?? Buffer.alloc(0)
  }

  async remove (blobs: Array<Ref<Blob>>): Promise<void> {
    for (const blob of blobs) this.stored.delete(blob)
  }
}

const WITH_PDF = [
  'Message-ID: <b1@x>', 'Date: ' + new Date().toUTCString(), 'From: khach@example.vn', 'To: linh@example.vn', 'Subject: Hợp đồng',
  'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="XX"', '',
  '--XX', 'Content-Type: text/html; charset=utf-8', '', '<p>Chào anh, gửi hợp đồng.</p>',
  '--XX', 'Content-Type: application/pdf; name="hop-dong.pdf"', 'Content-Disposition: attachment; filename="hop-dong.pdf"',
  'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-1.4 test').toString('base64'), '--XX--', ''
].join('\r\n')

describe('bodies', () => {
  it('stores HTML, snippet and attachments', async () => {
    const mailbox = await startMailbox()
    await mailbox.appendRaw('INBOX', WITH_PDF)
    const cards = new FakeMailCards()
    const account = await cards.createAccount('linh@example.vn', {
      mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'connecting',
      mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
    })
    const imap = openImap(mailbox.login, false)
    await imap.connect()
    const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: () => {} })
    await sync.backfill()
    const blobs = new MemoryBlobs()
    const fetched = await new BodyFetcher(sync, imap, cards, blobs).fetchPending(10)
    await imap.logout()

    expect(fetched).toBe(1)
    const message = cards.messages[0]
    expect(message.mailSnippet).toBe('Chào anh, gửi hợp đồng.')
    expect(cards.threads[0].mailSnippet).toBe('Chào anh, gửi hợp đồng.')
    expect(blobs.stored.get(message.mailBodyBlob)?.contentType).toBe('text/html')
    expect(cards.files.map((entry) => entry.file.name)).toEqual(['hop-dong.pdf'])
  })

  it('leaves the message pending when the blob store fails', async () => {
    const mailbox = await startMailbox()
    await mailbox.appendRaw('INBOX', WITH_PDF)
    const cards = new FakeMailCards()
    const account = await cards.createAccount('linh@example.vn', {
      mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'connecting',
      mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
    })
    const imap = openImap(mailbox.login, false)
    await imap.connect()
    const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: () => {} })
    await sync.backfill()
    // Fails past the parse step, so this proves a storage error propagates instead of being recorded as "unparseable".
    class FailingBlobs implements BlobStore {
      async put (): Promise<Ref<Blob>> { throw new Error('storage unavailable') }
      async read (): Promise<Buffer> { return Buffer.alloc(0) }
      async remove (): Promise<void> {}
    }
    await expect(new BodyFetcher(sync, imap, cards, new FailingBlobs()).fetchPending(10)).rejects.toThrow('storage unavailable')
    await imap.logout()

    const message = cards.messages[0]
    expect(message.mailBodyBlob).toBe('')
    expect(message.mailRawBlob).toBe('')
  })
})
