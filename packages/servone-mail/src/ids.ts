import type { CardSpace, MasterTag } from '@hcengineering/card'
import type { AccountUuid, Class, Doc, Ref } from '@hcengineering/core'
import type { MailAccountCard, MailFolderCard, MailMessageCard, MailThreadCard } from './fields'

const ACCOUNT_ID = 'servone:type:MailAccount'
const FOLDER_ID = 'servone:type:MailFolder'
const THREAD_ID = 'servone:type:MailThread'
const MESSAGE_ID = 'servone:type:MailMessage'

export const MAIL_ACCOUNT_TYPE = ACCOUNT_ID as Ref<MasterTag>
export const MAIL_FOLDER_TYPE = FOLDER_ID as Ref<MasterTag>
export const MAIL_THREAD_TYPE = THREAD_ID as Ref<MasterTag>
export const MAIL_MESSAGE_TYPE = MESSAGE_ID as Ref<MasterTag>
export const MAIL_TYPES = [MAIL_ACCOUNT_TYPE, MAIL_FOLDER_TYPE, MAIL_THREAD_TYPE, MAIL_MESSAGE_TYPE]

// The same ids typed by card shape, for queries and creates.
export const MAIL_ACCOUNT_CLASS = ACCOUNT_ID as Ref<Class<MailAccountCard>>
export const MAIL_FOLDER_CLASS = FOLDER_ID as Ref<Class<MailFolderCard>>
export const MAIL_THREAD_CLASS = THREAD_ID as Ref<Class<MailThreadCard>>
export const MAIL_MESSAGE_CLASS = MESSAGE_ID as Ref<Class<MailMessageCard>>

export const MAIL_TYPE_NAMES = new Map<Ref<MasterTag>, string>([
  [MAIL_ACCOUNT_TYPE, 'Hộp thư'],
  [MAIL_FOLDER_TYPE, 'Thư mục thư'],
  [MAIL_THREAD_TYPE, 'Chuỗi thư'],
  [MAIL_MESSAGE_TYPE, 'Thư']
])

export function mailboxSpaceId (owner: AccountUuid): Ref<CardSpace> {
  return `servone:space:Mailbox:${owner}` as Ref<CardSpace>
}

// Serializes the first-use schema creation on one transactor, like APPLY_SCOPE in servone-config.
export const MAIL_APPLY_SCOPE = 'servone-mail'

// Registered client-side by packages/servone-ui/src/mail/install.ts; the model only holds the ids.
export const MAIL_PLUGIN_ID = 'servone-mail'
export const MAIL_APP_ID = 'servone:app:Mail' as Ref<Doc>
export const MAIL_APP_ALIAS = 'mail'
export const MAIL_APP_LABEL = `${MAIL_PLUGIN_ID}:string:Mail`
export const MAIL_APP_ICON = `${MAIL_PLUGIN_ID}:icon:mail`
export const MAIL_APP_COMPONENT = `${MAIL_PLUGIN_ID}:component:MailApp`
