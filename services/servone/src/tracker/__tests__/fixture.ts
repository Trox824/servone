import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import core, { type Class, type Doc, type DocumentQuery, type MarkupBlobRef, type Ref, SocialIdType, toFindResult } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import tags, { type TagElement, type TagReference } from '@hcengineering/tags'
import task, { type ProjectStatus, type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { IssuePriority, type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'

import { fakeSession, ME_PERSON, ME_SOCIAL } from '../../mcp/__tests__/fixtures'

type ProjectRow = Doc & Pick<Project, 'identifier' | 'name' | 'type' | 'defaultIssueStatus' | 'archived'>
type ProjectTypeRow = Doc & { statuses: Array<Pick<ProjectStatus, '_id'>> }
export type TaskTypeRow = Doc & Pick<TaskType, 'parent' | 'name' | 'statuses'>
type IssueStatusRow = Doc & Pick<IssueStatus, 'name' | 'category'>
export type IssueRow = Doc &
Pick<Issue, 'identifier' | 'number' | 'title' | 'status' | 'priority' | 'assignee' | 'description' | 'dueDate' | 'rank'>
type PersonRow = Doc & Pick<Person, 'name'>
type EmployeeRow = Doc & Pick<Employee, 'name' | 'active'>
export type SocialIdentityRow = Doc & Pick<SocialIdentity, 'attachedTo' | 'type' | 'value'>
export type ChatMessageRow = Doc & Pick<ChatMessage, 'attachedTo' | 'createdBy' | 'createdOn' | 'message'>
type TagElementRow = Doc & Pick<TagElement, 'title' | 'targetClass' | 'color'>
export type TagReferenceRow = Doc & Pick<TagReference, 'attachedTo' | 'attachedToClass' | 'collection' | 'tag' | 'title' | 'color'>

export const SCRUM_TYPE_ID = 'servone:projectType:Scrum' as Ref<ProjectType>
export const SCRUM_TASK = 'servone:taskType:Task' as Ref<TaskType>
export const ST_BACKLOG = 'st-backlog' as Ref<IssueStatus>
export const ST_PROGRESS = 'st-progress' as Ref<IssueStatus>
export const PERSON_AN = 'person-an' as Ref<Employee>
export const PROJECT_SRV = 'p-srv' as Ref<Project>
export const TAG_BUG = 'tag-bug' as Ref<TagElement>
export const TAG_FRONTEND = 'tag-frontend' as Ref<TagElement>
export const FIRST_RANK = makeRank(undefined, undefined)
export const BASE = { space: core.space.Space, modifiedOn: 0, modifiedBy: ME_SOCIAL }

function matches (row: Doc, query: DocumentQuery<Doc>): boolean {
  const fields = new Map(Object.entries(row))
  return Object.entries(query).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(fields.get(key))
    if (cond !== null && typeof cond === 'object') return true
    return fields.get(key) === cond
  })
}

export function rowsOf (tables: Map<Ref<Class<Doc>>, Doc[]>, cls: Ref<Class<Doc>>): Doc[] {
  const rows = tables.get(cls)
  if (rows === undefined) throw new Error(`no table ${cls}`)
  return rows
}

export interface Fixture {
  tables: Map<Ref<Class<Doc>>, Doc[]>
  findAll: jest.Mock
  findOne: jest.Mock
  updateDoc: jest.Mock
  addCollection: jest.Mock
  removeCollection: jest.Mock
  update: jest.Mock
  writeMarkdown: jest.Mock
  readMarkdown: jest.Mock
  updateMarkdown: jest.Mock
  session: ReturnType<typeof fakeSession>
}

