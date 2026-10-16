// Tracker reads and writes shared by the MCP tools and the issues REST API; callers format the outcome.
import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { formatName, type Person } from '@hcengineering/contact'
import core, {
  makeCollabId,
  SortingOrder,
  type Class,
  type Doc,
  type DocumentUpdate,
  type MarkupBlobRef,
  type Ref,
  type Status
} from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import tags, { type TagElement } from '@hcengineering/tags'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import { jsonToMarkup, type MarkupNode, MarkupNodeType } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import tracker, { IssuePriority, type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
import { baseTypeOf, type TriageProject } from '@servone/config'
import { parseDay } from '@servone/forms'
import { z } from 'zod'

import { ToolInputError } from '../mcp/tool'
import type { SessionClient, WorkspaceSession } from '../mcp/types'

// Must match packages/servone-ui/src/plugins/tracker-resources/sprints/scrum-spec.ts.
const SCRUM_TYPE_ID = 'servone:projectType:Scrum' as Ref<ProjectType>
const TASK_TYPE_IDS = {
  epic: 'servone:taskType:Epic' as Ref<TaskType>,
  story: 'servone:taskType:Story' as Ref<TaskType>,
  task: 'servone:taskType:Task' as Ref<TaskType>,
  bug: 'servone:taskType:Bug' as Ref<TaskType>
}

// Vietnamese only until workspaces carry a language, like the helpdesk SLA comment.
const TRIAGE_TEXT = 'Việc mới cần phân loại:'

export const MAX_TITLE_LEN = 255 // create dialog limit

export type PriorityName = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type IssueKindName = keyof typeof TASK_TYPE_IDS

export const PRIORITY_BY_NAME: Record<PriorityName, IssuePriority> = {
  urgent: IssuePriority.Urgent,
  high: IssuePriority.High,
  medium: IssuePriority.Medium,
  low: IssuePriority.Low,
  none: IssuePriority.NoPriority
}

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  [IssuePriority.NoPriority]: 'No priority',
  [IssuePriority.Urgent]: 'Urgent',
  [IssuePriority.High]: 'High',
  [IssuePriority.Medium]: 'Medium',
  [IssuePriority.Low]: 'Low'
}

export type TrackerField = 'project' | 'identifier' | 'status' | 'assignee' | 'labels' | 'type' | 'dueDate' | 'body'

// Subclass so MCP's runTool keeps reporting it as a model-fixable error.
export class TrackerInputError extends ToolInputError {
  constructor (message: string, readonly field: TrackerField, readonly reason: 'not_found' | 'invalid') {
    super(message)
  }
}

export interface IssueDraft {
  project: string
  title: string
  description?: string
  priority?: PriorityName
  // "me", a name or an email; the REST API only lets emails through.
  assignee?: string
  labels?: string[]
  // Noon UTC of the due day, so it reads as the same day in every zone.
  dueDate?: number | null
  kind?: IssueKindName
  // Set only by internal callers (mail); the MCP and REST parsers never fill it.
  relations?: Array<{ _id: Ref<Doc>, _class: Ref<Class<Doc>> }>
}

export interface IssuePatch {
  title?: string
  description?: string
  status?: string
  priority?: PriorityName
  assignee?: string | null
  // Replaces the whole set; [] clears.
  labels?: string[]
  dueDate?: number | null
}

export interface IssueChange {
  field: keyof IssuePatch
  shown: string
}

export type CreatedIssue = Pick<Issue, '_id' | 'identifier' | 'title'>

// updateDoc with retrieve=true returns the updated project, but TxResult is typed as {}.
const sequenceBump = z.object({ object: z.object({ sequence: z.number() }) })

const ISSUE_ID = /^([A-Z][A-Z0-9]*)[\s-]*(\d+)$/

export function normalizeIssueId (raw: string): string | undefined {
  const match = ISSUE_ID.exec(raw.trim().toUpperCase())
  if (match === null) return undefined
  return `${match[1]}-${Number(match[2])}`
}

export function dueDateOf (day: string): number {
  const at = parseDay(day)
  if (at === undefined) throw new TrackerInputError(`Due date "${day}" is not a real day. Use YYYY-MM-DD`, 'dueDate', 'invalid')
  return at
}

