import type { RestClient } from '@hcengineering/api-client'
import core, {
  type Class,
  type DocumentUpdate,
  type Ref,
  SortingOrder,
  type Status,
  type Timestamp,
  TxFactory,
  type Type
} from '@hcengineering/core'
import { getEmbeddedLabel } from '@hcengineering/platform'
import tracker, { type Issue } from '@hcengineering/tracker'
import {
  ISSUE_DATES,
  kindOfCategory,
  settledDates,
  type DatedIssue,
  type DatesUpdate,
  type IssueDates,
  type SettledDates,
  type StatusKind
} from './dates'
import { statusHistories } from './history'

const txFactory = new TxFactory(core.account.System)

// Class<T> never uses T, so the stock Issue class ref types the date fields without a cast.
export const datedIssueClass: Ref<Class<DatedIssue>> = tracker.class.Issue

export type StatusKinds = Map<Ref<Status>, StatusKind>

const timestampType: Type<Timestamp> = { _class: core.class.TypeTimestamp, label: core.string.Timestamp }

const DATE_LABELS: Array<[string, string]> = [
  [ISSUE_DATES.startedOn, 'Started on'],
  [ISSUE_DATES.completedOn, 'Completed on'],
  [ISSUE_DATES.respondedOn, 'Responded on']
]

// Activity skips only declared hidden attributes; an undeclared field would put a line in every issue's activity.
export async function ensureDateAttributes (client: RestClient): Promise<void> {
  const existing = await client.findAll(core.class.Attribute, {
    attributeOf: tracker.class.Issue,
    name: { $in: DATE_LABELS.map(([name]) => name) }
  })
  for (const [name, label] of DATE_LABELS) {
    if (existing.some((attribute) => attribute.name === name)) continue
    await client.tx(
      txFactory.createTxCreateDoc(core.class.Attribute, core.space.Model, {
        attributeOf: tracker.class.Issue,
        name,
        label: getEmbeddedLabel(label),
        type: timestampType,
        isCustom: true,
        hidden: true
      })
    )
  }
}

export async function loadStatusKinds (client: RestClient): Promise<StatusKinds> {
  const statuses = await client.findAll(tracker.class.IssueStatus, {})
  return new Map(statuses.map((status) => [status._id, kindOfCategory(status.category)]))
}

export function storedDates (issue: DatedIssue): IssueDates {
  return { startedOn: issue.servoneStartedOn, completedOn: issue.servoneCompletedOn, respondedOn: issue.servoneRespondedOn }
}

// Reusing the issue's own time and author keeps its "modified" sort and "modified by" as the user left them.
export async function writeDates (client: RestClient, issue: DatedIssue, update: DatesUpdate): Promise<void> {
  const operations: DocumentUpdate<DatedIssue> = {}
  if (update.startedOn !== undefined) operations.servoneStartedOn = update.startedOn
  if (update.respondedOn !== undefined) operations.servoneRespondedOn = update.respondedOn
  if (update.completedOn === null) operations.$unset = { [ISSUE_DATES.completedOn]: true }
  else if (update.completedOn !== undefined) operations.servoneCompletedOn = update.completedOn
  await client.tx(
    txFactory.createTxUpdateDoc(datedIssueClass, issue.space, issue._id, operations, false, issue.modifiedOn, issue.modifiedBy)
  )
}

export async function loadSettledDates (
  client: RestClient,
  kinds: StatusKinds,
  issues: DatedIssue[]
): Promise<Array<{ issue: DatedIssue, settled: SettledDates }>> {
  const txes = await client.findAll(
    core.class.TxCUD,
    { objectId: { $in: issues.map((issue): Ref<Issue> => issue._id) } },
    { sort: { modifiedOn: SortingOrder.Ascending } }
  )
  const kindOf = (status: Ref<Status>): StatusKind => kinds.get(status) ?? 'todo'
  const histories = statusHistories(txes, kindOf)
  return issues.map((issue) => ({
    issue,
    settled: settledDates(histories.get(issue._id), kindOf(issue.status), {
      createdOn: issue.createdOn ?? issue.modifiedOn,
      modifiedOn: issue.modifiedOn
    })
  }))
}
