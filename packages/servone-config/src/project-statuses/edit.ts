import type { Employee } from '@hcengineering/contact'
import core, {
  type Class,
  type Doc,
  type DocumentUpdate,
  type Ref,
  type Status,
  type StatusCategory,
  TxFactory,
  type TxCUD
} from '@hcengineering/core'
import task, { calculateStatuses, type ProjectStatus, type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { type IssueStatus, type IssueTemplate, type Project } from '@hcengineering/tracker'
import { type ApproverRule, STATUS_APPROVAL_ATTR, statusApproval } from '@servone/approvals/src/gate'
import type { ConfigSession } from '../client'
import { ConfigError } from '../errors'
import { sendTxes } from '../send'
import { ensureOwnType } from './copy'
import { CATEGORIES, type TriageProject, triageProjectClass } from './read'

// Same batch size as moveProject in servone-ui sprints/setup.ts.
const REMAP_BATCH = 100

// Custom attributes created at runtime. Must match PROJECT.wipLimits in servone-ui sprints/scrum-spec.ts
// (a JSON object keyed by status name) and FORM_STATUS_ATTR in @servone/forms write.ts.
interface ScrumProject extends TriageProject {
  sprintWipLimits?: string
}
interface FormTemplate extends IssueTemplate {
  servoneFormStatus?: Ref<IssueStatus> | null
}
const scrumProjectClass: Ref<Class<ScrumProject>> = tracker.class.Project
const formTemplateClass: Ref<Class<FormTemplate>> = tracker.class.IssueTemplate

interface ApprovalEntry extends ProjectStatus {
  [STATUS_APPROVAL_ATTR]?: ApproverRule
}

interface OwnWorkflow {
  project: ScrumProject
  type: ProjectType
  tasks: TaskType[]
  statuses: IssueStatus[]
}

async function loadOwn (session: ConfigSession, projectId: Ref<Project>): Promise<OwnWorkflow> {
  const typeId = await ensureOwnType(session, projectId)
  const [project] = await session.client.findAll(scrumProjectClass, { _id: projectId })
  const [type] = await session.client.findAll(task.class.ProjectType, { _id: typeId })
  const tasks = await session.client.findAll(task.class.TaskType, { _id: { $in: type.tasks } })
  const statuses = await session.client.findAll(tracker.class.IssueStatus, {
    _id: { $in: type.statuses.map((it) => it._id) }
  })
  return { project, type, tasks, statuses }
}

function statusOf (own: OwnWorkflow, id: Ref<IssueStatus>): IssueStatus {
  const status = own.statuses.find((it) => it._id === id)
  if (status === undefined) throw new ConfigError('not-found', 'Không tìm thấy trạng thái này')
  return status
}

function freeName (own: OwnWorkflow, name: string, except?: Ref<IssueStatus>): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new ConfigError('invalid', 'Tên trạng thái không được để trống')
  const key = trimmed.toLowerCase()
  if (own.statuses.some((it) => it._id !== except && it.name.trim().toLowerCase() === key)) {
    throw new ConfigError('invalid', `Đã có trạng thái "${trimmed}"`)
  }
  return trimmed
}

async function sendBatched (session: ConfigSession, txes: Array<TxCUD<Doc>>): Promise<void> {
  for (let i = 0; i < txes.length; i += REMAP_BATCH) {
    await sendTxes(session, txes.slice(i, i + REMAP_BATCH))
  }
}

async function moveIssues (
  session: ConfigSession,
  factory: TxFactory,
  project: Project,
  from: Ref<IssueStatus>,
  to: Ref<IssueStatus>
): Promise<void> {
  const issues = await session.client.findAll(tracker.class.Issue, { space: project._id, status: from })
  await sendBatched(
    session,
    issues.map((it) => factory.createTxUpdateDoc(it._class, it.space, it._id, { status: to }))
  )
}

async function moveFormStatus (
  session: ConfigSession,
  factory: TxFactory,
  project: Project,
  from: Ref<IssueStatus>,
  to: Ref<IssueStatus> | null
): Promise<void> {
  const templates = await session.client.findAll(formTemplateClass, { space: project._id, servoneFormStatus: from })
  await sendBatched(
    session,
    templates.map((it) => factory.createTxUpdateDoc(formTemplateClass, it.space, it._id, { servoneFormStatus: to }))
  )
}

