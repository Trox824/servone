import type { MailAccountCard } from '@servone/mail'
import type { Ref } from '@hcengineering/core'
import { openImap } from '../imap'
import { MailStore } from '../store'
import { MailboxSync } from '../sync'
import { FakeMailCards } from '../__tests__/fake-cards'
import { rawMessage, startMailbox } from './harness'

async function waitFor (check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for sync')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

type TestMailbox = Awaited<ReturnType<typeof startMailbox>>

async function readySync (beforeWatch?: (mailbox: TestMailbox) => Promise<void>): Promise<{ mailbox: TestMailbox, cards: FakeMailCards, sync: MailboxSync, close: () => Promise<void> }> {
  const mailbox = await startMailbox()
  await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<p1@x>', subject: 'Đầu tiên' }))
  const cards = new FakeMailCards()
  const account: Ref<MailAccountCard> = await cards.createAccount('linh@example.vn', {
    mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'connecting',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  const imap = openImap(mailbox.login, false)
  await imap.connect()
  const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: () => {} })
  await sync.backfill()
  if (beforeWatch !== undefined) await beforeWatch(mailbox)
  await sync.watchInbox()
  // stopWatching first: it stops the IDLE re-arm loop so logout()'s own break of the current IDLE is the last one.
  return { mailbox, cards, sync, close: async () => { await sync.stopWatching(); await imap.logout() } }
}

describe('steady-state pull', () => {
  it('shows new INBOX mail within seconds through IDLE', async () => {
    const { mailbox, cards, close } = await readySync()
    await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<p2@x>', subject: 'Mới' }))
    await waitFor(() => cards.messages.some((message) => message.mailMessageId === '<p2@x>'))
    await close()
  })

  it('catches up INBOX mail that arrived between backfill and watching', async () => {
    const { cards, close } = await readySync(async (mailbox) => {
      await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<gap@x>', subject: 'Trong khoảng trống' }))
    })
    try {
      await waitFor(() => cards.messages.some((message) => message.mailMessageId === '<gap@x>'))
    } finally {
      await close()
    }
  })

  it('keeps IDLE on INBOX after a task on another folder', async () => {
    const { mailbox, cards, sync, close } = await readySync()
    try {
      const archive = cards.folders.find((folder) => folder.mailRole === 'archive')
      if (archive === undefined) throw new Error('No archive')
      await sync.run(async () => { await sync.catchUp(archive) })
      await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<after@x>', subject: 'Sau tác vụ' }))
      await waitFor(() => cards.messages.some((message) => message.mailMessageId === '<after@x>'))
    } finally {
      await close()
    }
  })

  it('follows a flag change made in the provider', async () => {
    const { mailbox, cards, close } = await readySync()
    const peer = await mailbox.peer()
    await peer.mailboxOpen('INBOX')
    await peer.messageFlagsAdd('1:*', ['\\Seen', '\\Flagged'])
    await peer.logout()
    await waitFor(() => cards.messages[0]?.mailIsRead === true && cards.messages[0]?.mailIsStarred === true)
    await close()
  })

  it('drops a message deleted in the provider', async () => {
    const { mailbox, cards, close } = await readySync()
    const peer = await mailbox.peer()
    await peer.mailboxOpen('INBOX')
    await peer.messageDelete('1:*')
    await peer.logout()
    await waitFor(() => cards.messages.length === 0)
    await close()
  })

  it('picks up other folders on poll', async () => {
    const { mailbox, cards, sync, close } = await readySync()
    await mailbox.appendRaw('Archive', rawMessage({ messageId: '<p3@x>', subject: 'Lưu trữ' }))
    await sync.pollAll()
    expect(cards.messages.some((message) => message.mailMessageId === '<p3@x>')).toBe(true)
    await close()
  })

  it('resyncs a folder whose UIDVALIDITY changed without duplicating cards', async () => {
    const { cards, sync, close } = await readySync()
    const inbox = cards.folders.find((folder) => folder.mailRole === 'inbox')
    if (inbox === undefined) throw new Error('No inbox')
    await cards.updateFolder(inbox._id, { mailUidValidity: 1 })
    await sync.run(async () => { await sync.catchUp(inbox) })
    expect(cards.messages).toHaveLength(1)
    expect(cards.messages[0].mailLocations).toHaveLength(1)
    await close()
  })
})
