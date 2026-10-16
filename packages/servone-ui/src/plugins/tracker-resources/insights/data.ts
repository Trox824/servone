import type { Class, DocumentQuery, FindOptions, Ref, TxOperations } from '@hcengineering/core'
import contact, { formatName } from '@hcengineering/contact'
import tags from '@hcengineering/tags'
import tracker, { type Issue, type IssueStatus } from '@hcengineering/tracker'
import { statusKindOf } from '../sprints/data'
import type { StatusKind } from '../sprints/lib/types'
import { ISSUE_DATES, ISSUE_POINTS, issueDates, issuePoints } from '../sprints/schema'
import { isEpic } from '../sprints/setup'
import { narrowStatuses } from './lib/statuses'
import type { Dimension, InsightIssue } from './lib/types'

export const INSIGHTS_ISSUE_CAP = 5000
const LOOKUP_CHUNK = 500

export interface InsightSource extends Issue {
  [ISSUE_POINTS]?: number | null
  [ISSUE_DATES.startedOn]?: number
  [ISSUE_DATES.completedOn]?: number
}
export const insightSourceClass: Ref<Class<InsightSource>> = tracker.class.Issue

export function insightOptions (): FindOptions<InsightSource> {
  return {
    limit: INSIGHTS_ISSUE_CAP,
    total: true,
    projection: {
      identifier: 1,
      title: 1,
      space: 1,
      status: 1,
      kind: 1,
      assignee: 1,
      parents: 1,
      milestone: 1,
      createdOn: 1,
      [ISSUE_POINTS]: 1,
      [ISSUE_DATES.startedOn]: 1,
      [ISSUE_DATES.completedOn]: 1
    }
  }
}

const OPEN_KINDS: StatusKind[] = ['unstarted', 'todo', 'active']

function statusesOf (client: TxOperations, kinds: StatusKind[]): Array<Ref<IssueStatus>> {
  return client
    .getModel()
    .findAllSync(tracker.class.IssueStatus, {})
    .filter((status) => kinds.includes(statusKindOf(client, status._id)))
    .map((status) => status._id)
}

export function completedQuery (base: DocumentQuery<InsightSource>, bounds: { from: number, to: number }): DocumentQuery<InsightSource> {
  return { ...base, [ISSUE_DATES.completedOn]: { $gte: bounds.from, $lt: bounds.to } }
}

export function openQuery (client: TxOperations, base: DocumentQuery<InsightSource>): DocumentQuery<InsightSource> {
  return { ...base, status: { $in: narrowStatuses(statusesOf(client, OPEN_KINDS), base.status) } }
}

/** Done issues the service has not dated yet: they are missing from the completed query. */
export function missingDatesQuery (client: TxOperations, base: DocumentQuery<InsightSource>): DocumentQuery<InsightSource> {
  return {
    ...base,
    status: { $in: narrowStatuses(statusesOf(client, ['done']), base.status) },
    [ISSUE_DATES.completedOn]: { $exists: false }
  }
}

export type NameField = Dimension | 'project'

export interface Lookups {
  /** Issue id to its labels (tag element ids). */
  labels: Map<string, string[]>
  epics: Set<string>
  names: Map<NameField, Map<string, string>>
}

export const NO_LOOKUPS: Lookups = { labels: new Map(), epics: new Set(), names: new Map() }

async function chunked<Id extends string, Found> (ids: Id[], load: (chunk: Id[]) => Promise<Found[]>): Promise<Found[]> {
  const unique = [...new Set(ids)]
  const loads: Array<Promise<Found[]>> = []
  for (let start = 0; start < unique.length; start += LOOKUP_CHUNK) loads.push(load(unique.slice(start, start + LOOKUP_CHUNK)))
  return (await Promise.all(loads)).flat()
}

function present<T> (values: Array<T | null | undefined>): T[] {
  return values.filter((candidate): candidate is T => candidate !== null && candidate !== undefined)
}

export async function loadLookups (client: TxOperations, issues: InsightSource[]): Promise<Lookups> {
  const [references, epics, persons, sprints, projects] = await Promise.all([
    chunked(
      issues.map((issue) => issue._id),
      async (chunk) => await client.findAll(tags.class.TagReference, { attachedTo: { $in: chunk } })
    ),
    chunked(
      issues.flatMap((issue) => issue.parents.map((parent) => parent.parentId)),
      async (chunk) => (await client.findAll(tracker.class.Issue, { _id: { $in: chunk } })).filter(isEpic)
    ),
    chunked(
      present(issues.map((issue) => issue.assignee)),
      async (chunk) => await client.findAll(contact.class.Person, { _id: { $in: chunk } })
    ),
    chunked(
      present(issues.map((issue) => issue.milestone)),
      async (chunk) => await client.findAll(tracker.class.Milestone, { _id: { $in: chunk } })
    ),
    chunked(
      issues.map((issue) => issue.space),
      async (chunk) => await client.findAll(tracker.class.Project, { _id: { $in: chunk } })
    )
  ])

  const labels = new Map<string, string[]>()
  for (const reference of references) {
    const issueLabels = labels.get(reference.attachedTo) ?? []
    if (!issueLabels.includes(reference.tag)) issueLabels.push(reference.tag)
    labels.set(reference.attachedTo, issueLabels)
  }
  const names = new Map<NameField, Map<string, string>>([
    ['assignee', new Map(persons.map((person) => [person._id, formatName(person.name)]))],
    ['label', new Map(references.map((reference) => [reference.tag, reference.title]))],
    ['epic', new Map(epics.map((epic) => [epic._id, epic.title]))],
    ['sprint', new Map(sprints.map((sprint) => [sprint._id, sprint.label]))],
    ['project', new Map(projects.map((project) => [project._id, project.name]))]
  ])
  return { labels, epics: new Set(epics.map((epic) => epic._id)), names }
}

export function toInsightIssue (client: TxOperations, issue: InsightSource, lookups: Lookups): InsightIssue {
  return {
    _id: issue._id,
    identifier: issue.identifier,
    title: issue.title,
    project: issue.space,
    status: issue.status,
    statusName: client.getModel().findObject(issue.status)?.name ?? '',
    statusKind: statusKindOf(client, issue.status),
    isEpic: isEpic(issue),
    assignee: issue.assignee ?? null,
    points: issuePoints(issue),
    labels: lookups.labels.get(issue._id) ?? [],
    epic: issue.parents.find((parent) => lookups.epics.has(parent.parentId))?.parentId ?? null,
    sprint: issue.milestone ?? null,
    createdOn: issue.createdOn ?? issue.modifiedOn,
    ...issueDates(issue)
  }
}

/** Status name to its colour, for status segments; a status without its own colour takes its category's. */
export function statusColors (client: TxOperations): Map<string, number | number[]> {
  const model = client.getModel()
  const colors = new Map<string, number | number[]>()
  for (const status of model.findAllSync(tracker.class.IssueStatus, {})) {
    const color = status.color ?? (status.category !== undefined ? model.findObject(status.category)?.color : undefined)
    if (color !== undefined && !colors.has(status.name)) colors.set(status.name, color)
  }
  return colors
}