// Unparseable limits are left as they are; the board already reads them as none.
function renamedWipLimits (raw: string | undefined, from: string, to: string): string | undefined {
  if (raw === undefined || raw === '') return undefined
  let limits: unknown
  try {
    limits = JSON.parse(raw)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
  if (typeof limits !== 'object' || limits === null || !Object.hasOwn(limits, from)) return undefined
  return JSON.stringify(Object.fromEntries(Object.entries(limits).map(([name, limit]) => [name === from ? to : name, limit])))
}

// Same lookup as createState in plugins/task: statuses are shared by name, attribute and category.
async function statusNamed (
  session: ConfigSession,
  factory: TxFactory,
  name: string,
  category: Ref<StatusCategory> | undefined
): Promise<{ id: Ref<IssueStatus>, txes: Array<TxCUD<Doc>> }> {
  const ofAttribute = tracker.attribute.IssueStatus
  const [existing] = await session.client.findAll(tracker.class.IssueStatus, { name, ofAttribute, category })
  if (existing !== undefined) return { id: existing._id, txes: [] }
  const create = factory.createTxCreateDoc(tracker.class.IssueStatus, core.space.Model, { name, ofAttribute, category })
  return { id: create.objectId, txes: [create] }
}

function categoryRank (own: OwnWorkflow, id: Ref<Status>): number {
  return CATEGORIES.findIndex((it) => it === own.statuses.find((status) => status._id === id)?.category)
}

// Writes each task type's new list and the project type entries recalculated from them.
function workflowTxes (
  factory: TxFactory,
  own: OwnWorkflow,
  listOf: (kind: TaskType) => Array<Ref<Status>>,
  entryOf: (entry: ProjectStatus) => ProjectStatus = (entry) => entry
): Array<TxCUD<Doc>> {
  const lists = own.tasks.map((kind) => ({ taskTypeId: kind._id, statuses: listOf(kind) }))
  const txes: Array<TxCUD<Doc>> = own.tasks.map((kind, i) =>
    factory.createTxUpdateDoc(kind._class, kind.space, kind._id, { statuses: lists[i].statuses })
  )
  const statuses = calculateStatuses(own.type, new Map(), lists).map(entryOf)
  txes.push(factory.createTxUpdateDoc(own.type._class, own.type.space, own.type._id, { statuses }))
  return txes
}

export interface NewStatus {
  name: string
  category: Ref<StatusCategory>
  color?: ProjectStatus['color']
}

export async function addStatus (
  session: ConfigSession,
  projectId: Ref<Project>,
  added: NewStatus
): Promise<Ref<IssueStatus>> {
  const own = await loadOwn(session, projectId)
  const name = freeName(own, added.name)
  const factory = new TxFactory(session.account.primarySocialId)
  const created = await statusNamed(session, factory, name, added.category)
  const rank = CATEGORIES.indexOf(added.category)
  const withAdded = (kind: TaskType): Array<Ref<Status>> => {
    const at = kind.statuses.findLastIndex((it) => categoryRank(own, it) <= rank) + 1
    return [...kind.statuses.slice(0, at), created.id, ...kind.statuses.slice(at)]
  }
  const colored = (entry: ProjectStatus): ProjectStatus =>
    entry._id === created.id ? { ...entry, color: added.color } : entry
  await sendTxes(session, [...created.txes, ...workflowTxes(factory, own, withAdded, colored)])
  return created.id
}

export async function renameStatus (
  session: ConfigSession,
  projectId: Ref<Project>,
  statusId: Ref<IssueStatus>,
  newName: string
): Promise<void> {
  const own = await loadOwn(session, projectId)
  const status = statusOf(own, statusId)
  const name = freeName(own, newName, status._id)
  const factory = new TxFactory(session.account.primarySocialId)
  const types = await session.client.findAll(task.class.ProjectType, {})
  const isShared = types.some((it) => it._id !== own.type._id && it.statuses.some((entry) => entry._id === status._id))
  const projectUpdate: DocumentUpdate<ScrumProject> = {}
  const wipLimits = renamedWipLimits(own.project.sprintWipLimits, status.name, name)
  if (wipLimits !== undefined) projectUpdate.sprintWipLimits = wipLimits
  const updateProject = (): TxCUD<Doc> =>
    factory.createTxUpdateDoc(scrumProjectClass, own.project.space, own.project._id, projectUpdate)
  if (!isShared) {
    const txes: Array<TxCUD<Doc>> = [factory.createTxUpdateDoc(status._class, status.space, status._id, { name })]
    if (wipLimits !== undefined) txes.push(updateProject())
    await sendTxes(session, txes)
    return
  }
  const next = await statusNamed(session, factory, name, status.category)
  const swap = (id: Ref<IssueStatus>): Ref<IssueStatus> => (id === status._id ? next.id : id)
  const txes = [...next.txes]
  for (const it of own.tasks) {
    txes.push(factory.createTxUpdateDoc(it._class, it.space, it._id, { statuses: it.statuses.map(swap) }))
  }
  // Swapped in place rather than recalculated, so colour and approval stay on the entry.
  txes.push(
    factory.createTxUpdateDoc(own.type._class, own.type.space, own.type._id, {
      statuses: own.type.statuses.map((it) => ({ ...it, _id: swap(it._id) }))
    })
  )
  await sendTxes(session, txes)
  await moveIssues(session, factory, own.project, status._id, next.id)
  if (own.project.defaultIssueStatus === status._id) projectUpdate.defaultIssueStatus = next.id
  if (own.project.servoneTriageStatus === status._id) projectUpdate.servoneTriageStatus = next.id
  if (Object.keys(projectUpdate).length > 0) await sendTxes(session, [updateProject()])
  await moveFormStatus(session, factory, own.project, status._id, next.id)
}

export async function setStatusColor (
  session: ConfigSession,
  projectId: Ref<Project>,
  statusId: Ref<IssueStatus>,
  color: ProjectStatus['color']
): Promise<void> {
  const own = await loadOwn(session, projectId)
  const status = statusOf(own, statusId)
  const factory = new TxFactory(session.account.primarySocialId)
  const statuses = own.type.statuses.map((it) => (it._id === status._id ? { ...it, color } : it))
  await sendTxes(session, [factory.createTxUpdateDoc(own.type._class, own.type.space, own.type._id, { statuses })])
}

// Every entry carries the marker: calculateStatuses copies only the first entry's fields when it rebuilds the list.
export async function setStatusApproval (
  session: ConfigSession,
  projectId: Ref<Project>,
  statusId: Ref<IssueStatus>,
  rule: ApproverRule | undefined
): Promise<void> {
  const own = await loadOwn(session, projectId)
  const status = statusOf(own, statusId)
  if (status.category === task.statusCategory.Won || status.category === task.statusCategory.Lost) {
    throw new ConfigError('invalid', 'Trạng thái Hoàn thành hoặc Đã hủy không cần duyệt')
  }
  if (own.project.servoneTriageStatus === status._id) {
    throw new ConfigError('invalid', 'Trạng thái Phân loại không cần duyệt')
  }
  const statuses = own.type.statuses.map((entry: ApprovalEntry) => {
    if (entry._id !== status._id) return entry
    const { [STATUS_APPROVAL_ATTR]: _previous, ...plain } = entry
    return rule === undefined ? plain : { ...plain, [STATUS_APPROVAL_ATTR]: rule }
  })
  const factory = new TxFactory(session.account.primarySocialId)
  await sendTxes(session, [factory.createTxUpdateDoc(own.type._class, own.type.space, own.type._id, { statuses })])
}

export interface Triage {
  status: Ref<IssueStatus>
  owner: Ref<Employee>
}

// The status stays in the workflow when triage is turned off: it may be one the project had before.
export async function setTriage (
  session: ConfigSession,
  projectId: Ref<Project>,
  triage: Triage | undefined
): Promise<void> {
  const own = await loadOwn(session, projectId)
  const factory = new TxFactory(session.account.primarySocialId)
  if (triage === undefined) {
    await sendTxes(session, [
      factory.createTxUpdateDoc(triageProjectClass, own.project.space, own.project._id, {
        $unset: { servoneTriageStatus: true, servoneTriageOwner: true }
      })
    ])
    return
  }
  const status = statusOf(own, triage.status)
  if (status.category !== task.statusCategory.UnStarted) {
    throw new ConfigError('invalid', 'Chỉ trạng thái Backlog mới dùng làm Phân loại được')
  }
  if (statusApproval(own.type, status._id) !== undefined) {
    throw new ConfigError('invalid', 'Trạng thái cần duyệt không dùng làm Phân loại được; hãy tắt duyệt trước')
  }
  const first = (kind: TaskType): Array<Ref<Status>> =>
    kind.statuses.includes(status._id) ? [status._id, ...kind.statuses.filter((it) => it !== status._id)] : kind.statuses
  await sendTxes(session, [
    ...workflowTxes(factory, own, first),
    factory.createTxUpdateDoc(triageProjectClass, own.project.space, own.project._id, {
      servoneTriageStatus: status._id,
      servoneTriageOwner: triage.owner
    })
  ])
}

// index counts within the status's category, so a move never changes the category.
export async function moveStatus (
  session: ConfigSession,
  projectId: Ref<Project>,
  statusId: Ref<IssueStatus>,
  index: number
): Promise<void> {
  if (!Number.isInteger(index) || index < 0) throw new ConfigError('invalid', 'Vị trí không hợp lệ')
  const own = await loadOwn(session, projectId)
  const status = statusOf(own, statusId)
  const rank = categoryRank(own, status._id)
  const moved = (kind: TaskType): Array<Ref<Status>> => {
    if (!kind.statuses.includes(status._id)) return kind.statuses
    const group = kind.statuses.filter((it) => it !== status._id && categoryRank(own, it) === rank)
    group.splice(index, 0, status._id)
    let next = 0
    return kind.statuses.map((it) => (categoryRank(own, it) === rank ? group[next++] : it))
  }
  const factory = new TxFactory(session.account.primarySocialId)
  await sendTxes(session, workflowTxes(factory, own, moved))
}

export async function setDefaultStatus (
  session: ConfigSession,
  projectId: Ref<Project>,
  statusId: Ref<IssueStatus>
): Promise<void> {
  const own = await loadOwn(session, projectId)
  const status = statusOf(own, statusId)
  if (status.category !== task.statusCategory.UnStarted && status.category !== task.statusCategory.ToDo) {
    throw new ConfigError('invalid', 'Chỉ trạng thái Backlog hoặc Cần làm mới làm mặc định được')
  }
  const factory = new TxFactory(session.account.primarySocialId)
  await sendTxes(session, [
    factory.createTxUpdateDoc(own.project._class, own.project.space, own.project._id, { defaultIssueStatus: status._id })
  ])
}

// The status record itself stays: it is shared by name with other projects.
export async function deleteStatus (
  session: ConfigSession,
  projectId: Ref<Project>,
  statusId: Ref<IssueStatus>,
  moveTo: Ref<IssueStatus>
): Promise<void> {
  const own = await loadOwn(session, projectId)
  const status = statusOf(own, statusId)
  const target = statusOf(own, moveTo)
  if (target._id === status._id) throw new ConfigError('invalid', 'Hãy chọn một trạng thái khác để chuyển công việc sang')
  if (own.project.defaultIssueStatus === status._id) {
    throw new ConfigError('invalid', 'Không xóa được trạng thái mặc định; hãy chọn mặc định khác trước')
  }
  if (!own.statuses.some((it) => it._id !== status._id && it.category === status.category)) {
    throw new ConfigError('invalid', 'Không xóa được trạng thái cuối cùng của nhóm')
  }
  const factory = new TxFactory(session.account.primarySocialId)
  await moveIssues(session, factory, own.project, status._id, target._id)
  await sendTxes(session, workflowTxes(factory, own, (kind) => kind.statuses.filter((it) => it !== status._id)))
  await moveFormStatus(session, factory, own.project, status._id, null)
}
