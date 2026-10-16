import type { Ref } from '@hcengineering/core'
import task, { type StatusCategory } from '@hcengineering/task'
import type { Issue } from '@hcengineering/tracker'

// Must match ISSUE_DATES in packages/servone-ui/src/plugins/tracker-resources/sprints/scrum-spec.ts.
export const ISSUE_DATES = {
  startedOn: 'servoneStartedOn',
  completedOn: 'servoneCompletedOn',
  respondedOn: 'servoneRespondedOn'
} as const satisfies Record<string, keyof DatedIssue>

export interface DatedIssue extends Issue {
  servoneStartedOn?: number
  servoneCompletedOn?: number
  servoneRespondedOn?: number
}

export type StatusKind = 'unstarted' | 'todo' | 'active' | 'done' | 'canceled'

export function kindOfCategory (category: Ref<StatusCategory> | undefined): StatusKind {
  switch (category) {
    case task.statusCategory.UnStarted:
      return 'unstarted'
    case task.statusCategory.Active:
      return 'active'
    case task.statusCategory.Won:
      return 'done'
    case task.statusCategory.Lost:
      return 'canceled'
    default:
      return 'todo'
  }
}

export interface IssueDates {
  startedOn?: number
  completedOn?: number
  /** First move out of a Backlog status; never cleared, so a ticket sent back to New keeps its response. */
  respondedOn?: number
}

export interface StatusEvent {
  kind: StatusKind
  at: number
}

/** `completedOn: null` unsets the date. */
export interface DatesUpdate {
  startedOn?: number
  completedOn?: number | null
  respondedOn?: number
}

export type DatesPlan = { kind: 'write', update: DatesUpdate } | { kind: 'none' } | { kind: 'history' }

// Decides from the issue's current category, so replayed or reordered queue messages converge.
export function planDates (stored: IssueDates, current: StatusKind, event: StatusEvent): DatesPlan {
  const update: DatesUpdate = {}
  if (event.kind !== 'unstarted' && (stored.respondedOn === undefined || event.at < stored.respondedOn)) {
    update.respondedOn = event.at
  }
  if (event.kind === 'active' && (stored.startedOn === undefined || event.at < stored.startedOn)) {
    update.startedOn = event.at
  }
  if (current !== 'done') {
    if (stored.completedOn !== undefined) update.completedOn = null
  } else if (stored.completedOn === undefined) {
    if (event.kind !== 'done') return { kind: 'history' }
    update.completedOn = event.at
  } else if (event.kind === 'done' && event.at > stored.completedOn) {
    // A tx carries no previous status: re-done after a reopen moves the date, a Done -> Done move must not.
    return { kind: 'history' }
  }
  return Object.keys(update).length > 0 ? { kind: 'write', update } : { kind: 'none' }
}

export interface StatusHistory {
  created: number
  initial: StatusKind
  /** Any order; sorted on use. */
  changes: StatusEvent[]
}

// Same rule as cycleTimes() in packages/servone-ui/.../sprints/lib/flow.ts, except that work which went
// straight to done gets no start.
export function datesFromHistory (history: StatusHistory): IssueDates {
  let kind = history.initial
  let startedOn = kind === 'active' ? history.created : undefined
  let completedOn = kind === 'done' ? history.created : undefined
  for (const change of [...history.changes].sort((a, b) => a.at - b.at)) {
    if (change.kind === kind) continue
    kind = change.kind
    if (kind === 'active' && startedOn === undefined) startedOn = change.at
    completedOn = kind === 'done' ? change.at : undefined
  }
  const dates: IssueDates = {}
  if (startedOn !== undefined) dates.startedOn = startedOn
  if (completedOn !== undefined) dates.completedOn = completedOn
  return dates
}

export interface SettledDates {
  dates: IssueDates
  isEstimated: boolean
}

// No history means no creation tx (restored from a backup): start at creation, complete at the last change.
// Work that is active now has started, whatever its history says; done work may never have.
export function settledDates (
  history: StatusHistory | undefined,
  current: StatusKind,
  issue: { createdOn: number, modifiedOn: number }
): SettledDates {
  const derived = history === undefined ? {} : datesFromHistory(history)
  const dates: IssueDates = {}
  let isEstimated = false
  if (derived.startedOn !== undefined) {
    dates.startedOn = derived.startedOn
  } else if (current === 'active' || (history === undefined && current === 'done')) {
    dates.startedOn = issue.createdOn
    isEstimated = true
  }
  if (current === 'done') {
    // History can end elsewhere when a status changed category after the fact.
    dates.completedOn = derived.completedOn ?? issue.modifiedOn
    if (derived.completedOn === undefined) isEstimated = true
  }
  return { dates, isEstimated }
}

export function datesUpdate (stored: IssueDates, target: IssueDates): DatesUpdate | undefined {
  const update: DatesUpdate = {}
  if (target.startedOn !== undefined && target.startedOn !== stored.startedOn) update.startedOn = target.startedOn
  if (target.completedOn !== stored.completedOn) update.completedOn = target.completedOn ?? null
  return Object.keys(update).length > 0 ? update : undefined
}
