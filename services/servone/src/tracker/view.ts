import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { formatName, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import { makeCollabId, SocialIdType, SortingOrder, type Markup, type PersonId, type Ref } from '@hcengineering/core'
import tags from '@hcengineering/tags'
import tracker, { IssuePriority, type Issue } from '@hcengineering/tracker'

import type { WorkspaceSession } from '../mcp/types'
import { personName, type PriorityName } from './issues'

export const MAX_COMMENTS = 20

const PRIORITY_NAME: Record<IssuePriority, PriorityName> = {
  [IssuePriority.Urgent]: 'urgent',
  [IssuePriority.High]: 'high',
  [IssuePriority.Medium]: 'medium',
  [IssuePriority.Low]: 'low',
  [IssuePriority.NoPriority]: 'none'
}

export interface CommentView {
  id: Ref<ChatMessage>
  author: string
  createdOn: number
  message: Markup
}

export interface IssueView {
  identifier: string
  project: string
  title: string
  description: string
  status: string
  priority: PriorityName
  assignee: { name: string, email: string | null } | null
  labels: string[]
  dueDate: number | null
  createdOn: number
  modifiedOn: number
  comments: CommentView[]
}

export async function namesOf (session: WorkspaceSession, refs: Array<Ref<Person>>): Promise<Map<Ref<Person>, string>> {
  if (refs.length === 0) return new Map()
  const people = await session.client.findAll(contact.class.Person, { _id: { $in: [...new Set(refs)] } })
  return new Map<Ref<Person>, string>(people.map((p) => [p._id, formatName(p.name)]))
}

export async function authorsOf (session: WorkspaceSession, socialIds: PersonId[]): Promise<Map<PersonId, string>> {
  if (socialIds.length === 0) return new Map()
  // A SocialIdentity _id is the PersonId itself; only the brand differs.
  const ids = [...new Set(socialIds)] as SocialIdentityRef[]
  const identities = await session.client.findAll(contact.class.SocialIdentity, { _id: { $in: ids } })
  const names = await namesOf(session, identities.map((i) => i.attachedTo))
  return new Map<PersonId, string>(identities.map((i) => [i._id, names.get(i.attachedTo) ?? 'unknown']))
}

async function commentViews (session: WorkspaceSession, messages: ChatMessage[]): Promise<CommentView[]> {
  const authors = await authorsOf(session, messages.map((m) => m.createdBy ?? m.modifiedBy))
  return messages.map((m) => ({
    id: m._id,
    author: authors.get(m.createdBy ?? m.modifiedBy) ?? 'unknown',
    createdOn: m.createdOn ?? m.modifiedOn,
    message: m.message
  }))
}

export async function latestComments (session: WorkspaceSession, issue: Ref<Issue>): Promise<CommentView[]> {
  const messages = await session.client.findAll(
    chunter.class.ChatMessage,
    { attachedTo: issue },
    { sort: { createdOn: SortingOrder.Descending }, limit: MAX_COMMENTS }
  )
  return await commentViews(session, [...messages].reverse())
}

export async function readComment (session: WorkspaceSession, id: Ref<ChatMessage>): Promise<CommentView | undefined> {
  const message = await session.client.findOne(chunter.class.ChatMessage, { _id: id })
  if (message === undefined) return undefined
  const [view] = await commentViews(session, [message])
  return view
}

async function assigneeOf (session: WorkspaceSession, person: Ref<Person>): Promise<IssueView['assignee']> {
  const found = await session.client.findOne(contact.class.Person, { _id: person })
  const email = await session.client.findOne(contact.class.SocialIdentity, { attachedTo: person, type: SocialIdType.EMAIL })
  return { name: personName(found), email: email?.value ?? null }
}

// A stuck editor service throws CollabTimeoutError instead of degrading, so REST can answer 503.
export async function readIssue (session: WorkspaceSession, issue: Issue): Promise<IssueView> {
  const project = await session.client.findOne(tracker.class.Project, { _id: issue.space })
  if (project === undefined) throw new Error(`Project of ${issue.identifier} not found`)
  const status = await session.client.findOne(tracker.class.IssueStatus, { _id: issue.status })
  const labels = await session.client.findAll(tags.class.TagReference, {
    attachedTo: issue._id,
    attachedToClass: tracker.class.Issue
  })
  const description =
    issue.description === null
      ? ''
      : await session.collab.readMarkdown(makeCollabId(tracker.class.Issue, issue._id, 'description'), issue.description)
  return {
    identifier: issue.identifier,
    project: project.identifier,
    title: issue.title,
    description,
    status: status?.name ?? 'unknown',
    priority: PRIORITY_NAME[issue.priority],
    assignee: issue.assignee === null ? null : await assigneeOf(session, issue.assignee),
    labels: labels.map((label) => label.title),
    dueDate: issue.dueDate,
    createdOn: issue.createdOn ?? issue.modifiedOn,
    modifiedOn: issue.modifiedOn,
    comments: await latestComments(session, issue._id)
  }
}
