import core, { type Data, type Doc, type Ref, TxFactory, type TxCUD } from '@hcengineering/core'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { type Project } from '@hcengineering/tracker'
import type { ConfigSession } from '../client'
import { requireMaintainer } from '../changes'
import { ConfigError } from '../errors'
import { sendTxes } from '../send'
import { copyIdOf, ownerOf } from './ids'

// Same batch size as moveProject in servone-ui sprints/setup.ts.
const REMAP_BATCH = 100

async function readProject (session: ConfigSession, id: Ref<Project>): Promise<Project> {
  const [project] = await session.client.findAll(tracker.class.Project, { _id: id })
  if (project === undefined) throw new ConfigError('not-found', 'Không tìm thấy dự án hoặc quy trình')
  return project
}

function copyTxes (factory: TxFactory, base: ProjectType, tasks: TaskType[], owner: Ref<Project>): Array<TxCUD<Doc>> {
  const copyOf = <T extends string>(id: T): T => copyIdOf(id, owner)
  const txes: Array<TxCUD<Doc>> = []
  for (const it of tasks) {
    const copy: Data<TaskType> = {
      parent: copyOf(base._id),
      descriptor: it.descriptor,
      name: it.name,
      kind: it.kind,
      allowedAsChildOf: it.allowedAsChildOf?.map(copyOf),
      ofClass: it.ofClass,
      targetClass: it.targetClass,
      statuses: [...it.statuses],
      statusClass: it.statusClass,
      statusCategories: [...it.statusCategories],
      icon: it.icon,
      color: it.color
    }
    txes.push(factory.createTxCreateDoc(task.class.TaskType, core.space.Model, copy, copyOf(it._id)))
  }
  const type: Data<ProjectType> = {
    name: base.name,
    shortDescription: base.shortDescription,
    descriptor: base.descriptor,
    description: base.description,
    tasks: base.tasks.map(copyOf),
    roles: 0,
    classic: base.classic,
    statuses: base.statuses.map((it) => ({ ...it, taskType: copyOf(it.taskType) })),
    targetClass: base.targetClass
  }
  txes.unshift(factory.createTxCreateDoc(task.class.ProjectType, core.space.Model, type, copyOf(base._id)))
  return txes
}

async function remapKinds (
  session: ConfigSession,
  factory: TxFactory,
  project: Project,
  own: Set<Ref<TaskType>>
): Promise<void> {
  const remap = (kind: Ref<TaskType>): Ref<TaskType> => {
    const copy = copyIdOf(kind, project._id)
    return own.has(copy) ? copy : kind
  }
  const issues = await session.client.findAll(tracker.class.Issue, { space: project._id })
  const templates = await session.client.findAll(tracker.class.IssueTemplate, { space: project._id })
  const txes: Array<TxCUD<Doc>> = []
  for (const it of issues) {
    const kind = remap(it.kind)
    if (kind !== it.kind) txes.push(factory.createTxUpdateDoc(it._class, it.space, it._id, { kind }))
  }
  for (const it of templates) {
    const kind = it.kind === undefined ? undefined : remap(it.kind)
    const children = it.children.map((child) => ({
      ...child,
      kind: child.kind === undefined ? undefined : remap(child.kind)
    }))
    if (kind === it.kind && children.every((child, i) => child.kind === it.children[i].kind)) continue
    txes.push(factory.createTxUpdateDoc(it._class, it.space, it._id, { kind, children }))
  }
  for (let i = 0; i < txes.length; i += REMAP_BATCH) {
    await sendTxes(session, txes.slice(i, i + REMAP_BATCH))
  }
}

// Idempotent and resumable: reuses an existing copy and remaps only what still points at a base kind.
export async function ensureOwnType (session: ConfigSession, projectId: Ref<Project>): Promise<Ref<ProjectType>> {
  requireMaintainer(session)
  const factory = new TxFactory(session.account.primarySocialId)
  const project = await readProject(session, projectId)
  const copyId = copyIdOf(project.type, project._id)
  if (ownerOf(project.type) !== project._id) {
    const [existing] = await session.client.findAll(task.class.ProjectType, { _id: copyId })
    if (existing === undefined) {
      const [base] = await session.client.findAll(task.class.ProjectType, { _id: project.type })
      if (base === undefined) throw new ConfigError('not-found', 'Không tìm thấy bộ trạng thái')
      // ponytail: stock and Servone types have no roles; copy roles and rewrite the project's assignment if one ever does.
      if (base.roles > 0) {
        throw new ConfigError('invalid', 'Bộ trạng thái này có vai trò riêng, chưa tách riêng được')
      }
      const baseTasks = await session.client.findAll(task.class.TaskType, { _id: { $in: base.tasks } })
      await sendTxes(session, copyTxes(factory, base, baseTasks, project._id))
    }
    await sendTxes(session, [factory.createTxUpdateDoc(project._class, project.space, project._id, { type: copyId })])
  }
  const ownTasks = await session.client.findAll(task.class.TaskType, { parent: copyId })
  await remapKinds(session, factory, project, new Set(ownTasks.map((it) => it._id)))
  return copyId
}
