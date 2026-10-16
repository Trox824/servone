import { IssuePriority } from '@hcengineering/tracker'
import type { Json } from '../http-json'
import type { TrackedField, TrackerEvent } from './events'

export const PAYLOAD_VERSION = 1
// Enough for Slack or n8n to show the comment; the full thread stays in Servone.
export const MAX_COMMENT_CHARS = 4000

export interface PersonRef {
  name: string
  email: string | null
}

export interface IssueFacts {
  title: string
  status: string
  priority: IssuePriority
  assignee: PersonRef | null
  dueDate: number | null
}

export interface ProjectRef {
  identifier: string
  name: string
}

export interface ResolvedChange {
  occurredAt: number
  project: ProjectRef
  issue: IssueFacts & { identifier: string, url: string | null }
  // Undefined when the issue's history could not be rebuilt; every "from" is then null.
  previous: IssueFacts | undefined
  changedFields: TrackedField[]
  actor: PersonRef
  // Markdown of the new comment, for comment.added.
  comment: string | undefined
}

const PRIORITY_NAMES: Record<IssuePriority, string> = {
  [IssuePriority.NoPriority]: 'none',
  [IssuePriority.Urgent]: 'urgent',
  [IssuePriority.High]: 'high',
  [IssuePriority.Medium]: 'medium',
  [IssuePriority.Low]: 'low'
}

const isoTime = (time: number | null): string | null => (time === null ? null : new Date(time).toISOString())

const personJson = (person: PersonRef | null): Json => (person === null ? null : { name: person.name, email: person.email })

function fieldJson (facts: IssueFacts, field: TrackedField): Json {
  switch (field) {
    case 'title':
      return facts.title
    case 'status':
      return facts.status
    case 'priority':
      return PRIORITY_NAMES[facts.priority]
    case 'assignee':
      return personJson(facts.assignee)
    case 'dueDate':
      return isoTime(facts.dueDate)
  }
}

export function buildPayload (event: TrackerEvent | 'test', deliveryId: string, change: ResolvedChange): string {
  const { issue, previous } = change
  const payload: { [key: string]: Json } = {
    version: PAYLOAD_VERSION,
    event,
    deliveryId,
    occurredAt: isoTime(change.occurredAt),
    project: { identifier: change.project.identifier, name: change.project.name },
    issue: {
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      priority: PRIORITY_NAMES[issue.priority],
      assignee: personJson(issue.assignee),
      dueDate: isoTime(issue.dueDate),
      url: issue.url
    },
    changes: change.changedFields.map((field) => ({
      field,
      from: previous === undefined ? null : fieldJson(previous, field),
      to: fieldJson(issue, field)
    })),
    actor: personJson(change.actor)
  }
  if (event === 'comment.added' && change.comment !== undefined) {
    payload.comment = {
      text: change.comment.slice(0, MAX_COMMENT_CHARS),
      isTruncated: change.comment.length > MAX_COMMENT_CHARS
    }
  }
  return JSON.stringify(payload)
}

export function testChange (project: ProjectRef, actor: PersonRef, now: number): ResolvedChange {
  return {
    occurredAt: now,
    project,
    issue: {
      identifier: `${project.identifier}-0`,
      title: 'Test event from Servone',
      status: 'Todo',
      priority: IssuePriority.NoPriority,
      assignee: null,
      dueDate: null,
      url: null
    },
    previous: undefined,
    changedFields: [],
    actor,
    comment: undefined
  }
}
