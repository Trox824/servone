import type { Ref } from '@hcengineering/core'
import type { MailThreadCard } from './fields'

// Reply and forward prefixes in the languages our customers' partners write: en, vi (TR), de (AW), nordic (SV, VS), es (RV).
// Exported for the Mail UI's compose seeding (replySubject/forwardSubject), which needs the same prefix list.
export const REPLY_PREFIX = /^(\s*(re|fwd?|tr|aw|sv|vs|rv)\s*(\[\d+\])?\s*:)+/i
export const SUBJECT_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export function subjectKey (subject: string): string {
  return subject.replace(REPLY_PREFIX, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface IncomingMessage {
  messageId: string
  inReplyTo: string
  references: string[]
  subject: string
  sentAt: number
  participants: string[]
  providerThreadId: string
}

export interface ThreadLookup {
  byProviderThreadId: (id: string) => Promise<Ref<MailThreadCard> | undefined>
  byMessageIds: (ids: string[]) => Promise<Ref<MailThreadCard> | undefined>
  bySubjectKey: (key: string, since: number) => Promise<Array<{ thread: Ref<MailThreadCard>, participants: string[] }>>
}

export async function findThread (message: IncomingMessage, lookup: ThreadLookup): Promise<Ref<MailThreadCard> | undefined> {
  // Gmail's thread id is authoritative: guessing past it would merge threads Gmail keeps apart.
  if (message.providerThreadId !== '') return await lookup.byProviderThreadId(message.providerThreadId)
  const parents = [message.inReplyTo, ...[...message.references].reverse()].filter((id) => id !== '')
  if (parents.length > 0) {
    const byHeaders = await lookup.byMessageIds(parents)
    if (byHeaders !== undefined) return byHeaders
  }
  const key = subjectKey(message.subject)
  if (key === '') return undefined
  const candidates = await lookup.bySubjectKey(key, message.sentAt - SUBJECT_MATCH_WINDOW_MS)
  return candidates.find((candidate) => candidate.participants.some((email) => message.participants.includes(email)))?.thread
}
