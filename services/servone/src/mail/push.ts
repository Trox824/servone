import core, { type Ref, type Space, type Tx, type TxUpdateDoc, type Doc } from '@hcengineering/core'
import { MAIL_MESSAGE_CLASS, type MailFolderCard, type MailMessageCard, type MessageChange } from '@servone/mail'

function isMessageUpdate (tx: Tx): tx is TxUpdateDoc<Doc> {
  return tx._class === core.class.TxUpdateDoc && Reflect.get(tx, 'objectClass') === MAIL_MESSAGE_CLASS
}

// Parses the queue's untyped tx at the boundary: only the four intent fields matter to IMAP.
export function readMessageChange (tx: Tx): { message: Ref<MailMessageCard>, space: Ref<Space>, change: MessageChange } | undefined {
  if (!isMessageUpdate(tx) || tx.modifiedBy === core.account.System) return undefined
  const operations = tx.operations
  const change: MessageChange = {}
  const isRead: unknown = Reflect.get(operations, 'mailIsRead')
  if (typeof isRead === 'boolean') change.mailIsRead = isRead
  const isStarred: unknown = Reflect.get(operations, 'mailIsStarred')
  if (typeof isStarred === 'boolean') change.mailIsStarred = isStarred
  const target: unknown = Reflect.get(operations, 'mailTargetFolder')
  if (typeof target === 'string') change.mailTargetFolder = target as Ref<MailFolderCard>
  if (Reflect.get(operations, 'mailIsDeleted') === true) change.mailIsDeleted = true
  if (Object.keys(change).length === 0) return undefined
  return { message: tx.objectId as Ref<MailMessageCard>, space: tx.objectSpace, change }
}
