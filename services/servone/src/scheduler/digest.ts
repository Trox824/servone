import type { Doc, Ref } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import { isWorkingTime } from '@servone/notify-rules'

import type { UserPrefs } from './settings'

const HOUR_MS = 60 * 60_000
export const DIGEST_LOOKBACK_MS = 7 * 24 * HOUR_MS
export const SNIPPET_LENGTH = 140
// Keeps a busy conversation from pushing the rest of the email out of view.
export const MAX_LINES_PER_CONVERSATION = 5

// core.class.UserStatus as the digest reads it: modifiedOn is when `online` last flipped.
export interface Presence {
  online: boolean
  modifiedOn: number
}

export function isDigestDue (
  prefs: UserPrefs,
  presence: Presence | undefined,
  now: number,
  pausedUntil: number | undefined
): boolean {
  if (prefs.digest === undefined || presence === undefined || presence.online) return false
  const wentOffline = presence.modifiedOn
  if (now - wentOffline < prefs.digest.idleHours * HOUR_MS) return false
  if (prefs.digestSentAt !== undefined && prefs.digestSentAt >= wentOffline) return false
  if (pausedUntil !== undefined && now < pausedUntil) return false
  return prefs.schedule === undefined || isWorkingTime(prefs.schedule, now)
}

export function digestSince (prefs: UserPrefs, now: number): number {
  return Math.max(prefs.digestSentAt ?? 0, now - DIGEST_LOOKBACK_MS)
}

export function toSnippet (text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= SNIPPET_LENGTH) return flat
  return `${flat.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`
}

export interface DigestEntry {
  context: Ref<DocNotifyContext>
  objectId: Ref<Doc>
  objectClass: string
  title: string
  sender: string
  text: string
  createdOn: number
}

export interface DigestLine {
  sender: string
  snippet: string
}

export interface DigestConversation {
  title: string
  objectId: Ref<Doc>
  objectClass: string
  lines: DigestLine[]
  // Lines left out by MAX_LINES_PER_CONVERSATION.
  moreCount: number
}

// Newest conversation first; inside one, the latest lines in reading order.
export function groupConversations (entries: readonly DigestEntry[]): DigestConversation[] {
  const byContext = new Map<Ref<DocNotifyContext>, DigestEntry[]>()
  for (const entry of entries) {
    const group = byContext.get(entry.context)
    if (group === undefined) byContext.set(entry.context, [entry])
    else group.push(entry)
  }
  const groups = [...byContext.values()].map((group) => [...group].sort((a, b) => a.createdOn - b.createdOn))
  groups.sort((a, b) => b[b.length - 1].createdOn - a[a.length - 1].createdOn)
  return groups.map((group) => {
    const shown = group.slice(-MAX_LINES_PER_CONVERSATION)
    const first = group[0]
    return {
      title: first.title,
      objectId: first.objectId,
      objectClass: first.objectClass,
      lines: shown.map((entry) => ({ sender: entry.sender, snippet: toSnippet(entry.text) })),
      moreCount: group.length - shown.length
    }
  })
}

// workbenchId / notificationId: the route stock web push opens (server-plugins/notification-resources push.ts).
export function inboxUrl (frontUrl: string, workspaceUrl: string): string {
  return `${frontUrl}/workbench/${workspaceUrl}/notification`
}

// Opens the inbox with the conversation selected.
export function notificationUrl (
  frontUrl: string,
  workspaceUrl: string,
  objectId: string,
  objectClass: string
): string {
  return `${inboxUrl(frontUrl, workspaceUrl)}/${objectId}|${objectClass}`
}
