import core, { type Data, generateId, type Ref, type Status } from '@hcengineering/core'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, {
  type Issue,
  IssuePriority,
  type IssueTemplate,
  type Project,
  TimeReportDayType
} from '@hcengineering/tracker'
import { type MemoryWorkspace, system } from './harness'

export const CLASSIC_TYPE = tracker.ids.ClassingProjectType

export async function addProject (
  ws: MemoryWorkspace,
  identifier: string,
  type: Ref<ProjectType> = CLASSIC_TYPE
): Promise<Ref<Project>> {
  const id = generateId<Project>()
  const project: Data<Project> = {
    name: identifier,
    description: '',
    private: false,
    members: [],
    archived: false,
    type,
    identifier,
    sequence: 0,
    defaultTimeReportDay: TimeReportDayType.PreviousWorkDay
  }
  await ws.client.tx(system.createTxCreateDoc(tracker.class.Project, core.space.Space, project, id))
  return id
}

export async function addIssue (
  ws: MemoryWorkspace,
  project: Ref<Project>,
  status: Ref<Status>,
  kind: Ref<TaskType> = tracker.taskTypes.Issue
): Promise<Ref<Issue>> {
  const id = generateId<Issue>()
  const issue: Data<Issue> = {
    attachedTo: tracker.ids.NoParent,
    attachedToClass: tracker.class.Issue,
    collection: 'subIssues',
    title: 'Việc',
    description: null,
    status,
    priority: IssuePriority.NoPriority,
    component: null,
    subIssues: 0,
    parents: [],
    startDate: null,
    estimation: 0,
    remainingTime: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    kind,
    number: 1,
    assignee: null,
    dueDate: null,
    identifier: 'P-1',
    rank: ''
  }
  await ws.client.tx(system.createTxCreateDoc(tracker.class.Issue, project, issue, id))
  return id
}

export async function addTemplate (
  ws: MemoryWorkspace,
  project: Ref<Project>,
  kind: Ref<TaskType>
): Promise<Ref<IssueTemplate>> {
  const id = generateId<IssueTemplate>()
  const fields = {
    description: '',
    priority: IssuePriority.NoPriority,
    assignee: null,
    component: null,
    estimation: 0,
    kind
  }
  const template: Data<IssueTemplate> = {
    ...fields,
    title: 'Mẫu',
    children: [{ ...fields, id: generateId<Issue>(), title: 'Việc con' }],
    comments: 0
  }
  await ws.client.tx(system.createTxCreateDoc(tracker.class.IssueTemplate, project, template, id))
  return id
}

export async function readProject (ws: MemoryWorkspace, id: Ref<Project>): Promise<Project> {
  const [found] = await ws.client.findAll(tracker.class.Project, { _id: id })
  if (found === undefined) throw new Error(`No project ${id}`)
  return found
}

// The stock Classic type has one task type; a second one shows edits reach every task type.
export async function addBugKind (ws: MemoryWorkspace): Promise<void> {
  const [issueKind] = await ws.client.findAll(task.class.TaskType, { _id: tracker.taskTypes.Issue })
  const [classic] = await ws.client.findAll(task.class.ProjectType, { _id: CLASSIC_TYPE })
  const bug = 'test:taskType:Bug' as Ref<TaskType>
  const kind: Data<TaskType> = {
    parent: CLASSIC_TYPE,
    descriptor: issueKind.descriptor,
    name: 'Bug',
    kind: 'both',
    ofClass: issueKind.ofClass,
    targetClass: issueKind.targetClass,
    statuses: issueKind.statuses,
    statusClass: issueKind.statusClass,
    statusCategories: issueKind.statusCategories,
    allowedAsChildOf: [bug]
  }
  await ws.client.tx(system.createTxCreateDoc(task.class.TaskType, core.space.Model, kind, bug))
  await ws.client.tx(
    system.createTxUpdateDoc(task.class.ProjectType, core.space.Model, CLASSIC_TYPE, {
      tasks: [...classic.tasks, bug],
      statuses: [...classic.statuses, ...issueKind.statuses.map((_id) => ({ _id, taskType: bug }))]
    })
  )
}