function dayOf (at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

export function personName (person: Person | undefined): string {
  return person === undefined ? 'unknown' : formatName(person.name)
}

export async function resolveProject (session: WorkspaceSession, identifier: string): Promise<Project> {
  const wanted = identifier.trim().toUpperCase()
  const projects = await session.client.findAll(tracker.class.Project, { archived: false })
  const project = projects.find((p) => p.identifier.toUpperCase() === wanted)
  if (project === undefined) {
    throw new TrackerInputError(
      `Project ${wanted} not found. Known: ${projects.map((p) => p.identifier).join(', ')}`,
      'project',
      'not_found'
    )
  }
  return project
}

export async function resolveIssue (session: WorkspaceSession, raw: string): Promise<Issue> {
  const identifier = normalizeIssueId(raw)
  if (identifier === undefined) {
    throw new TrackerInputError(`"${raw}" is not an issue id. Use the form SRV-12`, 'identifier', 'invalid')
  }
  const issue = await session.client.findOne(tracker.class.Issue, { identifier })
  if (issue === undefined) throw new TrackerInputError(`Issue ${identifier} not found`, 'identifier', 'not_found')
  return issue
}

export async function projectStatuses (session: WorkspaceSession, project: Project): Promise<IssueStatus[]> {
  const projectType = await session.client.findOne(task.class.ProjectType, { _id: project.type })
  if (projectType === undefined) throw new Error(`Project type ${project.type} of ${project.identifier} not found`)
  const ids = projectType.statuses.map((s) => s._id)
  return await session.client.findAll(tracker.class.IssueStatus, { _id: { $in: ids } })
}

export function statusNamed (statuses: IssueStatus[], name: string): IssueStatus[] {
  const wanted = name.trim().toLowerCase()
  const found = statuses.filter((s) => s.name.toLowerCase() === wanted)
  if (found.length === 0) {
    const known = [...new Set(statuses.map((s) => s.name))].join(', ')
    throw new TrackerInputError(`Status "${name}" not found. Known: ${known}`, 'status', 'invalid')
  }
  return found
}

export interface Assignee {
  ref: Ref<Person>
  label: string
}

export async function resolveAssignee (session: WorkspaceSession, raw: string): Promise<Assignee> {
  const wanted = raw.trim().toLowerCase()
  if (wanted === 'me') {
    const me = await session.client.findOne(contact.class.Person, { _id: session.person })
    return { ref: session.person, label: personName(me) }
  }
  if (wanted.includes('@')) {
    const identity = await session.client.findOne(contact.class.SocialIdentity, { value: wanted })
    if (identity === undefined) throw new TrackerInputError(`No person with email ${wanted}`, 'assignee', 'invalid')
    const person = await session.client.findOne(contact.class.Person, { _id: identity.attachedTo })
    return { ref: identity.attachedTo, label: personName(person) }
  }
  const employees = await session.client.findAll(contact.mixin.Employee, { active: true })
  const named = employees.map((e) => ({ ref: e._id, label: formatName(e.name) }))
  const exact = named.filter((e) => e.label.toLowerCase() === wanted)
  const candidates = exact.length > 0 ? exact : named.filter((e) => e.label.toLowerCase().includes(wanted))
  if (candidates.length === 0) throw new TrackerInputError(`No active person matches "${raw}"`, 'assignee', 'invalid')
  if (candidates.length > 1) {
    throw new TrackerInputError(
      `"${raw}" matches several people: ${candidates.map((c) => c.label).join(', ')}. Use a fuller name or an email`,
      'assignee',
      'invalid'
    )
  }
  return candidates[0]
}

async function resolveLabels (session: WorkspaceSession, titles: string[]): Promise<TagElement[]> {
  const wanted = [...new Set(titles.map((title) => title.trim().toLowerCase()))]
  if (wanted.length === 0) return []
  const labels = await session.client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue })
  const byTitle = new Map(labels.map((label) => [label.title.trim().toLowerCase(), label]))
  const missing = wanted.filter((title) => !byTitle.has(title))
  if (missing.length > 0) {
    const known = [...new Set(labels.map((label) => label.title))].join(', ')
    throw new TrackerInputError(
      `Label ${missing.map((title) => `"${title}"`).join(', ')} not found. Known: ${known === '' ? 'none' : known}`,
      'labels',
      'invalid'
    )
  }
  return wanted.flatMap((title) => {
    const label = byTitle.get(title)
    return label === undefined ? [] : [label]
  })
}

async function attachLabels (session: WorkspaceSession, issue: Pick<Issue, '_id' | 'space'>, labels: TagElement[]): Promise<void> {
  for (const label of labels) {
    await session.client.addCollection(tags.class.TagReference, issue.space, issue._id, tracker.class.Issue, 'labels', {
      title: label.title,
      color: label.color,
      tag: label._id
    })
  }
}

