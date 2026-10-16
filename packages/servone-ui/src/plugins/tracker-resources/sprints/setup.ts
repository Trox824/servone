import core, {
  AccountRole,
  getCurrentAccount,
  hasAccountRole,
  type Class,
  type Data,
  type Doc,
  type Ref,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import task, { createProjectType, updateProjectType, type ProjectType, type TaskType, type TaskTypeWithFactory } from '@hcengineering/task'
import tags from '@hcengineering/tags'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'
import { baseTypeOf, copyIdOf } from '@servone/config'
import { icon } from './plugin'
import {
  SCRUM_ATTRIBUTES,
  SCRUM_STATUSES,
  SCRUM_TYPE_ID,
  TASK_TYPE_IDS,
  TASK_TYPE_LOOK,
  TASK_TYPE_ORDER,
  type AttrKind,
  type IssueTypeKey
} from './scrum-spec'

export const SCRUM_TYPE = SCRUM_TYPE_ID as Ref<ProjectType>

export type { IssueTypeKey }

export const TASK_TYPE = TASK_TYPE_IDS as Record<IssueTypeKey, Ref<TaskType>>

export function issueTypeOf (issue: Pick<Issue, 'kind'>): IssueTypeKey | undefined {
  for (const key of Object.keys(TASK_TYPE) as IssueTypeKey[]) if (TASK_TYPE[key] === baseTypeOf(issue.kind)) return key
  return undefined
}

export function isEpic (issue: Pick<Issue, 'kind'>): boolean {
  return baseTypeOf(issue.kind) === TASK_TYPE.epic
}

export function scrumKindIn (project: Pick<Project, '_id' | 'type'>, key: IssueTypeKey): Ref<TaskType> {
  return project.type === SCRUM_TYPE ? TASK_TYPE[key] : copyIdOf(TASK_TYPE[key], project._id)
}

export function isScrumProject (project: Pick<Project, 'type'> | undefined): boolean {
  return project !== undefined && baseTypeOf(project.type) === SCRUM_TYPE
}

export function canSetUp (): boolean {
  return hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
}

const ATTR_OF: Record<(typeof SCRUM_ATTRIBUTES)[number]['of'], Ref<Class<Doc>>> = {
  Issue: tracker.class.Issue,
  Milestone: tracker.class.Milestone,
  Project: tracker.class.Project,
  TagElement: tags.class.TagElement
}

const ATTR_TYPE: Record<AttrKind, Record<string, unknown>> = {
  number: { _class: core.class.TypeNumber, label: core.string.Number, icon: core.icon.TypeNumber },
  string: { _class: core.class.TypeString, label: core.string.String, icon: core.icon.TypeString },
  boolean: { _class: core.class.TypeBoolean, label: core.string.Boolean, icon: core.icon.TypeBoolean },
  timestamp: { _class: core.class.TypeTimestamp, label: core.string.Timestamp, icon: core.icon.TypeDate },
  issueRefs: {
    _class: core.class.ArrOf,
    label: core.string.Array,
    of: { _class: core.class.RefTo, label: core.string.Ref, to: tracker.class.Issue }
  }
}

/** Declares the sprint fields that are missing. Model writes: needs a maintainer. */
export async function ensureScrumAttributes (client: TxOperations): Promise<void> {
  const existing = await client.findAll(core.class.Attribute, {
    attributeOf: { $in: Object.values(ATTR_OF) }
  })
  for (const a of SCRUM_ATTRIBUTES) {
    const of = ATTR_OF[a.of]
    if (existing.some((e) => e.attributeOf === of && e.name === a.name)) continue
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: of,
      name: a.name,
      label: getEmbeddedLabel(a.label) as IntlString,
      type: ATTR_TYPE[a.kind] as any,
      isCustom: true,
      hidden: a.hidden
    })
  }
}

function statusFactory (): Array<Data<Status>> {
  return SCRUM_STATUSES.map((st) => ({
    ofAttribute: tracker.attribute.IssueStatus,
    name: st.name,
    color: st.color,
    category: task.statusCategory[st.category] as any
  }))
}

function taskTypes (): TaskTypeWithFactory[] {
  const all = Object.values(TASK_TYPE)
  return TASK_TYPE_ORDER.map((key) => ({
    _id: TASK_TYPE[key],
    name: TASK_TYPE_LOOK[key].name,
    descriptor: tracker.descriptors.Issue,
    kind: 'both',
    ofClass: tracker.class.Issue,
    statusClass: tracker.class.IssueStatus,
    statusCategories: [
      task.statusCategory.UnStarted,
      task.statusCategory.ToDo,
      task.statusCategory.Active,
      task.statusCategory.Won,
      task.statusCategory.Lost
    ],
    allowedAsChildOf: key === 'epic' ? [] : all,
    icon: icon[key],
    color: TASK_TYPE_LOOK[key].color,
    factory: statusFactory()
  }))
}

async function ensureScrumType (client: TxOperations): Promise<void> {
  const exists = await client.findOne(task.class.ProjectType, { _id: SCRUM_TYPE })
  if (exists === undefined) {
    await createProjectType(
      client,
      {
        name: 'Scrum',
        descriptor: tracker.descriptors.ProjectType,
        description: 'Epics, stories, tasks and bugs, planned in sprints',
        tasks: [],
        roles: 0,
        classic: true
      } as any,
      taskTypes(),
      SCRUM_TYPE
    )
  } else {
    await updateProjectType(client, SCRUM_TYPE, taskTypes())
  }
  const types = await client.findAll(task.class.TaskType, { parent: SCRUM_TYPE })
  for (const key of Object.keys(TASK_TYPE) as IssueTypeKey[]) {
    const tt = types.find((t) => t._id === TASK_TYPE[key])
    if (tt !== undefined && (tt.icon !== icon[key] || tt.color !== TASK_TYPE_LOOK[key].color)) {
      await client.update(tt, { icon: icon[key], color: TASK_TYPE_LOOK[key].color })
    }
  }
}

export async function ensureScrumProjectType (client: TxOperations): Promise<void> {
  if ((await client.findOne(task.class.ProjectType, { _id: SCRUM_TYPE })) !== undefined) return
  await ensureScrumAttributes(client)
  await ensureScrumType(client)
}

async function moveProject (client: TxOperations, project: Project): Promise<void> {
  const type = await client.findOne(task.class.ProjectType, { _id: SCRUM_TYPE })
  if (type === undefined) throw new Error('Scrum project type was not created')
  if (baseTypeOf(project.type) !== SCRUM_TYPE) {
    await client.update(project, { type: SCRUM_TYPE })
  }
  if (!client.getHierarchy().hasMixin(project, type.targetClass)) {
    await client.createMixin(project._id, tracker.class.Project, core.space.Space, type.targetClass, {})
  }
  const scrumKinds = new Set<string>(Object.values(TASK_TYPE))
  const issues = await client.findAll(tracker.class.Issue, { space: project._id }, { projection: { _id: 1, kind: 1, space: 1 } as any })
  const legacy = issues.filter((it) => !scrumKinds.has(baseTypeOf(it.kind)))
  for (let i = 0; i < legacy.length; i += 100) {
    const ops = client.apply(undefined, 'servone-scrum-setup')
    for (const it of legacy.slice(i, i + 100)) {
      await ops.update(it, { kind: TASK_TYPE.task })
    }
    await ops.commit()
  }
}

export async function setUpScrum (client: TxOperations, project: Project): Promise<void> {
  await ensureScrumAttributes(client)
  await ensureScrumType(client)
  await moveProject(client, project)
}
