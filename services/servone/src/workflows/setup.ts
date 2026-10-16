// The Workflow project type and the Quy trình app are data, written once per workspace with system rights:
// every user needs the app before any maintainer acts, and the stock transactor never loads a model package.
import core, {
  type AnyAttribute,
  type Class,
  ClassifierKind,
  type Data,
  type Doc,
  type DocumentClassQuery,
  generateId,
  type Ref,
  type RefTo,
  type Status,
  type StatusCategory,
  type TxCUD,
  TxFactory,
  type TxOperations
} from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import { type Asset, getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { type IssueStatus } from '@hcengineering/tracker'
import workbench, { type Application } from '@hcengineering/workbench'
import { TEMPLATES } from './templates'

// Must match packages/servone-ui/src/plugins/tracker-resources/workflows/plugin.ts.
export const WORKFLOW_TYPE_ID = 'servone:projectType:Workflow' as Ref<ProjectType>
export const WORKFLOW_TASK_TYPE_ID = 'servone:taskType:WorkflowItem' as Ref<TaskType>
export const WORKFLOW_APP_ID = 'servone:app:Workflows' as Ref<Application>
export const WORKFLOW_APP_ALIAS = 'approval'
const WORKFLOW_PLUGIN_ID = 'servone-workflow'
// Follows task createProjectType's mixin naming; a project of this type carries it.
export const WORKFLOW_PROJECT_MIXIN = `${WORKFLOW_TYPE_ID}:type:mixin` as Ref<Class<Doc>>
export const DEPARTMENT_ATTRIBUTE = 'servoneDepartment'
const WORKFLOW_APPLY_SCOPE = 'servone-workflow-setup'

// PaletteColorIndexes in @hcengineering/ui; the same colors tracker's default statuses use.
const COLOR_BY_CATEGORY = new Map<Ref<StatusCategory>, number>([
  [task.statusCategory.UnStarted, 21],
  [task.statusCategory.ToDo, 23],
  [task.statusCategory.Active, 11],
  [task.statusCategory.Won, 17],
  [task.statusCategory.Lost, 22]
])

export interface NewStatus {
  name: string
  category: Ref<StatusCategory>
}

const ALL_CATEGORIES = [
  task.statusCategory.UnStarted,
  task.statusCategory.ToDo,
  task.statusCategory.Active,
  task.statusCategory.Won,
  task.statusCategory.Lost
]

export type SetupClient = Pick<TxOperations, 'findOne' | 'findAll' | 'tx'>

export const systemFactory = new TxFactory(core.account.System)

// Tracker shares status docs by name + category (task createState), so existing ones are reused.
export async function statusTxes (
  client: SetupClient,
  factory: TxFactory,
  statuses: NewStatus[]
): Promise<{ ids: Array<Ref<IssueStatus>>, txes: Array<TxCUD<Doc>> }> {
  const existing = await client.findAll(tracker.class.IssueStatus, {
    ofAttribute: tracker.attribute.IssueStatus,
    name: { $in: statuses.map((status) => status.name) }
  })
  const ids: Array<Ref<IssueStatus>> = []
  const txes: Array<TxCUD<Doc>> = []
  for (const status of statuses) {
    const found = existing.find((doc) => doc.name === status.name && doc.category === status.category)
    if (found !== undefined) {
      ids.push(found._id)
      continue
    }
    const id = generateId<IssueStatus>()
    const color = COLOR_BY_CATEGORY.get(status.category)
    txes.push(factory.createTxCreateDoc(tracker.class.IssueStatus, core.space.Model, { ofAttribute: tracker.attribute.IssueStatus, ...status, color }, id))
    ids.push(id)
  }
  return { ids, txes }
}

interface NewTaskType {
  id: Ref<TaskType>
  parent: Ref<ProjectType>
  name: string
  statuses: Array<Ref<Status>>
}

// Mirrors task createTaskType; each task type needs its own mixin class, which issues of that type carry.
export function taskTypeTxes (factory: TxFactory, kind: NewTaskType): Array<TxCUD<Doc>> {
  const taskMixin = `${kind.id}:type:mixin` as Ref<Class<Doc>>
  const taskType: Data<TaskType> = {
    parent: kind.parent,
    descriptor: tracker.descriptors.Issue,
    name: kind.name,
    kind: 'both',
    ofClass: tracker.class.Issue,
    targetClass: taskMixin,
    statuses: kind.statuses,
    statusClass: tracker.class.IssueStatus,
    statusCategories: ALL_CATEGORIES,
    allowedAsChildOf: [kind.id],
    icon: tracker.icon.Issue
  }
  return [
    factory.createTxCreateDoc(core.class.Mixin, core.space.Model, {
      extends: tracker.class.Issue,
      kind: ClassifierKind.MIXIN,
      label: tracker.string.Issue,
      icon: tracker.icon.Issue
    }, taskMixin),
    factory.createTxMixin(taskMixin, core.class.Mixin, core.space.Model, task.mixin.TaskTypeClass, {
      taskType: kind.id,
      projectType: kind.parent
    }),
    factory.createTxCreateDoc(task.class.TaskType, core.space.Model, taskType, kind.id)
  ]
}

// Mirrors task createProjectType, which needs a full model client; the mixin ids follow its naming.
function typeTxes (factory: TxFactory, statuses: Array<Ref<Status>>): Array<TxCUD<Doc>> {
  const projectType: Data<ProjectType> = {
    name: 'Quy trình',
    description: '',
    descriptor: tracker.descriptors.ProjectType,
    roles: 0,
    tasks: [WORKFLOW_TASK_TYPE_ID],
    statuses: statuses.map((_id) => ({ _id, taskType: WORKFLOW_TASK_TYPE_ID })),
    targetClass: WORKFLOW_PROJECT_MIXIN,
    classic: true
  }
  return [
    ...taskTypeTxes(factory, { id: WORKFLOW_TASK_TYPE_ID, parent: WORKFLOW_TYPE_ID, name: 'Công việc', statuses }),
    factory.createTxCreateDoc(task.class.ProjectType, core.space.Model, projectType, WORKFLOW_TYPE_ID),
    factory.createTxCreateDoc(core.class.Mixin, core.space.Model, {
      extends: tracker.class.Project,
      kind: ClassifierKind.MIXIN,
      label: getEmbeddedLabel(projectType.name),
      icon: tracker.icon.Issues
    }, WORKFLOW_PROJECT_MIXIN),
    factory.createTxMixin(WORKFLOW_PROJECT_MIXIN, core.class.Mixin, core.space.Model, task.mixin.ProjectTypeClass, {
      projectType: WORKFLOW_TYPE_ID
    })
  ]
}

function departmentAttributeTx (factory: TxFactory): TxCUD<Doc> {
  const label = getEmbeddedLabel('Department')
  const type: RefTo<Department> = { _class: core.class.RefTo, label, to: hr.class.Department }
  const attribute: Data<AnyAttribute> = {
    attributeOf: tracker.class.Project,
    name: DEPARTMENT_ATTRIBUTE,
    label,
    type,
    hidden: true
  }
  return factory.createTxCreateDoc(core.class.Attribute, core.space.Model, attribute)
}

function appTx (factory: TxFactory): TxCUD<Doc> {
  return factory.createTxCreateDoc(workbench.class.Application, core.space.Model, {
    label: `${WORKFLOW_PLUGIN_ID}:string:Workflows` as IntlString,
    icon: `${WORKFLOW_PLUGIN_ID}:icon:workflow` as Asset,
    alias: WORKFLOW_APP_ALIAS,
    hidden: false,
    position: 'top',
    // The real navigator is built client-side by the nav extender, so changing it needs no migration.
    navigatorModel: { spaces: [], specials: [] }
  }, WORKFLOW_APP_ID)
}

export async function ensureWorkflowSetup (client: SetupClient): Promise<void> {
  const existing = await client.findOne(workbench.class.Application, { _id: WORKFLOW_APP_ID })
  if (existing !== undefined) {
    if (existing.alias !== WORKFLOW_APP_ALIAS) {
      await client.tx(systemFactory.createTxUpdateDoc(workbench.class.Application, core.space.Model, WORKFLOW_APP_ID, { alias: WORKFLOW_APP_ALIAS }))
    }
    return
  }
  const blank = TEMPLATES.trong.types[0].statuses.map((status) => ({ name: status.name.vi, category: status.category }))
  const statuses = await statusTxes(client, systemFactory, blank)
  const txes = [...statuses.txes, ...typeTxes(systemFactory, statuses.ids), departmentAttributeTx(systemFactory), appTx(systemFactory)]
  const guard: DocumentClassQuery<Doc> = { _class: workbench.class.Application, query: { _id: WORKFLOW_APP_ID } }
  // A concurrent first load makes notMatch fail; the setup then exists, which is all this needs.
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, WORKFLOW_APPLY_SCOPE, [], [guard], txes, undefined))
}
