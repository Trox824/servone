// Swaps in a separate UnStarted doc instead of recategorizing the old one: Tracker shares status docs by name + category.
import core, { type Doc, type Ref, type Status, type TxCUD } from '@hcengineering/core'
import task, { type ProjectType } from '@hcengineering/task'
import tracker, { type IssueStatus } from '@hcengineering/tracker'
import { baseTypeOf } from '@servone/config'
import { type SetupClient, statusTxes, systemFactory, WORKFLOW_TYPE_ID } from './setup'
import { TEMPLATES } from './templates'

// Same batch size as ensureOwnType's remap in @servone/config.
const MOVE_BATCH = 100
const FIX_SCOPE = 'servone-workflow-first-status'

const FIRST_NAMES = new Set(
  Object.values(TEMPLATES).flatMap((template) => template.types.flatMap((type) => [type.statuses[0].name.vi, type.statuses[0].name.en]))
)

async function send (client: SetupClient, txes: Array<TxCUD<Doc>>): Promise<void> {
  if (txes.length === 0) return
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, FIX_SCOPE, [], [], txes, undefined))
}

// Resumable: the type's list is swapped last, so a run that stops earlier still finds the ToDo status next time.
async function fixType (client: SetupClient, type: ProjectType): Promise<void> {
  const kinds = await client.findAll(task.class.TaskType, { _id: { $in: type.tasks } })
  const firsts = await client.findAll(tracker.class.IssueStatus, { _id: { $in: kinds.map((kind) => kind.statuses[0]) } })
  const olds = firsts.filter((status) => status.category === task.statusCategory.ToDo && FIRST_NAMES.has(status.name))
  if (olds.length === 0) return

  const unstarted = await statusTxes(client, systemFactory, olds.map((old) => ({ name: old.name, category: task.statusCategory.UnStarted })))
  const replacements = new Map<Ref<Status>, Ref<IssueStatus>>(olds.map((old, i) => [old._id, unstarted.ids[i]]))
  const swap = (status: Ref<Status>): Ref<Status> => replacements.get(status) ?? status

  // Defaults move before items, so an issue created mid-run lands on the new status.
  const projects = await client.findAll(tracker.class.Project, { type: type._id })
  const defaults = projects.flatMap((project) => {
    const replacement = project.defaultIssueStatus === undefined ? undefined : replacements.get(project.defaultIssueStatus)
    return replacement === undefined ? [] : [systemFactory.createTxUpdateDoc(project._class, project.space, project._id, { defaultIssueStatus: replacement })]
  })
  await send(client, [...unstarted.txes, ...defaults])

  const issues = await client.findAll(tracker.class.Issue, {
    space: { $in: projects.map((project) => project._id) },
    status: { $in: [...replacements.keys()] }
  })
  const moves = issues.map((issue) => systemFactory.createTxUpdateDoc(issue._class, issue.space, issue._id, { status: swap(issue.status) }))
  for (let i = 0; i < moves.length; i += MOVE_BATCH) {
    await send(client, moves.slice(i, i + MOVE_BATCH))
  }

  await send(client, [
    ...kinds.filter((kind) => kind.statuses.some((status) => replacements.has(status))).map((kind) => systemFactory.createTxUpdateDoc(kind._class, kind.space, kind._id, { statuses: kind.statuses.map(swap) })),
    systemFactory.createTxUpdateDoc(type._class, type.space, type._id, { statuses: type.statuses.map((entry) => ({ ...entry, _id: swap(entry._id) })) })
  ])
}

// Only Workflow types and their per-project copies; Tracker types and the old shared status docs stay as they are.
export async function moveFirstStatusesToNotStarted (client: SetupClient): Promise<void> {
  const types = await client.findAll(task.class.ProjectType, {})
  for (const type of types.filter((it) => baseTypeOf(it._id) === WORKFLOW_TYPE_ID)) {
    await fixType(client, type)
  }
}
