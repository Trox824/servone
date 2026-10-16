import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { type Person } from '@hcengineering/contact'
import core, { type AccountUuid, type MarkupBlobRef, type Ref, TxFactory } from '@hcengineering/core'
import hr from '@hcengineering/hr'
import task, { type ProjectType } from '@hcengineering/task'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'
import { type MemoryWorkspace, memoryWorkspace } from '../../workflows/__tests__/memory-workspace'
import { pickLanguage } from '../content'
import { joinedPerson } from '../../joined-person'
import { isStarterWindow } from '../index'
import { GENERAL_CHANNEL, RANDOM_CHANNEL, seedStarter, WELCOME_ID } from '../seed'

jest.mock('../../config', () => ({ __esModule: true, default: {} }))

interface TemplatedProject extends Project {
  servoneTemplate?: string
}

const CREATOR = { account: 'acc-owner' as AccountUuid, person: 'person-owner' as Ref<Person> }
const CLASSIC_TYPE = 'type-classic' as Ref<ProjectType>
const DAY_MS = 24 * 60 * 60 * 1000
const collab = { writeMarkdown: async (): Promise<MarkupBlobRef> => 'blob' as MarkupBlobRef }

function newWorkspace (): MemoryWorkspace {
  const ws = memoryWorkspace()
  ws.seed(tracker.class.IssueStatus, 'st-backlog', { name: 'Backlog', category: task.statusCategory.UnStarted })
  ws.seed(tracker.class.IssueStatus, 'st-todo', { name: 'Todo', category: task.statusCategory.ToDo })
  ws.seed(tracker.class.IssueStatus, 'st-done', { name: 'Done', category: task.statusCategory.Won })
  ws.seed(task.class.TaskType, 'kind-issue', { parent: CLASSIC_TYPE, statuses: ['st-backlog', 'st-todo', 'st-done'] })
  ws.seed(tracker.class.Project, tracker.project.DefaultProject, {
    name: 'Default', description: 'Default project', identifier: 'TSK', sequence: 0, type: CLASSIC_TYPE, defaultIssueStatus: 'st-backlog'
  })
  ws.seed(chunter.class.Channel, GENERAL_CHANNEL, { name: 'general', description: 'General Channel' })
  ws.seed(chunter.class.Channel, RANDOM_CHANNEL, { name: 'random', description: 'Random Talks' })
  ws.seed(hr.class.Department, hr.ids.Head, { name: 'Organization', members: [] })
  return ws
}

const issues = (ws: MemoryWorkspace): Issue[] => ws.rows(tracker.class.Issue) as Issue[]
const workflows = (ws: MemoryWorkspace): TemplatedProject[] =>
  (ws.rows(tracker.class.Project) as TemplatedProject[]).filter((project) => project.servoneTemplate === 'nhan-viec')

describe('pickLanguage', () => {
  it.each([
    ['Công ty Ánh Dương', 'Smith,John', 'vi'],
    ['Acme', 'Nguyen,Hung', 'vi'],
    ['Acme', 'Trần,Bình', 'vi'],
    ['Đông Á', 'Lee,Ann', 'vi'],
    ['Acme', 'Smith,John', 'en']
  ])('%s / %s -> %s', (workspace, person, language) => {
    expect(pickLanguage(workspace, person)).toBe(language)
  })
})

describe('starter trigger', () => {
  const factory = new TxFactory(core.account.System)
  it('reads the person from an active Employee mixin only', () => {
    const joined = factory.createTxMixin(CREATOR.person, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, { active: true })
    const deactivated = factory.createTxMixin(CREATOR.person, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, { active: false })
    const unrelated = factory.createTxUpdateDoc(contact.class.Person, contact.space.Contacts, CREATOR.person, { city: 'Huế' })
    expect(joinedPerson(joined)).toBe(CREATOR.person)
    expect(joinedPerson(deactivated)).toBeUndefined()
    expect(joinedPerson(unrelated)).toBeUndefined()
  })
  it('only seeds workspaces created in the last day', () => {
    const now = 10 * DAY_MS
    expect(isStarterWindow(now - 60_000, now)).toBe(true)
    expect(isStarterWindow(now - 2 * DAY_MS, now)).toBe(false)
  })
})

describe('seedStarter', () => {
  it('fills DefaultProject, the channels and an onboarding workflow in Vietnamese', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'vi', 'both')

    const [project] = ws.rows(tracker.class.Project) as Project[]
    expect(project).toMatchObject({ name: 'Bắt đầu', sequence: 4 })
    expect(issues(ws).map((issue) => [issue.identifier, issue.status, issue.assignee])).toEqual(
      [1, 2, 3, 4].map((n) => [`TSK-${n}`, 'st-todo', CREATOR.person])
    )
    expect(issues(ws)[0].title).toBe('Mời một đồng nghiệp')
    expect(workflows(ws).map((workflow) => workflow.name)).toEqual(['Nhận việc'])
    const [welcome] = ws.rows(chunter.class.ChatMessage) as ChatMessage[]
    expect(welcome).toMatchObject({ _id: WELCOME_ID, attachedTo: GENERAL_CHANNEL, isPinned: true })
    expect(ws.rows(chunter.class.Channel).map((channel) => Reflect.get(channel, 'description'))).toEqual([
      'Thông báo chung của cả công ty',
      'Chuyện ngoài lề công việc'
    ])
  })

  it('writes English content for an English workspace', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', 'both')
    expect((ws.rows(tracker.class.Project)[0] as Project).name).toBe('Getting started')
    expect(issues(ws)[0].title).toBe('Invite a teammate')
    expect(workflows(ws).map((workflow) => workflow.name)).toEqual(['Onboarding'])
  })

  it('writes nothing on a second run', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'vi', 'both')
    const sent = ws.sent.length
    await seedStarter(ws.client, collab, CREATOR, 'vi', 'both')
    expect(ws.sent.length).toBe(sent)
  })

  it('finishes an interrupted run without duplicating issues or the workflow', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'vi', 'both')
    const messages = ws.rows(chunter.class.ChatMessage)
    messages.splice(0, messages.length)
    await seedStarter(ws.client, collab, CREATOR, 'vi', 'both')
    expect(issues(ws)).toHaveLength(4)
    expect(workflows(ws)).toHaveLength(1)
    expect(ws.rows(chunter.class.ChatMessage)).toHaveLength(1)
  })

  it('keeps a channel description someone already wrote', async () => {
    const ws = newWorkspace()
    const [general] = ws.rows(chunter.class.Channel)
    Object.assign(general, { description: 'Kênh của sếp' })
    await seedStarter(ws.client, collab, CREATOR, 'vi', 'both')
    expect(Reflect.get(general, 'description')).toBe('Kênh của sếp')
  })
})
