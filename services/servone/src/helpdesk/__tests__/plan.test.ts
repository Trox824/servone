import type { Ref, Status } from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'
import { IssuePriority, type Issue } from '@hcengineering/tracker'
import type { HelpdeskSettings } from '@servone/notify-rules'

import type { StatusKind } from '../../issue-dates/dates'
import { planHelpdesk, type PlannedIssue } from '../plan'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const now = Date.UTC(2026, 8, 29, 9)

const status = (name: string): Ref<Status> => name as Ref<Status>
const STATUS_KINDS = new Map<Ref<Status>, StatusKind>([
  [status('new'), 'unstarted'],
  [status('assigned'), 'todo'],
  [status('progress'), 'active'],
  [status('resolved'), 'done'],
  [status('closed'), 'done'],
  [status('canceled'), 'canceled']
])
const incident = 'incident' as Ref<TaskType>
const oneDone = 'one-done' as Ref<TaskType>
const TYPE_ORDER = new Map<Ref<TaskType>, Array<Ref<Status>>>([
  [incident, ['new', 'assigned', 'progress', 'resolved', 'closed', 'canceled'].map(status)],
  [oneDone, ['new', 'progress', 'resolved', 'canceled'].map(status)]
])

const sla: HelpdeskSettings = {
  sla: { since: now - 30 * DAY, targets: { urgent: { respondHours: 1, resolveHours: 4 } } }
}

function ticket (overrides: Partial<PlannedIssue> = {}): PlannedIssue {
  return {
    _id: 'T-1' as Ref<Issue>,
    status: status('new'),
    kind: incident,
    priority: IssuePriority.Urgent,
    createdOn: now - 61 * MINUTE,
    modifiedOn: now - 61 * MINUTE,
    ...overrides
  }
}

const plan = (settings: HelpdeskSettings, issue: PlannedIssue): ReturnType<typeof planHelpdesk> =>
  planHelpdesk(settings, STATUS_KINDS, TYPE_ORDER, [issue], now)

describe('planHelpdesk: first response', () => {
  it('flags an urgent ticket still in New past its 1 h target', () => {
    const issue = ticket()
    expect(plan(sla, issue)).toEqual([{ kind: 'breach', issue, target: 'respond', hours: 1 }])
  })

  it('waits until the target has passed', () => {
    expect(plan(sla, ticket({ createdOn: now - 59 * MINUTE }))).toEqual([])
  })

  it('flags a ticket once', () => {
    expect(plan(sla, ticket({ servoneSlaRespondBreachedOn: now - MINUTE }))).toEqual([])
  })

  it('has no SLA for tickets created before the targets were saved', () => {
    const later: HelpdeskSettings = { sla: { since: now - HOUR, targets: { urgent: { respondHours: 1 } } } }
    expect(plan(later, ticket())).toEqual([])
  })

  it('has no SLA for a ticket without a priority', () => {
    expect(plan(sla, ticket({ priority: IssuePriority.NoPriority }))).toEqual([])
  })

  it('keeps the response of a ticket sent back to New', () => {
    expect(plan(sla, ticket({ servoneRespondedOn: now - 30 * MINUTE }))).toEqual([])
  })

  it('counts a ticket out of New as responded even without the date', () => {
    expect(plan(sla, ticket({ status: status('assigned') }))).toEqual([])
  })
})

describe('planHelpdesk: resolution', () => {
  const late = { createdOn: now - 5 * HOUR, servoneRespondedOn: now - 4 * HOUR }

  it('flags an open ticket past its resolve target', () => {
    const issue = ticket({ ...late, status: status('progress') })
    expect(plan(sla, issue)).toEqual([{ kind: 'breach', issue, target: 'resolve', hours: 4 }])
  })
  it('does not flag a Resolved or Canceled ticket', () => {
    expect(plan(sla, ticket({ ...late, status: status('resolved') }))).toEqual([])
    expect(plan(sla, ticket({ ...late, status: status('canceled') }))).toEqual([])
  })
  it('flags a reopened ticket past its resolve target', () => {
    const issue = ticket({ ...late, status: status('assigned'), modifiedOn: now - MINUTE })
    expect(plan(sla, issue)).toEqual([{ kind: 'breach', issue, target: 'resolve', hours: 4 }])
  })

  it('uses the target of the current priority', () => {
    const tiered: HelpdeskSettings = {
      sla: { since: 0, targets: { urgent: { resolveHours: 4 }, low: { resolveHours: 48 } } }
    }
    expect(plan(tiered, ticket({ ...late, status: status('progress'), priority: IssuePriority.Low }))).toEqual([])
  })
})

describe('planHelpdesk: auto-close', () => {
  const autoClose: HelpdeskSettings = { autoCloseDays: 3 }

  it('closes a Resolved ticket idle for the set days', () => {
    const issue = ticket({ status: status('resolved'), modifiedOn: now - 3 * DAY })
    expect(plan(autoClose, issue)).toEqual([{ kind: 'close', issue, status: status('closed') }])
  })
  it('leaves a Resolved ticket that saw activity within the days', () => {
    expect(plan(autoClose, ticket({ status: status('resolved'), modifiedOn: now - 2 * DAY }))).toEqual([])
  })

  it('leaves a Closed ticket and a type with one Done status', () => {
    expect(plan(autoClose, ticket({ status: status('closed'), modifiedOn: now - 9 * DAY }))).toEqual([])
    const single = ticket({ kind: oneDone, status: status('resolved'), modifiedOn: now - 9 * DAY })
    expect(plan(autoClose, single)).toEqual([])
  })
})

describe('planHelpdesk: auto-archive', () => {
  const autoArchive: HelpdeskSettings = { autoArchiveMonths: 3 }

  it('archives a finished ticket idle past the months', () => {
    const issue = ticket({ status: status('closed'), modifiedOn: now - 90 * DAY })
    expect(plan(autoArchive, issue)).toEqual([{ kind: 'archive', issue }])
  })
  it('keeps a ticket idle for less than the months, or already archived', () => {
    expect(plan(autoArchive, ticket({ status: status('closed'), modifiedOn: now - 89 * DAY }))).toEqual([])
    const archived = ticket({ status: status('canceled'), modifiedOn: now - 99 * DAY, servoneArchivedOn: now - DAY })
    expect(plan(autoArchive, archived)).toEqual([])
  })

  it('brings back an archived ticket that was reopened', () => {
    const issue = ticket({ status: status('progress'), modifiedOn: now - 99 * DAY, servoneArchivedOn: now - DAY })
    expect(plan({}, issue)).toEqual([{ kind: 'unarchive', issue }])
  })
})
