import { generateId, makeCollabId, SortingOrder, type DocumentQuery, type Ref, type Status } from '@hcengineering/core'
import task from '@hcengineering/task'
import { markupToText } from '@hcengineering/text-core'
import tracker, { IssuePriority, MilestoneStatus, type Issue, type Milestone, type Project } from '@hcengineering/tracker'
import { z } from 'zod'

import {
  commentOnIssue as postComment,
  createIssue as fileIssue,
  dueDateOf,
  MAX_TITLE_LEN,
  PRIORITY_LABEL,
  projectStatuses,
  resolveAssignee,
  resolveIssue,
  resolveProject,
  statusNamed,
  updateIssue as patchIssue
} from '../../tracker/issues'
import { latestComments, MAX_COMMENTS, namesOf } from '../../tracker/view'
import { CollabTimeoutError } from '../collab'
import { defineTool, ToolInputError, type AnyTool } from '../tool'
import type { WorkspaceSession } from '../types'

export { normalizeIssueId } from '../../tracker/issues'

// Custom attributes the sprint screens add at runtime (SPRINT.state and ISSUE_POINTS there).
const sprintFields = z.object({ sprintState: z.enum(['future', 'active', 'closed']).optional() })
const pointFields = z.object({ storyPoints: z.number().finite().nullish() })

const DEFAULT_FIND_LIMIT = 25
const MAX_FIND_LIMIT = 100 // one page of one-line rows stays far below MAX_TOOL_TEXT

const priorityInput = z.enum(['urgent', 'high', 'medium', 'low', 'none'])
const issueIdInput = z.string().describe('Issue id like SRV-12 (case and separator are forgiving: "srv 12" works)')
const assigneeInput = z.string().describe('"me", a person name (e.g. "An Tran") or an email')
const labelsInput = z.array(z.string()).describe('Existing label names; unknown names are rejected, not created')
const dueDateInput = z.string().describe('Due day as YYYY-MM-DD')

function formatTime (ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
}

type SprintState = 'future' | 'active' | 'closed'

// Same fallback as toSprint in the sprint screens: milestones they never touched take their state from status.
function sprintState (milestone: Milestone): SprintState {
  const parsed = sprintFields.safeParse(milestone)
  if (parsed.success && parsed.data.sprintState !== undefined) return parsed.data.sprintState
  if (milestone.status === MilestoneStatus.InProgress) return 'active'
  if (milestone.status === MilestoneStatus.Completed || milestone.status === MilestoneStatus.Canceled) return 'closed'
  return 'future'
}

function issuePoints (issue: Issue): number | undefined {
  const parsed = pointFields.safeParse(issue)
  return parsed.success ? parsed.data.storyPoints ?? undefined : undefined
}

async function resolveSprints (session: WorkspaceSession, project: Project | undefined, raw: string): Promise<Milestone[]> {
  const query: DocumentQuery<Milestone> = {}
  if (project !== undefined) query.space = project._id
  const milestones = await session.client.findAll(tracker.class.Milestone, query)
  const wanted = raw.trim().toLowerCase()
  if (wanted === 'active') {
    const active = milestones.filter((m) => sprintState(m) === 'active')
    if (active.length === 0) throw new ToolInputError('No sprint is active')
    return active
  }
  const named = milestones.filter((m) => m.label.trim().toLowerCase() === wanted)
  if (named.length === 0) {
    const known = [...new Set(milestones.map((m) => m.label))].join(', ')
    throw new ToolInputError(`Sprint "${raw}" not found. Known: ${known === '' ? 'none' : known}`)
  }
  return named
}

async function sprintLabels (session: WorkspaceSession, issues: Issue[]): Promise<Map<Ref<Milestone>, string>> {
  const ids = [...new Set(issues.flatMap((i) => (i.milestone == null ? [] : [i.milestone])))]
  if (ids.length === 0) return new Map()
  const milestones = await session.client.findAll(tracker.class.Milestone, { _id: { $in: ids } })
  return new Map<Ref<Milestone>, string>(milestones.map((m) => [m._id, m.label]))
}

const listProjects = defineTool({
  name: 'list_projects',
  title: 'List tracker projects',
  description:
    'Lists active (non-archived) tracker projects, one per line: "IDENTIFIER  Name  (N open)". ' +
    'The identifier (e.g. SRV) is what other tracker tools take as `project`; issue ids are IDENTIFIER-NUMBER.',
  input: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session) => {
    const projects = await session.client.findAll(tracker.class.Project, { archived: false })
    if (projects.length === 0) return 'No projects'
    const closed = await session.client.findAll(tracker.class.IssueStatus, {
      category: { $in: [task.statusCategory.Won, task.statusCategory.Lost] }
    })
    const closedIds = closed.map((s) => s._id)
    const lines = await Promise.all(
      projects.map(async (p) => {
        const open = await session.client.findAll(
          tracker.class.Issue,
          { space: p._id, status: { $nin: closedIds } },
          { limit: 1, total: true }
        )
        return `${p.identifier}  ${p.name}  (${open.total} open)`
      })
    )
    return lines.join('\n')
  }
})

