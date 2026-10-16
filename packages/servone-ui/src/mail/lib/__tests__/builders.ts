import type { MarkupBlobRef, PersonId, Rank, Ref, Space } from '@hcengineering/core'
import { MAIL_ACCOUNT_TYPE, MAIL_FOLDER_TYPE, MAIL_MESSAGE_TYPE, MAIL_THREAD_TYPE } from '@servone/mail'
import type { MailAccountCard, MailFolderCard, MailMessageCard, MailThreadCard } from '@servone/mail'

const cardDefaults = {
  space: 'servone:space:test-mailbox' as Ref<Space>,
  modifiedOn: 0,
  modifiedBy: 'test-user' as PersonId,
  content: '' as MarkupBlobRef,
  blobs: {},
  parentInfo: [],
  rank: '0' as Rank
}

export function account (override: Partial<MailAccountCard> = {}): MailAccountCard {
  const base: MailAccountCard = {
    ...cardDefaults,
    _id: 'account-1' as Ref<MailAccountCard>,
    _class: MAIL_ACCOUNT_TYPE,
    title: 'Test account',
    mailEmail: 'user@example.com',
    mailDisplayName: 'Test User',
    mailProvider: 'gmail',
    mailAuthKind: 'password',
    mailStatus: 'ready',
    mailLastError: '',
    mailBackfillDone: 0,
    mailBackfillTotal: 0,
    mailLastSyncAt: 0
  }
  return { ...base, ...override }
}

export function folder (override: Partial<MailFolderCard> = {}): MailFolderCard {
  const base: MailFolderCard = {
    ...cardDefaults,
    _id: 'folder-1' as Ref<MailFolderCard>,
    _class: MAIL_FOLDER_TYPE,
    title: 'Inbox',
    mailAccount: 'account-1' as Ref<MailAccountCard>,
    mailPath: 'INBOX',
    mailRole: 'inbox',
    mailUidValidity: 1,
    mailHighestModSeq: '0',
    mailUnread: 0,
    mailTotal: 0
  }
  return { ...base, ...override }
}

export function thread (override: Partial<MailThreadCard> = {}): MailThreadCard {
  const base: MailThreadCard = {
    ...cardDefaults,
    _id: 'thread-1' as Ref<MailThreadCard>,
    _class: MAIL_THREAD_TYPE,
    title: 'Test thread',
    mailAccount: 'account-1' as Ref<MailAccountCard>,
    mailSubjectKey: 'test thread',
    mailParticipants: ['a@example.com'],
    mailLastMessageAt: 0,
    mailSnippet: '',
    mailFolders: ['folder-1' as Ref<MailFolderCard>],
    mailHasUnread: false,
    mailIsStarred: false,
    mailHasAttachments: false,
    mailMessageCount: 1,
    mailProviderThreadId: 'provider-thread-1'
  }
  return { ...base, ...override }
}

export function message (override: Partial<MailMessageCard> = {}): MailMessageCard {
  const base: MailMessageCard = {
    ...cardDefaults,
    _id: 'message-1' as Ref<MailMessageCard>,
    _class: MAIL_MESSAGE_TYPE,
    title: 'Test message',
    mailThread: 'thread-1' as Ref<MailThreadCard>,
    mailMessageId: '<message-1@example.com>',
    mailInReplyTo: '',
    mailReferences: [],
    mailFrom: 'a@example.com',
    mailTo: ['b@example.com'],
    mailCc: [],
    mailBcc: [],
    mailSentAt: 0,
    mailSnippet: '',
    mailIsRead: false,
    mailIsStarred: false,
    mailIsDraft: false,
    mailLocations: [],
    mailFolders: ['folder-1' as Ref<MailFolderCard>],
    mailProviderMessageId: 'provider-message-1',
    mailBodyBlob: '',
    mailRawBlob: '',
    mailHasAttachments: false,
    mailTargetFolder: null,
    mailIsDeleted: false
  }
  return { ...base, ...override }
}
