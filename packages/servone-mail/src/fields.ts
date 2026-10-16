import type { Card, MasterTag } from '@hcengineering/card'
import type { Data, MarkupBlobRef, PropertyType, Ref, Type } from '@hcengineering/core'
import { ArrOf, TypeBoolean, TypeNumber, TypeRef, TypeString } from '@hcengineering/model'
import { MAIL_ACCOUNT_TYPE, MAIL_FOLDER_TYPE, MAIL_MESSAGE_TYPE, MAIL_THREAD_TYPE } from './ids'
import type { AccountStatus, AuthKind, FolderRole, ProviderId } from './types'

export interface MailAccountFields {
  mailEmail: string
  mailDisplayName: string
  mailProvider: ProviderId
  mailAuthKind: AuthKind
  mailStatus: AccountStatus
  mailLastError: string
  mailBackfillDone: number
  mailBackfillTotal: number
  mailLastSyncAt: number
}

export interface MailFolderFields {
  mailAccount: Ref<MailAccountCard>
  mailPath: string
  mailRole: FolderRole
  mailUidValidity: number
  // IMAP modseq is 63-bit; a JS number loses precision past 2^53.
  mailHighestModSeq: string
  mailUnread: number
  mailTotal: number
}

export interface MailThreadFields {
  mailAccount: Ref<MailAccountCard>
  mailSubjectKey: string
  mailParticipants: string[]
  mailLastMessageAt: number
  mailSnippet: string
  mailFolders: Array<Ref<MailFolderCard>>
  mailHasUnread: boolean
  mailIsStarred: boolean
  mailHasAttachments: boolean
  mailMessageCount: number
  mailProviderThreadId: string
}

export interface MailMessageFields {
  mailThread: Ref<MailThreadCard>
  mailMessageId: string
  mailInReplyTo: string
  mailReferences: string[]
  mailFrom: string
  mailTo: string[]
  mailCc: string[]
  mailBcc: string[]
  mailSentAt: number
  mailSnippet: string
  mailIsRead: boolean
  mailIsStarred: boolean
  mailIsDraft: boolean
  mailLocations: string[]
  mailFolders: Array<Ref<MailFolderCard>>
  mailProviderMessageId: string
  mailBodyBlob: string
  mailRawBlob: string
  mailHasAttachments: boolean
  mailTargetFolder: Ref<MailFolderCard> | null
  mailIsDeleted: boolean
}

export interface MailAccountCard extends Card, MailAccountFields {}
export interface MailFolderCard extends Card, MailFolderFields {}
export interface MailThreadCard extends Card, MailThreadFields {}
export interface MailMessageCard extends Card, MailMessageFields {}

// Same empty content as createCard in plugins/card-resources/src/utils.ts.
export const EMPTY_CONTENT = '' as MarkupBlobRef

export function cardBase (title: string): Data<Card> {
  return { title, content: EMPTY_CONTENT, blobs: {}, parentInfo: [], rank: '' }
}

export interface MailAttribute {
  owner: Ref<MasterTag>
  name: string
  label: string
  type: Type<PropertyType>
}

interface FieldSpec<F> {
  name: keyof F & string
  label: string
  type: Type<PropertyType>
}

function specsOf<F> (owner: Ref<MasterTag>, specs: Array<FieldSpec<F>>): MailAttribute[] {
  return specs.map((spec) => ({ owner, name: spec.name, label: spec.label, type: spec.type }))
}

const ACCOUNT_FIELDS: Array<FieldSpec<MailAccountFields>> = [
  { name: 'mailEmail', label: 'Địa chỉ email', type: TypeString() },
  { name: 'mailDisplayName', label: 'Tên hiển thị', type: TypeString() },
  { name: 'mailProvider', label: 'Nhà cung cấp', type: TypeString() },
  { name: 'mailAuthKind', label: 'Cách đăng nhập', type: TypeString() },
  { name: 'mailStatus', label: 'Trạng thái', type: TypeString() },
  { name: 'mailLastError', label: 'Lỗi gần nhất', type: TypeString() },
  { name: 'mailBackfillDone', label: 'Đã tải', type: TypeNumber() },
  { name: 'mailBackfillTotal', label: 'Cần tải', type: TypeNumber() },
  { name: 'mailLastSyncAt', label: 'Đồng bộ lần cuối', type: TypeNumber() }
]

