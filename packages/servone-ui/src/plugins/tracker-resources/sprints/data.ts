import core, {
  generateId,
  SortingOrder,
  type Class,
  type Ref,
  type Status,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  type TxOperations,
  type TxUpdateDoc
} from '@hcengineering/core'
import task, { makeRank } from '@hcengineering/task'
import tracker, { IssuePriority, MilestoneStatus, type Issue, type Milestone, type Project } from '@hcengineering/tracker'
import type { TriageProject } from '@servone/config'
import { issuesToCommit, NEW_SPRINT, type Completion, type NewSprint, type SprintPatch } from './lib/lifecycle'
import type { IssueChange, IssueHistory } from './lib/report'
import type { PlanIssue, ProjectSprintSettings, StatusKind } from './lib/types'
import { ISSUE_POINTS, issueDates, issuePoints, PROJECT, SPRINT, statusForState, toSprint } from './schema'
import { ensureScrumAttributes, isEpic, scrumKindIn, type IssueTypeKey } from './setup'

/** Burndown reads every tx of every issue in a sprint; past this it only reads the first N. */
export const HISTORY_CAP = 500

export function statusKindOf (client: TxOperations, status: Ref<Status> | undefined): StatusKind {
  if (status === undefined) return 'todo'
  const st = client.getModel().findObject(status)
  switch (st?.category) {
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

export function toPlanIssue (client: TxOperations, issue: Issue): PlanIssue {
  return {
    _id: issue._id,
    parent: issue.attachedTo === tracker.ids.NoParent ? null : issue.attachedTo,
    isEpic: isEpic(issue),
    status: statusKindOf(client, issue.status),
    points: issuePoints(issue),
    estimation: issue.estimation ?? 0,
    sprint: issue.milestone ?? null,
    assignee: issue.assignee,
    ...issueDates(issue)
  }
}

function patchToUpdate (patch: SprintPatch): Record<string, unknown> {
  const u: Record<string, unknown> = { status: statusForState(patch.state), [SPRINT.state]: patch.state }
  if (patch.label !== undefined) u.label = patch.label
  if (patch.startDate !== undefined) u.startDate = patch.startDate
  if (patch.targetDate !== undefined) u.targetDate = patch.targetDate
  if ('goal' in patch) u[SPRINT.goal] = patch.goal ?? ''
  if (patch.committedPoints !== undefined) u[SPRINT.committedPoints] = patch.committedPoints
  if (patch.committedCount !== undefined) u[SPRINT.committedCount] = patch.committedCount
  if (patch.completedPoints !== undefined) u[SPRINT.completedPoints] = patch.completedPoints
  if (patch.completedCount !== undefined) u[SPRINT.completedCount] = patch.completedCount
  if (patch.rolledOver !== undefined) u[SPRINT.rolledOver] = patch.rolledOver
  if ('completedAt' in patch) u[SPRINT.completedAt] = patch.completedAt ?? null
  if ('issuesSnapshot' in patch) u[SPRINT.snapshot] = patch.issuesSnapshot === undefined ? null : JSON.stringify(patch.issuesSnapshot)
  return u
}

export async function createSprint (
  client: TxOperations,
  project: Ref<Project>,
  data: NewSprint & { goal?: string }
): Promise<Ref<Milestone>> {
  return await client.createDoc(tracker.class.Milestone, project, {
    label: data.label,
    description: '',
    status: MilestoneStatus.Planned,
    comments: 0,
    attachments: 0,
    startDate: data.startDate,
    targetDate: data.targetDate,
    [SPRINT.state]: 'future',
    [SPRINT.goal]: data.goal ?? ''
  } as any)
}

export async function updateSprint (client: TxOperations, sprint: Milestone, patch: SprintPatch): Promise<void> {
  await client.update(sprint, patchToUpdate(patch) as any)
}

export async function deleteSprint (client: TxOperations, sprint: Milestone, issues: Issue[]): Promise<void> {
  await moveIssues(client, issues, null)
  await client.remove(sprint)
}

/** Also moves the sprint's Backlog work, and those issues' Backlog epics, to To do. */
export async function applyStart (
  client: TxOperations,
  project: Project,
  sprint: Milestone,
  patch: SprintPatch,
  issues: Issue[]
): Promise<void> {
  const parents = [...new Set(issues.map((it) => it.attachedTo).filter((p) => p !== tracker.ids.NoParent))] as Array<Ref<Issue>>
  const epics = parents.length > 0 ? await client.findAll(tracker.class.Issue, { _id: { $in: parents } }) : []
  const commit = new Set(issuesToCommit(issues.map((it) => toPlanIssue(client, it)), epics.map((it) => toPlanIssue(client, it))))
  const todo = statusOfKind(client, project, 'todo')
  const ops = client.apply(undefined, 'servone-start-sprint')
  await ops.update(sprint, patchToUpdate(patch) as any)
  if (todo !== undefined) {
    for (const it of [...issues, ...epics]) if (commit.has(it._id)) await ops.update(it, { status: todo })
  }
  await ops.commit()
}

export async function cancelStart (client: TxOperations, project: Project, sprint: Milestone, issues: Issue[]): Promise<void> {
  const backlog = statusOfKind(client, project, 'unstarted')
  const todo = statusOfKind(client, project, 'todo')
  const ops = client.apply(undefined, 'servone-cancel-sprint-start')
  await ops.update(sprint, {
    status: MilestoneStatus.Planned,
    [SPRINT.state]: 'future',
    [SPRINT.committedPoints]: null,
    [SPRINT.committedCount]: null
  } as any)
  if (backlog !== undefined && todo !== undefined) {
    const back = issues.filter((it) => it.status === todo)
    for (const it of back) await ops.update(it, { status: backlog })
    const moved = new Set<string>(back.map((it) => it._id))
    const parents = [...new Set(back.map((it) => it.attachedTo).filter((p) => p !== tracker.ids.NoParent))] as Array<Ref<Issue>>
    if (parents.length > 0) {
      const epics = await client.findAll(tracker.class.Issue, { _id: { $in: parents }, status: todo })
      const children = await client.findAll(tracker.class.Issue, { attachedTo: { $in: parents } })
      for (const epic of epics) {
        const started = children.some(
          (c) => c.attachedTo === epic._id && !moved.has(c._id) && statusKindOf(client, c.status) !== 'unstarted' && statusKindOf(client, c.status) !== 'canceled'
        )
        if (!started) await ops.update(epic, { status: backlog })
      }
    }
  }
  await ops.commit()
}

async function todoIfActive (client: TxOperations, sprint: Ref<Milestone> | null, space: Ref<Project>): Promise<Ref<Status> | undefined> {
  if (sprint === null) return undefined
  const m = await client.findOne(tracker.class.Milestone, { _id: sprint })
  if (m === undefined || toSprint(m).state !== 'active') return undefined
  const project = await client.findOne(tracker.class.Project, { _id: space })
  return project !== undefined ? statusOfKind(client, project, 'todo') : undefined
}

export async function applyCompletion (client: TxOperations, sprint: Milestone, issues: Issue[], completion: Completion): Promise<void> {
  const ops = client.apply(undefined, 'servone-complete-sprint')
  let created: Ref<Milestone> | undefined
  if (completion.create !== undefined) {
    created = generateId<Milestone>()
    await ops.createDoc(
      tracker.class.Milestone,
      sprint.space,
      {
        label: completion.create.label,
        description: '',
        status: MilestoneStatus.Planned,
        comments: 0,
        attachments: 0,
        startDate: completion.create.startDate,
        targetDate: completion.create.targetDate,
        [SPRINT.state]: 'future',
        [SPRINT.goal]: ''
      } as any,
      created
    )
  }
  await ops.update(sprint, patchToUpdate(completion.sprint) as any)
  const byId = new Map(issues.map((it) => [it._id as string, it]))
  for (const move of completion.moves) {
    const issue = byId.get(move.issue)
    if (issue === undefined) continue
    const to = move.to === NEW_SPRINT ? created ?? null : move.to
    await ops.update(issue, { milestone: to as Ref<Milestone> | null })
  }
  await ops.commit()
}

/** `count` ranks in order between `prev` and `next` (the same ones `moveIssues` writes). */
export function ranksBetween (count: number, place: { prev?: string, next?: string }): string[] {
  const out: string[] = []
  let prev = place.prev
  for (let i = 0; i < count; i++) {
    prev = makeRank(prev, place.next)
    out.push(prev)
  }
  return out
}

/** Backlog issues moved into the running sprint become To do. */
export async function moveIssues (
  client: TxOperations,
  issues: Issue[],
  sprint: Ref<Milestone> | null,
  place?: { prev?: string, next?: string }
): Promise<void> {
  const ranks = place !== undefined ? ranksBetween(issues.length, place) : []
  const todo = issues.length > 0 ? await todoIfActive(client, sprint, issues[0].space as Ref<Project>) : undefined
  const ops = client.apply(undefined, 'servone-move-issues')
  for (const [i, issue] of issues.entries()) {
    const update: Record<string, unknown> = {}
    if ((issue.milestone ?? null) !== sprint) update.milestone = sprint
    if (place !== undefined) update.rank = ranks[i]
    if (todo !== undefined && statusKindOf(client, issue.status) === 'unstarted') update.status = todo
    if (Object.keys(update).length > 0) await ops.update(issue, update as any)
  }
  await ops.commit()
}

/** Re-parents; the server keeps `parents` and sub-issue counters in step, as for "Set parent issue". */
export async function setEpic (client: TxOperations, issue: Issue, epic: Ref<Issue> | null): Promise<void> {
  if (isEpic(issue) || issue._id === epic) return
  const attachedTo = epic ?? tracker.ids.NoParent
  if (issue.attachedTo !== attachedTo) await client.update(issue, { attachedTo })
}

export async function setPoints (client: TxOperations, issue: Issue, points: number | null): Promise<void> {
  await client.update(issue, { [ISSUE_POINTS]: points } as any)
}

interface PointedIssue extends Issue {
  [ISSUE_POINTS]?: number | null
}
const pointedIssueClass: Ref<Class<PointedIssue>> = tracker.class.Issue

export async function setNewIssuePoints (
  ops: TxOperations,
  issue: Ref<Issue>,
  space: Ref<Project>,
  points: number
): Promise<void> {
  await ops.updateDoc(pointedIssueClass, space, issue, { [ISSUE_POINTS]: points })
}

export async function saveSettings (client: TxOperations, project: Project, s: ProjectSprintSettings): Promise<void> {
  await ensureScrumAttributes(client).catch(() => {})
  await client.update(project, {
    [PROJECT.lengthDays]: s.lengthDays,
    [PROJECT.autoCreate]: s.autoCreate,
    [PROJECT.scale]: s.scale,
    [PROJECT.wipLimits]: JSON.stringify(s.wipLimits),
    [PROJECT.doneNeedsPoints]: s.doneNeedsPoints
  } as any)
}

/** The project's statuses (from its type), in workflow order. */
export function projectStatuses (client: TxOperations, project: Project): Status[] {
  const type = client.getModel().findObject(project.type)
  const ids = [...new Set((type?.statuses ?? []).map((s) => s._id))]
  return ids.map((id) => client.getModel().findObject(id)).filter((s): s is Status => s !== undefined)
}

export function statusOfKind (client: TxOperations, project: TriageProject, kind: StatusKind): Ref<Status> | undefined {
  return projectStatuses(client, project).find((s) => s._id !== project.servoneTriageStatus && statusKindOf(client, s._id) === kind)?._id
}

export interface QuickIssue {
  title: string
  type: IssueTypeKey
  sprint: Ref<Milestone> | null
  epic?: Issue
  /** Ranks to place it between; appended at the end of the project when omitted. */
  place?: { prev?: string, next?: string }
}

/** Numbering follows the project sequence, as the create dialog does; running-sprint work starts as To do. */
export async function quickCreateIssue (client: TxOperations, project: Project, q: QuickIssue): Promise<Ref<Issue>> {
  const inc = await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true)
  const number = (inc as any).object.sequence as number
  let place = q.place
  if (place === undefined) {
    const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
    place = { prev: last?.rank }
  }
  const status =
    (await todoIfActive(client, q.sprint, project._id)) ??
    project.defaultIssueStatus ??
    statusOfKind(client, project, 'unstarted')
  const epic = q.epic
  const id = generateId<Issue>()
  await client.addCollection(
    tracker.class.Issue,
    project._id,
    epic?._id ?? tracker.ids.NoParent,
    tracker.class.Issue,
    'subIssues',
    {
      title: q.title.trim(),
      description: null,
      assignee: null,
      component: null,
      number,
      status: status as Ref<Status>,
      priority: IssuePriority.NoPriority,
      rank: makeRank(place.prev, place.next),
      comments: 0,
      subIssues: 0,
      startDate: null,
      dueDate: null,
      parents:
        epic !== undefined
          ? [{ parentId: epic._id, identifier: epic.identifier, parentTitle: epic.title, space: project._id }, ...epic.parents]
          : [],
      remainingTime: 0,
      estimation: 0,
      reportedTime: 0,
      reports: 0,
      childInfo: [],
      identifier: `${project.identifier}-${number}`,
      kind: scrumKindIn(project, q.type),
      milestone: q.sprint
    } as any,
    id
  )
  return id
}

export async function updateIssues (client: TxOperations, issues: Issue[], update: Record<string, unknown>): Promise<void> {
  const ops = client.apply(undefined, 'servone-bulk-edit')
  for (const it of issues) {
    const changed = Object.entries(update).some(([k, v]) => (it as any)[k] !== v)
    if (changed) await ops.update(it, update as any)
  }
  await ops.commit()
}

/** Older workspaces wrap attached-doc txes in a collection tx; newer ones don't. */
function unwrap (tx: Tx): TxCUD<Issue> {
  return ((tx as any).tx ?? tx) as TxCUD<Issue>
}

/** Issues with no creation tx (e.g. restored from a backup) start from current values at `createdOn`. */
export async function loadHistories (client: TxOperations, issues: Issue[]): Promise<IssueHistory[]> {
  const subset = issues.slice(0, HISTORY_CAP)
  const ids = subset.map((it) => it._id)
  const txes = ids.length === 0
    ? []
    : await client.findAll(core.class.TxCUD, { objectId: { $in: ids } } as any, { sort: { modifiedOn: SortingOrder.Ascending } })
  const byIssue = new Map<string, Array<TxCUD<Issue>>>()
  for (const raw of txes) {
    const tx = unwrap(raw)
    const list = byIssue.get(tx.objectId) ?? []
    list.push(tx)
    byIssue.set(tx.objectId, list)
  }
  return subset.map((issue) => {
    const list = byIssue.get(issue._id) ?? []
    const create = list.find((t) => t._class === core.class.TxCreateDoc) as TxCreateDoc<Issue> | undefined
    const attrs = create?.attributes as Record<string, any> | undefined
    const changes: IssueChange[] = []
    for (const t of list) {
      if (t._class !== core.class.TxUpdateDoc) continue
      const op = (t as TxUpdateDoc<Issue>).operations as Record<string, any>
      const c: IssueChange = { at: t.modifiedOn }
      if ('status' in op) c.status = statusKindOf(client, op.status)
      if ('milestone' in op) c.sprint = op.milestone ?? null
      if (ISSUE_POINTS in op) c.points = typeof op[ISSUE_POINTS] === 'number' ? op[ISSUE_POINTS] : null
      if (c.status !== undefined || c.sprint !== undefined || c.points !== undefined) changes.push(c)
    }
    const initial =
      attrs !== undefined
        ? {
            status: statusKindOf(client, attrs.status),
            sprint: attrs.milestone ?? null,
            points: typeof attrs[ISSUE_POINTS] === 'number' ? attrs[ISSUE_POINTS] : null
          }
        : { status: statusKindOf(client, issue.status), sprint: issue.milestone ?? null, points: issuePoints(issue) }
    return {
      _id: issue._id,
      isEpic: isEpic(issue),
      created: create?.modifiedOn ?? issue.createdOn ?? 0,
      initial,
      changes: attrs !== undefined ? changes : []
    }
  })
}