export function setup (): Fixture {
  const session = fakeSession()
  const projects: ProjectRow[] = [
    { ...BASE, _id: PROJECT_SRV, _class: tracker.class.Project, identifier: 'SRV', name: 'Servone', type: SCRUM_TYPE_ID, defaultIssueStatus: ST_BACKLOG, archived: false }
  ]
  const projectTypes: ProjectTypeRow[] = [
    { ...BASE, _id: SCRUM_TYPE_ID, _class: task.class.ProjectType, statuses: [{ _id: ST_BACKLOG }, { _id: ST_PROGRESS }] }
  ]
  const taskTypes: TaskTypeRow[] = [
    { ...BASE, _id: SCRUM_TASK, _class: task.class.TaskType, parent: SCRUM_TYPE_ID, name: 'Task', statuses: [ST_BACKLOG, ST_PROGRESS] }
  ]
  const statuses: IssueStatusRow[] = [
    { ...BASE, _id: ST_BACKLOG, _class: tracker.class.IssueStatus, name: 'Backlog', category: task.statusCategory.UnStarted },
    { ...BASE, _id: ST_PROGRESS, _class: tracker.class.IssueStatus, name: 'In Progress', category: task.statusCategory.Active }
  ]
  const persons: PersonRow[] = [
    { ...BASE, _id: ME_PERSON, _class: contact.class.Person, name: 'Nguyen,Hung' },
    { ...BASE, _id: PERSON_AN, _class: contact.class.Person, name: 'Tran,An' }
  ]
  const employees: EmployeeRow[] = [
    { ...BASE, _id: ME_PERSON as Ref<Employee>, _class: contact.mixin.Employee, name: 'Nguyen,Hung', active: true },
    { ...BASE, _id: PERSON_AN, _class: contact.mixin.Employee, name: 'Tran,An', active: true }
  ]
  const identities: SocialIdentityRow[] = [
    { ...BASE, _id: 'social-an' as Ref<SocialIdentity>, _class: contact.class.SocialIdentity, attachedTo: PERSON_AN, type: SocialIdType.EMAIL, value: 'an@servone.vn' }
  ]
  const tagElements: TagElementRow[] = [
    { ...BASE, _id: TAG_BUG, _class: tags.class.TagElement, title: 'Bug', targetClass: tracker.class.Issue, color: 1 },
    { ...BASE, _id: TAG_FRONTEND, _class: tags.class.TagElement, title: 'frontend', targetClass: tracker.class.Issue, color: 2 },
    { ...BASE, _id: 'tag-doc' as Ref<TagElement>, _class: tags.class.TagElement, title: 'docs', targetClass: tracker.class.Project, color: 3 }
  ]
  const tables = new Map<Ref<Class<Doc>>, Doc[]>([
    [tracker.class.Project, projects],
    [task.class.ProjectType, projectTypes],
    [task.class.TaskType, taskTypes],
    [tracker.class.IssueStatus, statuses],
    [tracker.class.Issue, []],
    [contact.class.Person, persons],
    [contact.mixin.Employee, employees],
    [contact.class.SocialIdentity, identities],
    [chunter.class.ChatMessage, []],
    [tags.class.TagElement, tagElements],
    [tags.class.TagReference, []]
  ])
  const findAll = jest.fn().mockImplementation(async (cls: Ref<Class<Doc>>, query: DocumentQuery<Doc>) =>
    toFindResult((tables.get(cls) ?? []).filter((row) => matches(row, query)))
  )
  const findOne = jest.fn().mockImplementation(async (cls: Ref<Class<Doc>>, query: DocumentQuery<Doc>) =>
    (tables.get(cls) ?? []).find((row) => matches(row, query))
  )
  let sequence = 12
  const updateDoc = jest.fn().mockImplementation(async () => {
    sequence += 1
    return { object: { sequence } }
  })
  const addCollection = jest.fn().mockResolvedValue('new-id' as Ref<Doc>)
  const removeCollection = jest.fn().mockResolvedValue('i-12' as Ref<Doc>)
  const update = jest.fn().mockResolvedValue({})
  const writeMarkdown = jest.fn().mockResolvedValue('blob-ref' as MarkupBlobRef)
  const readMarkdown = jest.fn().mockResolvedValue('Body **text**')
  const updateMarkdown = jest.fn().mockResolvedValue(undefined)
  session.client.findAll = findAll
  session.client.findOne = findOne
  session.client.updateDoc = updateDoc
  session.client.addCollection = addCollection
  session.client.removeCollection = removeCollection
  session.client.update = update
  session.collab.writeMarkdown = writeMarkdown
  session.collab.readMarkdown = readMarkdown
  session.collab.updateMarkdown = updateMarkdown
  return { tables, findAll, findOne, updateDoc, addCollection, removeCollection, update, writeMarkdown, readMarkdown, updateMarkdown, session }
}

export function issueRow (n: number, overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    ...BASE,
    _id: `i-${n}` as Ref<Issue>,
    _class: tracker.class.Issue,
    space: PROJECT_SRV,
    identifier: `SRV-${n}`,
    number: n,
    title: `Issue ${n}`,
    status: ST_PROGRESS,
    priority: IssuePriority.High,
    assignee: PERSON_AN,
    description: null,
    dueDate: null,
    rank: FIRST_RANK,
    createdOn: Date.UTC(2026, 8, 27, 8, 15),
    ...overrides
  }
}

export function labelRow (issue: Ref<Issue>, tag: Ref<TagElement>, title: string): TagReferenceRow {
  return {
    ...BASE,
    _id: `ref-${tag}` as Ref<TagReference>,
    _class: tags.class.TagReference,
    space: PROJECT_SRV,
    attachedTo: issue,
    attachedToClass: tracker.class.Issue,
    collection: 'labels',
    tag,
    title,
    color: 1
  }
}

// Rows are typed as Doc; the code under test only reads the fields these rows carry.
export async function issueIn (f: Fixture, n: number): Promise<Issue> {
  const issue: Issue | undefined = await f.session.client.findOne(tracker.class.Issue, { identifier: `SRV-${n}` })
  if (issue === undefined) throw new Error(`no issue SRV-${n}`)
  return issue
}
