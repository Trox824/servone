import type { Person } from '@hcengineering/contact'
import core, { generateId, SortingOrder, type Class, type Ref, type TxOperations, type TxResult } from '@hcengineering/core'
import hr from '@hcengineering/hr'
import task, { makeRank } from '@hcengineering/task'
import tracker, { IssuePriority, type Issue, type IssueParentInfo, type Project } from '@hcengineering/tracker'
import { malformed } from '../../../chunter-resources/webhooks/api'
import { createWorkflow } from '../create'
import { JOB_TEMPLATES, type JobDraft, type JobKind, type Language, type StepDraft } from './onboarding'

interface TemplatedProject extends Project {
  servoneTemplate?: string
}
export const templatedProjectClass: Ref<Class<TemplatedProject>> = tracker.class.Project

export interface JobIssue extends Issue {
  servoneJobKind?: JobKind
  servoneJobPerson?: Ref<Person>
  servoneHeldFor?: Ref<Person>
}
export const jobIssueClass: Ref<Class<JobIssue>> = tracker.class.Issue
type JobTags = Pick<JobIssue, 'servoneJobKind' | 'servoneJobPerson' | 'servoneHeldFor'>

function bumpedSequence (bump: TxResult): number {
  if ('object' in bump && typeof bump.object === 'object' && bump.object !== null && 'sequence' in bump.object) {
    const { sequence } = bump.object
    if (typeof sequence === 'number') return sequence
  }
  throw malformed('project sequence bump')
}

async function jobWorkflow (client: TxOperations, kind: JobKind, language: Language): Promise<Project> {
  const template = JOB_TEMPLATES[kind]
  const existing = await client.findOne(templatedProjectClass, { servoneTemplate: template.key, archived: false })
  if (existing !== undefined) return existing
  const created = await createWorkflow({ name: template.name[language], department: hr.ids.Head, template: template.key, language })
  const project = await client.findOne(templatedProjectClass, { _id: created })
  if (project === undefined) throw new Error(`Workflow ${created} not found after create`)
  return project
}

async function addItem (
  client: TxOperations,
  project: Project,
  item: Pick<StepDraft<Ref<Person>>, 'title' | 'assignee' | 'dueDate'> & { startDate: number | null },
  parent: IssueParentInfo | undefined,
  tags: JobTags
): Promise<IssueParentInfo> {
  const projectType = await client.findOne(task.class.ProjectType, { _id: project.type })
  const kind = projectType?.tasks[0]
  if (kind === undefined || project.defaultIssueStatus === undefined) throw new Error(`Workflow ${project.identifier} has no item type yet`)
  const number = bumpedSequence(await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true))
  const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
  const id = generateId<Issue>()
  const identifier = `${project.identifier}-${number}`
  await client.addCollection(jobIssueClass, project._id, parent?.parentId ?? tracker.ids.NoParent, tracker.class.Issue, 'subIssues', {
    title: item.title,
    description: null,
    assignee: item.assignee,
    component: null,
    number,
    status: project.defaultIssueStatus,
    priority: IssuePriority.NoPriority,
    rank: makeRank(last?.rank, undefined),
    comments: 0,
    subIssues: 0,
    startDate: item.startDate,
    dueDate: item.dueDate,
    parents: parent === undefined ? [] : [parent],
    remainingTime: 0,
    estimation: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    identifier,
    kind,
    relations: [],
    ...tags
  }, id)
  return { parentId: id, identifier, parentTitle: item.title, space: project._id }
}

export async function startJob (
  client: TxOperations,
  kind: JobKind,
  person: Ref<Person>,
  job: JobDraft<Ref<Person>>,
  language: Language
): Promise<Ref<Issue>> {
  const project = await jobWorkflow(client, kind, language)
  const parent = await addItem(client, project, job, undefined, { servoneJobKind: kind, servoneJobPerson: person })
  for (const step of job.steps) {
    await addItem(client, project, { ...step, startDate: null }, parent, step.isHeld ? { servoneHeldFor: person } : {})
  }
  return parent.parentId
}
