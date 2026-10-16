import type { Blob, Ref } from '@hcengineering/core'
import type { MailAccountCard, MailMessageCard } from '@servone/mail'
import type { BlobStore } from '../blobs'
import { openImap } from '../imap'
import { createSmtpTransport } from '../smtp'
import { MailStore } from '../store'
import { MailboxSync } from '../sync'
import { FakeMailCards } from '../__tests__/fake-cards'
import { rawMessage, startMailbox, startSmtpCapture } from './harness'

class MemoryBlobs implements BlobStore {
  stored = new Map<string, Buffer>()
  async put (content: Buffer, _contentType: string): Promise<Ref<Blob>> { const id = `b${this.stored.size}` as Ref<Blob>; this.stored.set(id, content); return id }
  async read (blob: Ref<Blob>): Promise<Buffer> { return this.stored.get(blob) ?? Buffer.alloc(0) }
  async remove (blobs: Array<Ref<Blob>>): Promise<void> { for (const blob of blobs) this.stored.delete(blob) }
}

async function countIn (mailbox: Awaited<ReturnType<typeof startMailbox>>, path: string): Promise<number> {
  const peer = await mailbox.peer()
  const status = await peer.status(path, { messages: true })
  await peer.logout()
  return status.messages ?? 0
}

async function setup (): Promise<{
  mailbox: Awaited<ReturnType<typeof startMailbox>>, smtp: Awaited<ReturnType<typeof startSmtpCapture>>, cards: FakeMailCards, sync: MailboxSync,
  blobs: MemoryBlobs, reports: string[], draft: () => MailMessageCard, close: () => Promise<void>
}> {
  const mailbox = await startMailbox()
  await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<s1@x>', subject: 'Báo giá' }))
  const smtp = await startSmtpCapture()
  const cards = new FakeMailCards()
  const account: Ref<MailAccountCard> = await cards.createAccount('linh@example.vn', {
    mailEmail: 'linh@example.vn', mailDisplayName: 'Linh', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'connecting',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  const imap = openImap(mailbox.login, false)
  await imap.connect()
  const reports: string[] = []
  const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: (event) => { reports.push(event) } })
  const close = async (): Promise<void> => {
    await imap.logout()
    await smtp.close()
  }
  try {
    await sync.backfill()
    const blobs = new MemoryBlobs()
    const body = await blobs.put(Buffer.from('<p>Đồng ý</p>'), 'text/html')
    const parent = cards.messages[0]
    const draftId = await cards.createMessage('Re: Báo giá', {
      ...parent, mailMessageId: '', mailInReplyTo: parent.mailMessageId, mailReferences: [parent.mailMessageId], mailFrom: 'Linh <linh@example.vn>',
      mailTo: ['khach@example.vn'], mailIsDraft: true, mailIsRead: true, mailLocations: [], mailFolders: [], mailBodyBlob: body
    })
    const draft = (): MailMessageCard => {
      const found = cards.messages.find((message) => message._id === draftId)
      if (found === undefined) throw new Error('No draft')
      return found
    }
    return { mailbox, smtp, cards, sync, blobs, reports, draft, close }
  } catch (error) {
    await close()
    throw error
  }
}

describe('send and drafts', () => {
  it('sends a threaded reply, keeps exactly one Sent copy and removes the draft', async () => {
    const { mailbox, smtp, cards, sync, blobs, draft, close } = await setup()
    try {
      const draftId = draft()._id
      await sync.saveDraft(draft(), blobs)
      expect(await countIn(mailbox, 'Drafts')).toBe(1)

      await sync.send(draft(), blobs, createSmtpTransport(smtp.login))

      expect(smtp.received).toHaveLength(1)
      expect(smtp.received[0].parsed.inReplyTo).toBe('<s1@x>')
      expect(await countIn(mailbox, 'Sent')).toBe(1)
      expect(await countIn(mailbox, 'Drafts')).toBe(0)
      expect(cards.messages.some((message) => message._id === draftId)).toBe(false)
    } finally {
      await close()
    }
  })

  it('sends once when the same draft is sent twice at the same time', async () => {
    const { mailbox, smtp, sync, blobs, draft, close } = await setup()
    try {
      const transport = createSmtpTransport(smtp.login)
      const [first, second] = await Promise.all([sync.send(draft(), blobs, transport), sync.send(draft(), blobs, transport)])
      expect(second).toBe(first)
      expect(smtp.received).toHaveLength(1)
      expect(await countIn(mailbox, 'Sent')).toBe(1)
    } finally {
      await close()
    }
  })

  it('reports a failed Sent copy without failing the send', async () => {
    const { smtp, cards, sync, blobs, reports, draft, close } = await setup()
    try {
      const draftId = draft()._id
      const sent = cards.folders.find((folder) => folder.mailRole === 'sent')
      if (sent === undefined) throw new Error('No sent')
      await cards.updateFolder(sent._id, { mailPath: 'Missing' })
      await sync.send(draft(), blobs, createSmtpTransport(smtp.login))
      expect(smtp.received).toHaveLength(1)
      expect(reports).toEqual(['mail sent copy failed'])
      expect(cards.messages.some((message) => message._id === draftId)).toBe(false)
    } finally {
      await close()
    }
  })

  it('sends a draft whose stored location is malformed', async () => {
    const { smtp, cards, sync, blobs, draft, close } = await setup()
    try {
      const draftId = draft()._id
      await cards.updateMessage(draftId, { mailLocations: ['not-a-location'] })
      await sync.send(draft(), blobs, createSmtpTransport(smtp.login))
      expect(smtp.received).toHaveLength(1)
      expect(cards.messages.some((message) => message._id === draftId)).toBe(false)
    } finally {
      await close()
    }
  })

  it('refuses before SMTP when the mailbox has no Sent folder', async () => {
    const { smtp, cards, sync, blobs, draft, close } = await setup()
    try {
      const sent = cards.folders.find((folder) => folder.mailRole === 'sent')
      if (sent === undefined) throw new Error('No sent')
      await cards.removeFolder(sent._id)
      await expect(sync.send(draft(), blobs, createSmtpTransport(smtp.login))).rejects.toThrow('Mailbox has no sent folder')
      expect(smtp.received).toHaveLength(0)
    } finally {
      await close()
    }
  })
})
