import type { Ref } from '@hcengineering/core'
import type { MailAccountCard, MailMessageCard, MailMessageFields, MailThreadCard } from '@servone/mail'
import type { ComposeMode } from './compose'
import type { StringKey } from '../strings'

export interface DraftFields {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  html: string
  inReplyTo: string
  references: string[]
}

function snippetFromHtml (html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function sameList (previous: string[], next: string[]): boolean {
  return previous.length === next.length && previous.every((value, index) => value === next[index])
}

export function draftCardFields (account: MailAccountCard, thread: Ref<MailThreadCard>, fields: DraftFields, bodyBlob: string): MailMessageFields {
  const mailFrom = account.mailDisplayName !== '' ? `${account.mailDisplayName} <${account.mailEmail}>` : account.mailEmail
  return {
    mailThread: thread,
    mailMessageId: '',
    mailInReplyTo: fields.inReplyTo,
    mailReferences: fields.references,
    mailFrom,
    mailTo: fields.to,
    mailCc: fields.cc,
    mailBcc: fields.bcc,
    mailSentAt: Date.now(),
    mailSnippet: snippetFromHtml(fields.html),
    mailIsRead: true,
    mailIsStarred: false,
    mailIsDraft: true,
    mailLocations: [],
    mailFolders: [],
    mailProviderMessageId: '',
    mailBodyBlob: bodyBlob,
    mailRawBlob: '',
    mailHasAttachments: false,
    mailTargetFolder: null,
    mailIsDeleted: false
  }
}

export function draftChanges (previous: MailMessageCard, fields: DraftFields, bodyBlob: string): Partial<MailMessageFields> & { title?: string } {
  const changes: Partial<MailMessageFields> & { title?: string } = {}
  if (previous.mailBodyBlob !== bodyBlob) changes.mailBodyBlob = bodyBlob
  const snippet = snippetFromHtml(fields.html)
  if (previous.mailSnippet !== snippet) changes.mailSnippet = snippet
  if (!sameList(previous.mailTo, fields.to)) changes.mailTo = fields.to
  if (!sameList(previous.mailCc, fields.cc)) changes.mailCc = fields.cc
  if (!sameList(previous.mailBcc, fields.bcc)) changes.mailBcc = fields.bcc
  if (previous.title !== fields.subject) changes.title = fields.subject
  if (previous.mailInReplyTo !== fields.inReplyTo) changes.mailInReplyTo = fields.inReplyTo
  if (!sameList(previous.mailReferences, fields.references)) changes.mailReferences = fields.references
  return changes
}

export type DiscardStep = 'markDeleted' | 'removeCard' | 'removeCardAndThread'

export function discardStep (draft: Pick<MailMessageCard, 'mailLocations'>, otherMessagesInThread: number): DiscardStep {
  if (draft.mailLocations.length > 0) return 'markDeleted'
  return otherMessagesInThread === 0 ? 'removeCardAndThread' : 'removeCard'
}

export function totalAttachmentBytes (sizes: number[]): number {
  return sizes.reduce((sum, size) => sum + size, 0)
}

export type DraftBodyLoad = 'loading' | 'ready' | 'failed'

export type DraftBodySource = 'blob' | 'provider' | 'unreadable' | 'none'

export function draftBodySource (draft: Pick<MailMessageCard, 'mailBodyBlob' | 'mailRawBlob' | 'mailLocations'>): DraftBodySource {
  if (draft.mailBodyBlob !== '') return 'blob'
  if (draft.mailRawBlob !== '') return 'unreadable'
  if (draft.mailLocations.length > 0) return 'provider'
  return 'none'
}

export function canSendDraft (load: DraftBodyLoad, isSending: boolean): boolean {
  return load === 'ready' && !isSending
}

export function discardNeedsConfirm (isBodyEmpty: boolean, load: DraftBodyLoad): boolean {
  return !isBodyEmpty || load !== 'ready'
}

export function continuedDraftMode (draft: Pick<MailMessageCard, 'mailInReplyTo'>, hasThreadMessages: boolean): ComposeMode {
  if (draft.mailInReplyTo !== '') return 'reply'
  return hasThreadMessages ? 'forward' : 'new'
}
