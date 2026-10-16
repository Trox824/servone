import type { Ref, Status } from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'
import { IssuePriority } from '@hcengineering/tracker'
import { ARCHIVED_ON, type HelpdeskSettings, type SlaPriority } from '@servone/notify-rules'

import type { DatedIssue, StatusKind } from '../issue-dates/dates'

export interface HelpdeskIssue extends DatedIssue {
  servoneSlaRespondBreachedOn?: number
  servoneSlaResolveBreachedOn?: number
  servoneArchivedOn?: number
}

export const HELPDESK_FLAGS = {
  respondBreachedOn: 'servoneSlaRespondBreachedOn',
  resolveBreachedOn: 'servoneSlaResolveBreachedOn',
  archivedOn: ARCHIVED_ON
} as const satisfies Record<string, keyof HelpdeskIssue>

export type PlannedIssue = Pick<
  HelpdeskIssue,
  | '_id'
  | 'status'
  | 'kind'
  | 'priority'
  | 'createdOn'
  | 'modifiedOn'
  | 'servoneRespondedOn'
  | 'servoneSlaRespondBreachedOn'
  | 'servoneSlaResolveBreachedOn'
  | 'servoneArchivedOn'
>

export type SlaTargetName = 'respond' | 'resolve'

export type HelpdeskAction<T extends PlannedIssue> =
  | { kind: 'breach', issue: T, target: SlaTargetName, hours: number }
  | { kind: 'close', issue: T, status: Ref<Status> }
  | { kind: 'archive', issue: T }
  | { kind: 'unarchive', issue: T }

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
// ponytail: 30-day months; calendar months only if someone notices the drift.
const MONTH = 30 * DAY

const SLA_PRIORITY = new Map<IssuePriority, SlaPriority>([
  [IssuePriority.Urgent, 'urgent'],
  [IssuePriority.High, 'high'],
  [IssuePriority.Medium, 'medium'],
  [IssuePriority.Low, 'low']
])

export function planHelpdesk<T extends PlannedIssue> (
  settings: HelpdeskSettings,
  statusKinds: Map<Ref<Status>, StatusKind>,
  typeOrder: Map<Ref<TaskType>, Array<Ref<Status>>>,
  issues: T[],
  now: number
): Array<HelpdeskAction<T>> {
  const actions: Array<HelpdeskAction<T>> = []
  for (const issue of issues) {
    const createdOn = issue.createdOn ?? issue.modifiedOn
    const priority = SLA_PRIORITY.get(issue.priority)
    const { sla } = settings
    const target =
      priority === undefined || sla === undefined || createdOn < sla.since ? undefined : sla.targets[priority]
    const kind = statusKinds.get(issue.status) ?? 'todo'
    const isFinished = kind === 'done' || kind === 'canceled'
    // Tickets answered before respondedOn existed, or while the queue lagged, have no date but left New.
    const isResponded = issue.servoneRespondedOn !== undefined || kind !== 'unstarted'
    if (
      target?.respondHours !== undefined &&
      !isResponded &&
      issue.servoneSlaRespondBreachedOn === undefined &&
      createdOn + target.respondHours * HOUR <= now
    ) {
      actions.push({ kind: 'breach', issue, target: 'respond', hours: target.respondHours })
    }
    if (
      target?.resolveHours !== undefined &&
      !isFinished &&
      issue.servoneSlaResolveBreachedOn === undefined &&
      createdOn + target.resolveHours * HOUR <= now
    ) {
      actions.push({ kind: 'breach', issue, target: 'resolve', hours: target.resolveHours })
    }
    // The last Done status of the ticket's type is Closed; the earlier ones are Resolved.
    const closed = typeOrder.get(issue.kind)?.findLast((id) => statusKinds.get(id) === 'done')
    if (
      settings.autoCloseDays !== undefined &&
      kind === 'done' &&
      closed !== undefined &&
      issue.status !== closed &&
      issue.modifiedOn <= now - settings.autoCloseDays * DAY
    ) {
      actions.push({ kind: 'close', issue, status: closed })
    }
    if (
      settings.autoArchiveMonths !== undefined &&
      isFinished &&
      issue.servoneArchivedOn === undefined &&
      issue.modifiedOn <= now - settings.autoArchiveMonths * MONTH
    ) {
      actions.push({ kind: 'archive', issue })
    }
    // Reopening is the restore, even after auto-archive was turned off.
    if (issue.servoneArchivedOn !== undefined && !isFinished) actions.push({ kind: 'unarchive', issue })
  }
  return actions
}
