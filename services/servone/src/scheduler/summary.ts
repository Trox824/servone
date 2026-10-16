import { isWorkingTime, type DigestLocale } from '@servone/notify-rules'

import { summaryStrings } from './email/templates'
import type { UserPrefs } from './settings'
import type { UnreadCounts } from './unread'

// Same cap as the digest: after a long leave the summary covers the last week only.
export const SUMMARY_LOOKBACK_MS = 7 * 24 * 60 * 60_000

export type SummaryStep =
  | { kind: 'wait' }
  // Off hours began: remember when, so the morning summary counts from there.
  | { kind: 'hold' }
  | { kind: 'send', since: number }

// A held stretch stays open until a summary is recorded after it began.
function openHoldStart (prefs: UserPrefs): number | undefined {
  const { heldSince, summarySentAt } = prefs
  if (heldSince === undefined) return undefined
  return summarySentAt === undefined || summarySentAt < heldSince ? heldSince : undefined
}

export function planSummary (prefs: UserPrefs, now: number, pausedUntil: number | undefined): SummaryStep {
  if (prefs.schedule === undefined) return { kind: 'wait' }
  const heldSince = openHoldStart(prefs)
  if (!isWorkingTime(prefs.schedule, now)) return heldSince === undefined ? { kind: 'hold' } : { kind: 'wait' }
  // A running pause keeps the stretch open; the summary goes out when the pause ends.
  if (heldSince === undefined || (pausedUntil !== undefined && now < pausedUntil)) return { kind: 'wait' }
  return { kind: 'send', since: Math.max(heldSince, now - SUMMARY_LOOKBACK_MS) }
}

export function summaryBody (counts: UnreadCounts, locale: DigestLocale): string {
  return summaryStrings[locale].body(counts.mentions, counts.directs)
}