async function replaceLabels (session: WorkspaceSession, issue: Issue, labels: TagElement[]): Promise<void> {
  const current = await session.client.findAll(tags.class.TagReference, {
    attachedTo: issue._id,
    attachedToClass: tracker.class.Issue
  })
  const wanted = new Set(labels.map((label) => label._id))
  const kept = new Set(current.map((reference) => reference.tag))
  for (const reference of current.filter((ref) => !wanted.has(ref.tag))) {
    await session.client.removeCollection(tags.class.TagReference, issue.space, reference._id, issue._id, tracker.class.Issue, 'labels')
  }
  await attachLabels(session, issue, labels.filter((label) => !kept.has(label._id)))
}

async function issueKind (session: WorkspaceSession, project: Project, type: IssueKindName | undefined): Promise<TaskType> {
  if (baseTypeOf(project.type) === SCRUM_TYPE_ID) {
    const wanted = TASK_TYPE_IDS[type ?? 'task']
    const kinds = await session.client.findAll(task.class.TaskType, { parent: project.type })
    const kind = kinds.find((k) => baseTypeOf(k._id) === wanted)
    if (kind === undefined) throw new Error(`Scrum task type ${type ?? 'task'} missing from workspace model`)
    return kind
  }
  const kinds = await session.client.findAll(task.class.TaskType, { parent: project.type })
  if (kinds.length === 0) throw new Error(`Project ${project.identifier} has no task types`)
  if (type === undefined) return kinds[0]
  const kind = kinds.find((k) => k.name.toLowerCase() === type)
  if (kind === undefined) {
    throw new TrackerInputError(
      `Project ${project.identifier} has no "${type}" issue type. Known: ${kinds.map((k) => k.name).join(', ')}`,
      'type',
      'invalid'
    )
  }
  return kind
}

// Only issues from outside the create dialog start here, so triage applies; a form's own status still wins.
// A status removed from the workflow after it was chosen falls back to the next one.
export async function initialStatus (
  client: SessionClient,
  project: TriageProject,
  kind: TaskType,
  formStatus?: Ref<IssueStatus> | null
): Promise<Ref<IssueStatus>> {
  for (const chosen of [formStatus, project.servoneTriageStatus]) {
    if (chosen != null && kind.statuses.includes(chosen)) return chosen
  }
  if (project.defaultIssueStatus !== undefined) return project.defaultIssueStatus
  const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: kind.statuses } })
  const byId = new Map<Ref<Status>, IssueStatus>(statuses.map((s) => [s._id, s]))
  const first = kind.statuses
    .map((id) => byId.get(id))
    .find((s) => s?.category === task.statusCategory.UnStarted)
  if (first === undefined) throw new Error(`Task type ${kind.name} of ${project.identifier} has no unstarted status`)
  return first._id
}

// The owner is mentioned rather than assigned, so the issue stays in Hộp đến (unassigned items).
// A mention is what reaches Inbox, push and email through the stock triggers.
export async function notifyTriageOwner (
  client: SessionClient,
  project: TriageProject,
  issue: Ref<Issue>,
  status: Ref<IssueStatus>
): Promise<void> {
  if (project.servoneTriageOwner === undefined || status !== project.servoneTriageStatus) return
  const owner = await client.findOne(contact.class.Person, { _id: project.servoneTriageOwner })
  if (owner === undefined) return
  const content: MarkupNode[] = [
    { type: MarkupNodeType.text, text: `${TRIAGE_TEXT} ` },
    { type: MarkupNodeType.reference, attrs: { id: owner._id, objectclass: contact.class.Person, label: formatName(owner.name) } }
  ]
  const message = jsonToMarkup({ type: MarkupNodeType.doc, content: [{ type: MarkupNodeType.paragraph, content }] })
  await client.addCollection(chunter.class.ChatMessage, project._id, issue, tracker.class.Issue, 'comments', { message })
}

export interface NewIssue {
  title: string
  description: MarkupBlobRef | null
  assignee: Ref<Person> | null
  priority: IssuePriority
  dueDate: number | null
  relations: Array<{ _id: Ref<Doc>, _class: Ref<Class<Doc>> }>
}

// The issue write every server-side create shares; resolving names and labels stays with the caller.
export async function insertIssue (
  client: SessionClient,
  project: TriageProject,
  kind: TaskType,
  fields: NewIssue,
  id: Ref<Issue>
): Promise<CreatedIssue> {
  const status = await initialStatus(client, project, kind)
  const bump = await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true)
  const number = sequenceBump.parse(bump).object.sequence
  const identifier = `${project.identifier}-${number}`
  const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })

  await client.addCollection(
    tracker.class.Issue,
    project._id,
    tracker.ids.NoParent,
    tracker.class.Issue,
    'subIssues',
    {
      ...fields,
      component: null,
      number,
      status,
      rank: makeRank(last?.rank, undefined),
      comments: 0,
      subIssues: 0,
      startDate: null,
      parents: [],
      remainingTime: 0,
      estimation: 0,
      reportedTime: 0,
      reports: 0,
      childInfo: [],
      identifier,
      kind: kind._id
    },
    id
  )
  await notifyTriageOwner(client, project, id, status)
  return { _id: id, identifier, title: fields.title }
}

