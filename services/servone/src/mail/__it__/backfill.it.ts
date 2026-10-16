import { openImap } from '../imap'
import { MailStore } from '../store'
import { MailboxSync } from '../sync'
import { FakeMailCards } from '../__tests__/fake-cards'
import { rawMessage, startMailbox } from './harness'

const DAY = 24 * 60 * 60 * 1000

async function syncFor (mailbox: Awaited<ReturnType<typeof startMailbox>>): Promise<{ cards: FakeMailCards, sync: MailboxSync, close: () => Promise<void> }> {
  const cards = new FakeMailCards()
  const account = await cards.createAccount('linh@example.vn', {
    mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'connecting',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  const imap = openImap(mailbox.login, false)
  await imap.connect()
  const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: () => {} })
  return { cards, sync, close: async () => { await imap.logout() } }
}

describe('backfill', () => {
  it('brings in the last 30 days, threaded, with roles and flags', async () => {
    const mailbox = await startMailbox()
    await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<a1@x>', subject: 'Báo giá' }))
    await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<a2@x>', subject: 'Cũ', date: new Date(Date.now() - 40 * DAY) }), [], new Date(Date.now() - 40 * DAY))
    await mailbox.appendRaw('Sent', rawMessage({ messageId: '<a3@x>', subject: 'Re: Báo giá', from: 'linh@example.vn', to: 'khach@example.vn', inReplyTo: '<a1@x>' }), ['\\Seen'])
    const { cards, sync, close } = await syncFor(mailbox)
    await sync.backfill()
    await close()

    expect(cards.folders.map((folder) => folder.mailRole).sort()).toEqual(['archive', 'drafts', 'inbox', 'sent', 'spam', 'trash'])
    expect(cards.messages.map((message) => message.mailMessageId).sort()).toEqual(['<a1@x>', '<a3@x>'])
    expect(cards.threads).toHaveLength(1)
    expect(cards.threads[0].mailMessageCount).toBe(2)
    expect(cards.messages.find((message) => message.mailMessageId === '<a3@x>')?.mailIsRead).toBe(true)
    expect(cards.accounts[0]).toMatchObject({ mailStatus: 'ready', mailBackfillDone: 2, mailBackfillTotal: 2 })
  })

  it('decodes MIME-encoded Vietnamese subjects and names', async () => {
    const mailbox = await startMailbox()
    await mailbox.appendRaw('INBOX', rawMessage({
      messageId: '<v1@x>',
      subject: '=?UTF-8?B?QsOhbyBnacOhIHRow6FuZyAxMA==?=',
      from: '=?UTF-8?Q?Nguy=E1=BB=85n_Linh?= <linh@example.vn>'
    }))
    const { cards, sync, close } = await syncFor(mailbox)
    await sync.backfill()
    await close()
    expect(cards.messages[0].title).toBe('Báo giá tháng 10')
    expect(cards.messages[0].mailFrom).toBe('Nguyễn Linh <linh@example.vn>')
  })

  it('keeps one card for an email copied into two folders', async () => {
    const mailbox = await startMailbox()
    await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<c1@x>', subject: 'Hợp đồng' }))
    await mailbox.appendRaw('Archive', rawMessage({ messageId: '<c1@x>', subject: 'Hợp đồng' }))
    const { cards, sync, close } = await syncFor(mailbox)
    await sync.backfill()
    await close()
    expect(cards.messages).toHaveLength(1)
    expect(cards.messages[0].mailLocations).toHaveLength(2)
  })

  it('drops the messages of a folder deleted in the provider', async () => {
    const mailbox = await startMailbox()
    const peer = await mailbox.peer()
    try {
      await peer.mailboxCreate('Khach')
      await mailbox.appendRaw('Khach', rawMessage({ messageId: '<k1@x>', subject: 'Khách hàng' }))
      const { cards, sync, close } = await syncFor(mailbox)
      try {
        await sync.backfill()
        expect(cards.messages).toHaveLength(1)
        await peer.mailboxDelete('Khach')
        await sync.run(async () => await sync.syncFolders())
        expect(cards.folders.some((folder) => folder.mailPath === 'Khach')).toBe(false)
        expect(cards.messages).toHaveLength(0)
        expect(cards.threads).toHaveLength(0)
      } finally {
        await close()
      }
    } finally {
      await peer.logout()
    }
  })

  it('does not duplicate anything when run twice', async () => {
    const mailbox = await startMailbox()
    await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<d1@x>', subject: 'Một' }))
    await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<d2@x>', subject: 'Hai' }))
    const { cards, sync, close } = await syncFor(mailbox)
    await sync.backfill()
    await sync.backfill()
    await close()
    expect(cards.messages).toHaveLength(2)
    expect(cards.threads).toHaveLength(2)
    expect(cards.folders).toHaveLength(6)
  })
})
