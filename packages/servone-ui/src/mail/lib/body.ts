import type { Ref } from '@hcengineering/core'
import type { MailMessageCard } from '@servone/mail'

export type BodyState =
  | { kind: 'pending' }
  | { kind: 'html', html: string }
  | { kind: 'raw', rawBlob: string }
  | { kind: 'empty' }
  | { kind: 'failed' }
  | { kind: 'unavailable' }

export class BodyFetchError extends Error {
  constructor (readonly status: number) {
    super(`mail body fetch failed: ${status}`)
  }
}

export async function readBodyResponse (response: Pick<Response, 'ok' | 'status' | 'text'>): Promise<string> {
  if (!response.ok) throw new BodyFetchError(response.status)
  return await response.text()
}

export function bodyStateOf (message: Pick<MailMessageCard, 'mailBodyBlob' | 'mailRawBlob'>): 'pending' | 'blob' | 'raw' {
  if (message.mailBodyBlob !== '') return 'blob'
  if (message.mailRawBlob !== '') return 'raw'
  return 'pending'
}

export async function loadBody (
  message: Pick<MailMessageCard, '_id' | 'mailBodyBlob' | 'mailRawBlob'>,
  fetchText: (blob: string) => Promise<string>,
  fetchNow: (id: Ref<MailMessageCard>) => Promise<void>
): Promise<BodyState> {
  const state = bodyStateOf(message)
  if (state === 'pending') {
    await fetchNow(message._id)
    return { kind: 'pending' }
  }
  if (state === 'raw') return { kind: 'raw', rawBlob: message.mailRawBlob }
  let html: string
  try {
    html = await fetchText(message.mailBodyBlob)
  } catch (error) {
    if (!(error instanceof BodyFetchError)) throw error
    return message.mailRawBlob !== '' ? { kind: 'raw', rawBlob: message.mailRawBlob } : { kind: 'failed' }
  }
  return html === '' ? { kind: 'empty' } : { kind: 'html', html }
}

export function nonDraftMessages (messages: MailMessageCard[]): MailMessageCard[] {
  return messages.filter((message) => !message.mailIsDraft && !message.mailIsDeleted)
}

export function draftMessages (messages: MailMessageCard[]): MailMessageCard[] {
  return messages.filter((message) => message.mailIsDraft && !message.mailIsDeleted)
}

export function newestMessage (messages: MailMessageCard[]): MailMessageCard | undefined {
  return messages.reduce<MailMessageCard | undefined>(
    (newest, message) => (newest === undefined || message.mailSentAt > newest.mailSentAt ? message : newest),
    undefined
  )
}

export function latestNonDraftMessage (messages: MailMessageCard[]): MailMessageCard | undefined {
  return newestMessage(nonDraftMessages(messages))
}

export function initiallyExpanded (messages: MailMessageCard[]): Set<Ref<MailMessageCard>> {
  if (messages.length === 0) return new Set()
  const bySentAt = [...messages].sort((a, b) => a.mailSentAt - b.mailSentAt)
  const firstUnread = bySentAt.find((message) => !message.mailIsRead)
  const expanded = firstUnread ?? bySentAt[bySentAt.length - 1]
  return new Set([expanded._id])
}

const MAX_CACHED_BODIES = 50

export const bodyCache = new Map<Ref<MailMessageCard>, string>()

export function cacheBody (id: Ref<MailMessageCard>, html: string): void {
  bodyCache.delete(id)
  bodyCache.set(id, html)
  if (bodyCache.size > MAX_CACHED_BODIES) {
    const [oldest] = bodyCache.keys()
    bodyCache.delete(oldest)
  }
}