const findIssues = defineTool({
  name: 'find_issues',
  title: 'Find issues',
  description:
    'Searches tracker issues, most recently modified first. All filters are optional and combine with AND. ' +
    'Returns one line per issue: "SRV-12 [Status] [Priority] Title (Sprint 1, 3 pts) — @Assignee", then "Showing X of TOTAL". ' +
    'Use get_issue for description and comments.',
  input: z.object({
    project: z.string().optional().describe('Project identifier like SRV (see list_projects)'),
    status: z.string().optional().describe('Status name like "In Progress" or "Done"'),
    assignee: assigneeInput.optional(),
    text: z.string().optional().describe('Substring matched against the issue title'),
    sprint: z.string().optional().describe('Sprint name like "Sprint 1", or "active" for the running sprint'),
    limit: z.number().int().min(1).max(MAX_FIND_LIMIT).default(DEFAULT_FIND_LIMIT).describe('Max issues to return')
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session, args) => {
    const query: DocumentQuery<Issue> = {}
    const project = args.project !== undefined ? await resolveProject(session, args.project) : undefined
    if (project !== undefined) query.space = project._id
    if (args.status !== undefined) {
      const statuses =
        project !== undefined
          ? await projectStatuses(session, project)
          : await session.client.findAll(tracker.class.IssueStatus, {})
      query.status = { $in: statusNamed(statuses, args.status).map((s) => s._id) }
    }
    if (args.assignee !== undefined) query.assignee = (await resolveAssignee(session, args.assignee)).ref
    if (args.text !== undefined && args.text.trim() !== '') query.title = { $like: `%${args.text.trim()}%` }
    if (args.sprint !== undefined) {
      query.milestone = { $in: (await resolveSprints(session, project, args.sprint)).map((m) => m._id) }
    }

    const issues = await session.client.findAll(tracker.class.Issue, query, {
      limit: args.limit,
      sort: { modifiedOn: SortingOrder.Descending },
      total: true
    })
    if (issues.length === 0) return 'No issues found'

    const statuses = await session.client.findAll(tracker.class.IssueStatus, {
      _id: { $in: [...new Set(issues.map((i) => i.status))] }
    })
    const statusName = new Map<Ref<Status>, string>(statuses.map((s) => [s._id, s.name]))
    const assignees = await namesOf(
      session,
      issues.flatMap((i) => (i.assignee === null ? [] : [i.assignee]))
    )
    const sprints = await sprintLabels(session, issues)
    const lines = issues.map((i) => {
      const priority = i.priority === IssuePriority.NoPriority ? '' : ` [${PRIORITY_LABEL[i.priority]}]`
      const points = issuePoints(i)
      const extras: string[] = []
      if (i.milestone != null) extras.push(sprints.get(i.milestone) ?? 'unknown sprint')
      if (points !== undefined) extras.push(`${points} pts`)
      const extra = extras.length === 0 ? '' : ` (${extras.join(', ')})`
      const assignee = i.assignee === null ? '' : ` — @${assignees.get(i.assignee) ?? 'unknown'}`
      return `${i.identifier} [${statusName.get(i.status) ?? 'unknown'}]${priority} ${i.title}${extra}${assignee}`
    })
    lines.push(`Showing ${issues.length} of ${issues.total}`)
    return lines.join('\n')
  }
})

async function readDescription (session: WorkspaceSession, issue: Issue): Promise<string> {
  if (issue.description === null) return '(no description)'
  try {
    return await session.collab.readMarkdown(makeCollabId(tracker.class.Issue, issue._id, 'description'), issue.description)
  } catch (error) {
    if (error instanceof CollabTimeoutError) return `(unavailable: ${error.message})`
    throw error
  }
}

const getIssue = defineTool({
  name: 'get_issue',
  title: 'Get issue',
  description:
    'Returns one issue: title, status, priority, assignee, type, sprint, story points, due date, the description as markdown, ' +
    `and up to the latest ${MAX_COMMENTS} comments (oldest first, "Author, YYYY-MM-DD HH:MM UTC: text").`,
  input: z.object({ id: issueIdInput }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session, args) => {
    const issue = await resolveIssue(session, args.id)
    const status = await session.client.findOne(tracker.class.IssueStatus, { _id: issue.status })
    const kind = await session.client.findOne(task.class.TaskType, { _id: issue.kind })
    const assignee =
      issue.assignee === null ? 'unassigned' : (await namesOf(session, [issue.assignee])).get(issue.assignee) ?? 'unknown'

    const fields = [
      `Status: ${status?.name ?? 'unknown'}`,
      `Priority: ${PRIORITY_LABEL[issue.priority]}`,
      `Assignee: ${assignee}`
    ]
    if (kind !== undefined) fields.push(`Type: ${kind.name}`)
    if (issue.milestone != null) fields.push(`Sprint: ${(await sprintLabels(session, [issue])).get(issue.milestone) ?? 'unknown'}`)
    const points = issuePoints(issue)
    if (points !== undefined) fields.push(`Points: ${points}`)
    if (issue.dueDate !== null) fields.push(`Due: ${formatTime(issue.dueDate).slice(0, 10)}`)

    const description = await readDescription(session, issue)

    const comments = await latestComments(session, issue._id)
    const commentLines = comments.map((c) => `${c.author}, ${formatTime(c.createdOn)}: ${markupToText(c.message).trim()}`)

    return [
      `${issue.identifier}: ${issue.title}`,
      fields.join(' | '),
      '',
      'Description:',
      description.trim() === '' ? '(no description)' : description.trim(),
      '',
      comments.length === 0 ? 'No comments' : `Comments (${comments.length}, UTC, oldest first):`,
      ...commentLines
    ].join('\n')
  }
})

const createIssue = defineTool({
  name: 'create_issue',
  title: 'Create issue',
  description:
    'Creates an issue in a tracker project as the current user and returns "Created SRV-13: Title". ' +
    'It starts in the project default status (usually Backlog), appended to the end of the backlog, not in any sprint.',
  input: z.object({
    project: z.string().describe('Project identifier like SRV (see list_projects)'),
    title: z.string().trim().min(1).max(MAX_TITLE_LEN),
    description: z.string().optional().describe('Markdown body'),
    priority: priorityInput.optional().describe('Defaults to none'),
    assignee: assigneeInput.optional(),
    type: z.enum(['task', 'bug', 'story', 'epic']).optional().describe('Issue type; defaults to the project first type (task)'),
    labels: labelsInput.optional(),
    dueDate: dueDateInput.optional()
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  run: async (session, args) => {
    const created = await fileIssue(
      session,
      {
        project: args.project,
        title: args.title,
        description: args.description,
        priority: args.priority,
        assignee: args.assignee,
        labels: args.labels,
        dueDate: args.dueDate === undefined ? undefined : dueDateOf(args.dueDate),
        kind: args.type
      },
      generateId<Issue>()
    )
    return `Created ${created.identifier}: ${created.title}`
  }
})

const updateIssue = defineTool({
  name: 'update_issue',
  title: 'Update issue',
  description:
    'Changes fields of one issue. Pass only the fields to change; at least one is required. ' +
    'assignee: null unassigns. description replaces the whole description; read it with get_issue first to edit part of it. ' +
    'labels replaces all labels ([] clears); dueDate: null clears. ' +
    'Returns "Updated SRV-12: <field> <new value>, ...".',
  input: z.object({
    id: issueIdInput,
    title: z.string().trim().min(1).max(MAX_TITLE_LEN).optional(),
    status: z.string().optional().describe('Status name from the issue project, like "In Progress" or "Done"'),
    priority: priorityInput.optional(),
    assignee: assigneeInput.nullable().optional(),
    description: z.string().optional().describe('New description as markdown'),
    labels: labelsInput.optional(),
    dueDate: dueDateInput.nullable().optional()
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: async (session, args) => {
    const { id, dueDate, ...fields } = args
    const issue = await resolveIssue(session, id)
    const changes = await patchIssue(session, issue, {
      ...fields,
      dueDate: dueDate === undefined || dueDate === null ? dueDate : dueDateOf(dueDate)
    })
    return `Updated ${issue.identifier}: ${changes.map((change) => change.shown).join(', ')}`
  }
})

const commentOnIssue = defineTool({
  name: 'comment_on_issue',
  title: 'Comment on issue',
  description: 'Posts a comment on an issue as the current user. text is markdown. Returns "Commented on SRV-12".',
  input: z.object({ id: issueIdInput, text: z.string().trim().min(1).describe('Markdown comment body') }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  run: async (session, args) => {
    const issue = await resolveIssue(session, args.id)
    await postComment(session, issue, args.text, generateId())
    return `Commented on ${issue.identifier}`
  }
})

export const trackerTools: AnyTool[] = [listProjects, findIssues, getIssue, createIssue, updateIssue, commentOnIssue]