// The caller picks the id so an idempotent retry can find the issue an earlier attempt created.
export async function createIssue (session: WorkspaceSession, draft: IssueDraft, id: Ref<Issue>): Promise<CreatedIssue> {
  const project = await resolveProject(session, draft.project)
  const kind = await issueKind(session, project, draft.kind)
  const assignee = draft.assignee !== undefined ? (await resolveAssignee(session, draft.assignee)).ref : null
  const labels = await resolveLabels(session, draft.labels ?? [])

  let description: MarkupBlobRef | null = null
  if (draft.description !== undefined && draft.description.trim() !== '') {
    description = await session.collab.writeMarkdown(makeCollabId(tracker.class.Issue, id, 'description'), draft.description)
  }

  const created = await insertIssue(
    session.client,
    project,
    kind,
    {
      title: draft.title,
      description,
      assignee,
      priority: PRIORITY_BY_NAME[draft.priority ?? 'none'],
      dueDate: draft.dueDate ?? null,
      relations: draft.relations ?? []
    },
    id
  )
  await attachLabels(session, { _id: id, space: project._id }, labels)
  return created
}

export async function updateIssue (session: WorkspaceSession, issue: Issue, patch: IssuePatch): Promise<IssueChange[]> {
  if (Object.values(patch).every((field) => field === undefined)) {
    throw new TrackerInputError(
      'Nothing to update: pass at least one of title, status, priority, assignee, description, labels, dueDate',
      'body',
      'invalid'
    )
  }
  const labels = patch.labels === undefined ? undefined : await resolveLabels(session, patch.labels)
  const update: DocumentUpdate<Issue> = {}
  const changes: IssueChange[] = []
  if (patch.title !== undefined) {
    update.title = patch.title
    changes.push({ field: 'title', shown: `title "${patch.title}"` })
  }
  if (patch.status !== undefined) {
    const project = await session.client.findOne(tracker.class.Project, { _id: issue.space })
    if (project === undefined) throw new Error(`Project of ${issue.identifier} not found`)
    const status = statusNamed(await projectStatuses(session, project), patch.status)[0]
    update.status = status._id
    changes.push({ field: 'status', shown: `status ${status.name}` })
  }
  if (patch.priority !== undefined) {
    const priority = PRIORITY_BY_NAME[patch.priority]
    update.priority = priority
    changes.push({ field: 'priority', shown: `priority ${PRIORITY_LABEL[priority]}` })
  }
  if (patch.assignee === null) {
    update.assignee = null
    changes.push({ field: 'assignee', shown: 'unassigned' })
  } else if (patch.assignee !== undefined) {
    const assignee = await resolveAssignee(session, patch.assignee)
    update.assignee = assignee.ref
    changes.push({ field: 'assignee', shown: `assignee ${assignee.label}` })
  }
  if (patch.description !== undefined) {
    const collabId = makeCollabId(tracker.class.Issue, issue._id, 'description')
    if (issue.description === null) update.description = await session.collab.writeMarkdown(collabId, patch.description)
    else await session.collab.updateMarkdown(collabId, patch.description)
    changes.push({ field: 'description', shown: 'description' })
  }
  if (labels !== undefined) {
    await replaceLabels(session, issue, labels)
    const shown = labels.length === 0 ? 'labels cleared' : `labels ${labels.map((label) => label.title).join(', ')}`
    changes.push({ field: 'labels', shown })
  }
  if (patch.dueDate !== undefined) {
    update.dueDate = patch.dueDate
    changes.push({ field: 'dueDate', shown: patch.dueDate === null ? 'due date cleared' : `due ${dayOf(patch.dueDate)}` })
  }
  if (Object.keys(update).length > 0) await session.client.update(issue, update)
  return changes
}

export async function commentOnIssue (
  session: WorkspaceSession,
  issue: Issue,
  markdown: string,
  id: Ref<ChatMessage>
): Promise<Ref<ChatMessage>> {
  await session.client.addCollection(
    chunter.class.ChatMessage,
    issue.space,
    issue._id,
    tracker.class.Issue,
    'comments',
    { message: jsonToMarkup(markdownToMarkup(markdown)) },
    id
  )
  return id
}