const FOLDER_FIELDS: Array<FieldSpec<MailFolderFields>> = [
  { name: 'mailAccount', label: 'Hộp thư', type: TypeRef(MAIL_ACCOUNT_TYPE) },
  { name: 'mailPath', label: 'Đường dẫn IMAP', type: TypeString() },
  { name: 'mailRole', label: 'Vai trò', type: TypeString() },
  { name: 'mailUidValidity', label: 'UIDVALIDITY', type: TypeNumber() },
  { name: 'mailHighestModSeq', label: 'MODSEQ', type: TypeString() },
  { name: 'mailUnread', label: 'Chưa đọc', type: TypeNumber() },
  { name: 'mailTotal', label: 'Tổng số thư', type: TypeNumber() }
]

const THREAD_FIELDS: Array<FieldSpec<MailThreadFields>> = [
  { name: 'mailAccount', label: 'Hộp thư', type: TypeRef(MAIL_ACCOUNT_TYPE) },
  { name: 'mailSubjectKey', label: 'Khóa tiêu đề', type: TypeString() },
  { name: 'mailParticipants', label: 'Người tham gia', type: ArrOf(TypeString()) },
  { name: 'mailLastMessageAt', label: 'Thư mới nhất', type: TypeNumber() },
  { name: 'mailSnippet', label: 'Trích đoạn', type: TypeString() },
  { name: 'mailFolders', label: 'Thư mục', type: ArrOf(TypeRef(MAIL_FOLDER_TYPE)) },
  { name: 'mailHasUnread', label: 'Có thư chưa đọc', type: TypeBoolean() },
  { name: 'mailIsStarred', label: 'Gắn sao', type: TypeBoolean() },
  { name: 'mailHasAttachments', label: 'Có tệp đính kèm', type: TypeBoolean() },
  { name: 'mailMessageCount', label: 'Số thư', type: TypeNumber() },
  { name: 'mailProviderThreadId', label: 'Mã chuỗi của nhà cung cấp', type: TypeString() }
]

const MESSAGE_FIELDS: Array<FieldSpec<MailMessageFields>> = [
  { name: 'mailThread', label: 'Chuỗi thư', type: TypeRef(MAIL_THREAD_TYPE) },
  { name: 'mailMessageId', label: 'Message-ID', type: TypeString() },
  { name: 'mailInReplyTo', label: 'In-Reply-To', type: TypeString() },
  { name: 'mailReferences', label: 'References', type: ArrOf(TypeString()) },
  { name: 'mailFrom', label: 'Người gửi', type: TypeString() },
  { name: 'mailTo', label: 'Người nhận', type: ArrOf(TypeString()) },
  { name: 'mailCc', label: 'Cc', type: ArrOf(TypeString()) },
  { name: 'mailBcc', label: 'Bcc', type: ArrOf(TypeString()) },
  { name: 'mailSentAt', label: 'Thời gian gửi', type: TypeNumber() },
  { name: 'mailSnippet', label: 'Trích đoạn', type: TypeString() },
  { name: 'mailIsRead', label: 'Đã đọc', type: TypeBoolean() },
  { name: 'mailIsStarred', label: 'Gắn sao', type: TypeBoolean() },
  { name: 'mailIsDraft', label: 'Thư nháp', type: TypeBoolean() },
  { name: 'mailLocations', label: 'Vị trí IMAP', type: ArrOf(TypeString()) },
  { name: 'mailFolders', label: 'Thư mục', type: ArrOf(TypeRef(MAIL_FOLDER_TYPE)) },
  { name: 'mailProviderMessageId', label: 'Mã thư của nhà cung cấp', type: TypeString() },
  { name: 'mailBodyBlob', label: 'Nội dung', type: TypeString() },
  { name: 'mailRawBlob', label: 'Bản gốc', type: TypeString() },
  { name: 'mailHasAttachments', label: 'Có tệp đính kèm', type: TypeBoolean() },
  { name: 'mailTargetFolder', label: 'Chuyển tới', type: TypeRef(MAIL_FOLDER_TYPE) },
  { name: 'mailIsDeleted', label: 'Xóa vĩnh viễn', type: TypeBoolean() }
]

export const MAIL_ATTRIBUTES: MailAttribute[] = [
  ...specsOf(MAIL_ACCOUNT_TYPE, ACCOUNT_FIELDS),
  ...specsOf(MAIL_FOLDER_TYPE, FOLDER_FIELDS),
  ...specsOf(MAIL_THREAD_TYPE, THREAD_FIELDS),
  ...specsOf(MAIL_MESSAGE_TYPE, MESSAGE_FIELDS)
]
