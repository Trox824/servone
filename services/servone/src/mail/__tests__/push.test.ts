import core, { type Doc, type PersonId, type Ref, type Space, TxFactory } from '@hcengineering/core'
import { MAIL_MESSAGE_CLASS, MAIL_THREAD_CLASS, type MailFolderCard, type MailMessageCard } from '@servone/mail'
import { readMessageChange } from '../push'

const USER = 'social-linh' as PersonId
const SPACE = 'servone:space:Mailbox:acc' as Ref<Space>

describe('readMessageChange', () => {
  it('reads a read/star/move change made by a user', () => {
    const tx = new TxFactory(USER).createTxUpdateDoc(MAIL_MESSAGE_CLASS, SPACE, 'm1' as Ref<MailMessageCard>, {
      mailIsRead: true, mailTargetFolder: 'trash' as Ref<MailFolderCard>, mailSnippet: 'ignored'
    })
    expect(readMessageChange(tx)).toEqual({ message: 'm1', space: SPACE, change: { mailIsRead: true, mailTargetFolder: 'trash' } })
  })

  it('ignores changes written by the sync service itself', () => {
    const tx = new TxFactory(core.account.System).createTxUpdateDoc(MAIL_MESSAGE_CLASS, SPACE, 'm1' as Ref<MailMessageCard>, { mailIsRead: true })
    expect(readMessageChange(tx)).toBeUndefined()
  })

  it('ignores other classes and changes with no IMAP meaning', () => {
    expect(readMessageChange(new TxFactory(USER).createTxUpdateDoc(MAIL_THREAD_CLASS, SPACE, 't1' as Ref<Doc>, { mailSnippet: 'x' }))).toBeUndefined()
    expect(readMessageChange(new TxFactory(USER).createTxUpdateDoc(MAIL_MESSAGE_CLASS, SPACE, 'm1' as Ref<MailMessageCard>, { mailSnippet: 'x' }))).toBeUndefined()
  })
})
