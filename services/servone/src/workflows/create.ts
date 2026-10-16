import contact from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Class,
  type Data,
  type Doc,
  generateId,
  notEmpty,
  type Ref,
  systemAccount,
  type TxCUD
} from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { IssuePriority, type IssueStatus, type IssueTemplate, TimeReportDayType } from '@hcengineering/tracker'
import { copyIdOf, ensureOwnType, setStatusApproval } from '@servone/config'
import { type FormTemplate, serializeFormDefinition } from '@servone/forms'
import { HELPDESK_FIELDS, slaToJson } from '@servone/notify-rules'
import type { ProjectWithSync } from '../dept-channels/join'
import type { Json } from '../http-json'
import { DEPARTMENT_ATTRIBUTE, ensureWorkflowSetup, type SetupClient, statusTxes, systemFactory, taskTypeTxes, WORKFLOW_PROJECT_MIXIN, WORKFLOW_TASK_TYPE_ID, WORKFLOW_TYPE_ID } from './setup'
import { formOf, isTemplateKey, type Language, type TemplateKey, type TemplateStatus, TEMPLATES, type WorkflowTemplate } from './templates'

const MAX_NAME_LENGTH = 100 // spec: 1..100 chars after trim
const MIN_IDENTIFIER = 2
const MAX_IDENTIFIER = 5
const FALLBACK_IDENTIFIER = 'QT'
const CREATE_SCOPE = 'servone-workflow-create'

export type CreateError = 'invalid_name' | 'unknown_department' | 'unknown_template'
export type CreateOutcome = { project: Ref<WorkflowProject> } | { error: CreateError }

interface WorkflowProject extends ProjectWithSync {
  [DEPARTMENT_ATTRIBUTE]?: Ref<Department>
  // Must match SRV-19's default-template attribute read by CreateIssue.svelte.
  servoneDefaultTemplate?: Ref<IssueTemplate>
  // People finds the Nhận việc / Nghỉ việc workflow by this (servone-ui workflows/onboarding/start-job.ts).
  servoneTemplate?: TemplateKey
  [HELPDESK_FIELDS.sla]?: string
  [HELPDESK_FIELDS.autoCloseDays]?: number
}

interface CreateRequest {
  name: string
  department: Ref<Department>
  key: TemplateKey
  template: WorkflowTemplate
  language: Language
}

function parseRequest (body: Json): CreateRequest | CreateError {
  const fields = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const name = typeof fields.name === 'string' ? fields.name.trim() : ''
  if (name === '' || name.length > MAX_NAME_LENGTH) return 'invalid_name'
  if (typeof fields.template !== 'string' || !isTemplateKey(fields.template)) return 'unknown_template'
  if (typeof fields.department !== 'string') return 'unknown_department'
  return {
    name,
    department: fields.department as Ref<Department>,
    key: fields.template,
    template: TEMPLATES[fields.template],
    language: fields.language === 'en' ? 'en' : 'vi'
  }
}

// "Tuyển dụng" -> TD: diacritics stripped, word initials, then a numeric suffix until unused.
function uniqueIdentifier (name: string, taken: Set<string>): string {
  const words = name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'D').toUpperCase().split(/[^A-Z]+/).filter((word) => word !== '')
  const initials = words.map((word) => word[0]).join('')
  const letters = words.join('')
  const base = initials.length >= MIN_IDENTIFIER ? initials.slice(0, MAX_IDENTIFIER) : letters.slice(0, MIN_IDENTIFIER)
  const stem = base.length >= MIN_IDENTIFIER ? base : FALLBACK_IDENTIFIER
  if (!taken.has(stem)) return stem
  for (let suffix = 2; ; suffix++) {
    if (!taken.has(`${stem}${suffix}`)) return `${stem}${suffix}`
  }
}

async function staffAccounts (client: SetupClient, department: Department): Promise<AccountUuid[]> {
  const employees = await client.findAll(contact.mixin.Employee, { _id: { $in: department.members }, active: true })
  return employees.map((employee) => employee.personUuid).filter(notEmpty)
}

