import type { Ref } from '@hcengineering/core'
import type { MailAccountCard, MailFolderCard } from '@servone/mail'
import { openImap } from '../imap'
import { MailStore } from '../store'
import { MailboxSync } from '../sync'
import { FakeMailCards } from '../__tests__/fake-cards'
import { rawMessage, startMailbox } from './harness'

async function setup (): Promise<{ mailbox: Awaited<ReturnType<typeof startMailbox>>, cards: FakeMailCards, sync: MailboxSync, folder: (role: string) => Ref<MailFolderCard>, close: () => Promise<void> }> {
  const mailbox = await startMailbox()
  await mailbox.appendRaw('INBOX', rawMessage({ messageId: '<u1@x>', subject: 'Đơn hàng' }))
  const cards = new FakeMailCards()
  const account: Ref<MailAccountCard> = await cards.createAccount('linh@example.vn', {
    mailEmail: 'linh@example.vn', mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'connecting',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  const imap = openImap(mailbox.login, false)
  await imap.connect()
  const sync = new MailboxSync({ imap, cards, store: new MailStore(cards, account), account, now: Date.now, report: () => {} })
  await sync.backfill()
  const folder = (role: string): Ref<MailFolderCard> => {
    const found = cards.folders.find((it) => it.mailRole === role)
    if (found === undefined) throw new Error(`No ${role}`)
    return found._id
  }
  return { mailbox, cards, sync, folder, close: async () => { await imap.logout() } }
}

async function flagsIn (mailbox: Awaited<ReturnType<typeof startMailbox>>, path: string): Promise<string[][]> {
  const peer = await mailbox.peer()
  const opened = await peer.mailboxOpen(path)
  const flags: string[][] = []
  // FETCH 1:* on an empty mailbox is a BAD "Invalid messageset" in Dovecot, not an empty result.
  if (opened.exists > 0) {
    for await (const message of peer.fetch('1:*', { flags: true })) flags.push([...(message.flags ?? [])].sort())
  }
  await peer.logout()
  return flags
}

describe('push', () => {
  it('marks read and starred on the server', async () => {
    const { mailbox, cards, sync, close } = await setup()
    await sync.applyChange(cards.messages[0]._id, { mailIsRead: true, mailIsStarred: true })
    await close()
    expect(await flagsIn(mailbox, 'INBOX')).toEqual([['\\Flagged', '\\Seen']])
  })

  it('archives into the archive folder and updates locations', async () => {
    const { mailbox, cards, sync, folder, close } = await setup()
    await sync.applyChange(cards.messages[0]._id, { mailTargetFolder: folder('archive') })
    await close()
    expect(await flagsIn(mailbox, 'INBOX')).toEqual([])
    expect(await flagsIn(mailbox, 'Archive')).toHaveLength(1)
    expect(cards.messages[0].mailFolders).toEqual([folder('archive')])
    expect(cards.messages[0].mailTargetFolder).toBeNull()
  })

  it('deletes forever from trash and removes the card', async () => {
    const { mailbox, cards, sync, folder, close } = await setup()
    await sync.applyChange(cards.messages[0]._id, { mailTargetFolder: folder('trash') })
    await sync.applyChange(cards.messages[0]._id, { mailIsDeleted: true })
    await close()
    expect(await flagsIn(mailbox, 'Trash')).toEqual([])
    expect(cards.messages).toHaveLength(0)
  })

  it('reverts the card and reports when the server refuses', async () => {
    const { cards, sync, close } = await setup()
    await sync.applyChange(cards.messages[0]._id, { mailTargetFolder: 'missing-folder' as Ref<MailFolderCard> })
    await close()
    expect(cards.messages[0].mailTargetFolder).toBeNull()
    expect(cards.accounts[0].mailLastError).not.toBe('')
  })
})