export async function createWorkflow (client: SetupClient, creator: AccountUuid, body: Json): Promise<CreateOutcome> {
  const request = parseRequest(body)
  if (typeof request === 'string') return { error: request }
  const department = await client.findOne(hr.class.Department, { _id: request.department })
  if (department === undefined) return { error: 'unknown_department' }

  await ensureWorkflowSetup(client)
  const { template, language } = request
  const nameOf = (status: TemplateStatus): string => status.name[language]
  const templateStatuses = [...new Map(template.types.flatMap((type) => type.statuses).map((it) => [nameOf(it), it])).values()]
  const statuses = await statusTxes(client, systemFactory, templateStatuses.map((it) => ({ name: nameOf(it), category: it.category })))
  const statusIds = new Map(templateStatuses.map((it, i) => [nameOf(it), statuses.ids[i]]))
  const idsOf = (list: TemplateStatus[]): Array<Ref<IssueStatus>> => list.map((it) => statusIds.get(nameOf(it))).filter(notEmpty)
  const projects = await client.findAll(tracker.class.Project, {}, { projection: { identifier: 1 } })
  const identifier = uniqueIdentifier(request.name, new Set(projects.map((it) => it.identifier.toUpperCase())))
  const projectId = generateId<WorkflowProject>()
  const formId = template.fields.length > 0 ? generateId<IssueTemplate>() : undefined
  const project: Data<WorkflowProject> = {
    name: request.name,
    description: '',
    private: false,
    archived: false,
    owners: [creator],
    members: Array.from(new Set([creator, ...(await staffAccounts(client, department))])),
    type: WORKFLOW_TYPE_ID,
    identifier,
    sequence: 0,
    defaultIssueStatus: statuses.ids[0],
    defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
    [DEPARTMENT_ATTRIBUTE]: department._id,
    servoneSyncDepartment: department._id,
    servoneDefaultTemplate: formId,
    servoneTemplate: request.key
  }
  if (template.helpdesk !== undefined) {
    project[HELPDESK_FIELDS.sla] = slaToJson({ since: Date.now(), targets: template.helpdesk.sla })
    project[HELPDESK_FIELDS.autoCloseDays] = template.helpdesk.autoCloseDays
  }
  const workflowClass: Ref<Class<WorkflowProject>> = tracker.class.Project
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, CREATE_SCOPE, [], [], [
    ...statuses.txes,
    systemFactory.createTxCreateDoc(workflowClass, core.space.Space, project, projectId),
    systemFactory.createTxMixin(projectId, tracker.class.Project, core.space.Space, WORKFLOW_PROJECT_MIXIN, {})
  ], undefined))

  const session = { client, account: { ...systemAccount, primarySocialId: core.account.System } }
  const typeId: Ref<ProjectType> = await ensureOwnType(session, projectId)
  const [firstType, ...moreTypes] = template.types
  const kind = copyIdOf(WORKFLOW_TASK_TYPE_ID, projectId)
  const moreKinds = moreTypes.map(() => generateId<TaskType>())
  const kinds = [kind, ...moreKinds]
  const txes: Array<TxCUD<Doc>> = [
    systemFactory.createTxUpdateDoc(task.class.ProjectType, core.space.Model, typeId, {
      tasks: kinds,
      statuses: template.types.flatMap((type, i) => idsOf(type.statuses).map((_id) => ({ _id, taskType: kinds[i] })))
    }),
    systemFactory.createTxUpdateDoc(task.class.TaskType, core.space.Model, kind, {
      name: firstType.name[language],
      statuses: idsOf(firstType.statuses)
    }),
    ...moreTypes.flatMap((type, i) =>
      taskTypeTxes(systemFactory, { id: moreKinds[i], parent: typeId, name: type.name[language], statuses: idsOf(type.statuses) })
    )
  ]
  if (formId !== undefined) {
    const form: Data<FormTemplate> = {
      title: template.name[language],
      description: '',
      priority: IssuePriority.NoPriority,
      assignee: null,
      component: null,
      estimation: 0,
      children: [],
      comments: 0,
      kind,
      servoneForm: serializeFormDefinition(formOf(template, language))
    }
    txes.push(systemFactory.createTxCreateDoc(tracker.class.IssueTemplate, projectId, form, formId))
  }
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, CREATE_SCOPE, [], [], txes, undefined))
  for (const statusId of idsOf(templateStatuses.filter((it) => it.needsApproval))) {
    await setStatusApproval(session, projectId, statusId, { by: 'manager' })
  }
  return { project: projectId }
}
