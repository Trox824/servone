import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import core, { type Class, type Doc, type DocumentQuery, type MarkupBlobRef, type PersonId, type Ref, toFindResult } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task, { type ProjectStatus, type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { IssuePriority, MilestoneStatus, type Issue, type IssueStatus, type Milestone, type Project } from '@hcengineering/tracker'

import { CollabTimeoutError } from '../collab'
import { ToolInputError, type AnyTool } from '../tool'
import { normalizeIssueId, trackerTools } from '../tools/tracker'
import { fakeSession, ME_PERSON, ME_SOCIAL } from './fixtures'

type ProjectRow = Doc & Pick<Project, 'identifier' | 'name' | 'type' | 'defaultIssueStatus' | 'archived'>
type ProjectTypeRow = Doc & { statuses: Array<Pick<ProjectStatus, '_id'>> }
type TaskTypeRow = Doc & Pick<TaskType, 'parent' | 'name' | 'statuses'>
type IssueStatusRow = Doc & Pick<IssueStatus, 'name' | 'category'>
type IssueRow = Doc &
  Pick<Issue, 'identifier' | 'number' | 'title' | 'status' | 'priority' | 'assignee' | 'description' | 'dueDate' | 'rank' | 'milestone'> & {
    storyPoints?: number | null
  }
type MilestoneRow = Doc & Pick<Milestone, 'label' | 'status'> & { sprintState?: string }
type EmployeeRow = Doc & Pick<Employee, 'name' | 'active'>
type PersonRow = Doc & Pick<Person, 'name'>
type SocialIdentityRow = Doc & Pick<SocialIdentity, 'attachedTo'>
type ChatMessageRow = Doc & Pick<ChatMessage, 'attachedTo' | 'createdBy' | 'createdOn' | 'message'>

const SCRUM_TYPE_ID = 'servone:projectType:Scrum' as Ref<ProjectType>
const CLASSIC_TYPE_ID = 'pt-classic' as Ref<ProjectType>
const SCRUM_TASK = 'servone:taskType:Task' as Ref<TaskType>
const SCRUM_BUG = 'servone:taskType:Bug' as Ref<TaskType>
const ST_BACKLOG = 'st-backlog' as Ref<IssueStatus>
const ST_TODO = 'st-todo' as Ref<IssueStatus>
const ST_PROGRESS = 'st-progress' as Ref<IssueStatus>
const PERSON_AN = 'person-an' as Ref<Employee>
const ME_EMPLOYEE = ME_PERSON as Ref<Employee>
const FIRST_RANK = makeRank(undefined, undefined)
const BASE = { space: core.space.Space, modifiedOn: 0, modifiedBy: ME_SOCIAL }

function matches (row: Doc, query: DocumentQuery<Doc>): boolean {
  const fields = new Map(Object.entries(row))
  return Object.entries(query).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(fields.get(key))
    if (cond !== null && typeof cond === 'object') return true
    return fields.get(key) === cond
  })
}

function rowsOf (tables: Map<Ref<Class<Doc>>, Doc[]>, cls: Ref<Class<Doc>>): Doc[] {
  const rows = tables.get(cls)
  if (rows === undefined) throw new Error(`no table ${cls}`)
  return rows
}

interface Fixture {
  tables: Map<Ref<Class<Doc>>, Doc[]>
  findAll: jest.Mock
  findOne: jest.Mock
  updateDoc: jest.Mock
  addCollection: jest.Mock
  update: jest.Mock
  writeMarkdown: jest.Mock
  readMarkdown: jest.Mock
  updateMarkdown: jest.Mock
  session: ReturnType<typeof fakeSession>
}

function setup (): Fixture {
  const session = fakeSession()
  const projects: ProjectRow[] = [
    { ...BASE, _id: 'p-srv' as Ref<Project>, _class: tracker.class.Project, identifier: 'SRV', name: 'Servone', type: SCRUM_TYPE_ID, defaultIssueStatus: ST_BACKLOG, archived: false },
    { ...BASE, _id: 'p-ops' as Ref<Project>, _class: tracker.class.Project, identifier: 'OPS', name: 'Operations', type: CLASSIC_TYPE_ID, archived: false }
  ]
  const projectTypes: ProjectTypeRow[] = [
    { ...BASE, _id: SCRUM_TYPE_ID, _class: task.class.ProjectType, statuses: [{ _id: ST_BACKLOG }, { _id: ST_PROGRESS }] },
    { ...BASE, _id: CLASSIC_TYPE_ID, _class: task.class.ProjectType, statuses: [{ _id: ST_TODO }, { _id: ST_PROGRESS }] }
  ]
  const taskTypes: TaskTypeRow[] = [
    { ...BASE, _id: SCRUM_TASK, _class: task.class.TaskType, parent: SCRUM_TYPE_ID, name: 'Task', statuses: [ST_BACKLOG, ST_PROGRESS] },
    { ...BASE, _id: SCRUM_BUG, _class: task.class.TaskType, parent: SCRUM_TYPE_ID, name: 'Bug', statuses: [ST_BACKLOG, ST_PROGRESS] },
    { ...BASE, _id: 'tt-classic' as Ref<TaskType>, _class: task.class.TaskType, parent: CLASSIC_TYPE_ID, name: 'Issue', statuses: [ST_PROGRESS, ST_TODO] }
  ]
  const statuses: IssueStatusRow[] = [
    { ...BASE, _id: ST_BACKLOG, _class: tracker.class.IssueStatus, name: 'Backlog', category: task.statusCategory.UnStarted },
    { ...BASE, _id: ST_TODO, _class: tracker.class.IssueStatus, name: 'Todo', category: task.statusCategory.UnStarted },
    { ...BASE, _id: ST_PROGRESS, _class: tracker.class.IssueStatus, name: 'In Progress', category: task.statusCategory.Active }
  ]
  const employees: EmployeeRow[] = [
    { ...BASE, _id: ME_EMPLOYEE, _class: contact.mixin.Employee, name: 'Nguyen,Hung', active: true },
    { ...BASE, _id: PERSON_AN, _class: contact.mixin.Employee, name: 'Tran,An', active: true }
  ]
  const persons: PersonRow[] = [
    { ...BASE, _id: ME_PERSON, _class: contact.class.Person, name: 'Nguyen,Hung' },
    { ...BASE, _id: PERSON_AN, _class: contact.class.Person, name: 'Tran,An' }
  ]
  const tables = new Map<Ref<Class<Doc>>, Doc[]>([
    [tracker.class.Project, projects],
    [task.class.ProjectType, projectTypes],
    [task.class.TaskType, taskTypes],
    [tracker.class.IssueStatus, statuses],
    [tracker.class.Issue, []],
    [tracker.class.Milestone, []],
    [contact.mixin.Employee, employees],
    [contact.class.Person, persons],
    [contact.class.SocialIdentity, []],
    [chunter.class.ChatMessage, []]
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
  const update = jest.fn().mockResolvedValue({})
  const writeMarkdown = jest.fn().mockResolvedValue('blob-ref' as MarkupBlobRef)
  const readMarkdown = jest.fn().mockResolvedValue('Body **text**')
  const updateMarkdown = jest.fn().mockResolvedValue(undefined)
  session.client.findAll = findAll
  session.client.findOne = findOne
  session.client.updateDoc = updateDoc
  session.client.addCollection = addCollection
  session.client.update = update
  session.collab.writeMarkdown = writeMarkdown
  session.collab.readMarkdown = readMarkdown
  session.collab.updateMarkdown = updateMarkdown
  return { tables, findAll, findOne, updateDoc, addCollection, update, writeMarkdown, readMarkdown, updateMarkdown, session }
}

function tool (name: string): AnyTool {
  const found = trackerTools.find((t) => t.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

function sprintRow (id: string, label: string, status: MilestoneStatus, sprintState?: string): MilestoneRow {
  return { ...BASE, _id: id as Ref<Milestone>, _class: tracker.class.Milestone, space: 'p-srv' as Ref<Project>, label, status, sprintState }
}

function issueRow (n: number, overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    ...BASE,
    _id: `i-${n}` as Ref<Issue>,
    _class: tracker.class.Issue,
    space: 'p-srv' as Ref<Project>,
    identifier: `SRV-${n}`,
    number: n,
    title: `Issue ${n}`,
    status: ST_PROGRESS,
    priority: IssuePriority.High,
    assignee: PERSON_AN,
    description: null,
    dueDate: null,
    rank: FIRST_RANK,
    ...overrides
  }
}

describe('normalizeIssueId', () => {
  it.each(['srv-12', ' SRV 12 ', 'SRV-12'])('normalizes %p', (raw) => {
    expect(normalizeIssueId(raw)).toBe('SRV-12')
  })

  it.each(['12', '', 'SRV-'])('rejects %p', (raw) => {
    expect(normalizeIssueId(raw)).toBeUndefined()
  })
})

describe('list_projects', () => {
  it('prints one line per project', async () => {
    const f = setup()
    const out = await tool('list_projects').run(f.session, {})
    expect(out).toContain('SRV  Servone')
    expect(out).toContain('OPS  Operations')
  })
})

describe('get_issue', () => {
  it('reports unknown ids', async () => {
    const f = setup()
    await expect(tool('get_issue').run(f.session, { id: 'srv 99' })).rejects.toThrow(new ToolInputError('Issue SRV-99 not found'))
  })

  it('rejects text that is not an issue id', async () => {
    const f = setup()
    await expect(tool('get_issue').run(f.session, { id: 'hello' })).rejects.toBeInstanceOf(ToolInputError)
  })

  it('prints fields, description and comments', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { description: 'blob-1' as MarkupBlobRef }))
    const anIdentity: SocialIdentityRow = {
      ...BASE,
      _id: 'social-an' as Ref<SocialIdentity>,
      _class: contact.class.SocialIdentity,
      attachedTo: PERSON_AN
    }
    rowsOf(f.tables, contact.class.SocialIdentity).push(anIdentity)
    const comment: ChatMessageRow = {
      ...BASE,
      _id: 'c1' as Ref<ChatMessage>,
      _class: chunter.class.ChatMessage,
      attachedTo: 'i-12' as Ref<Issue>,
      createdBy: 'social-an' as PersonId,
      modifiedBy: 'social-an' as PersonId,
      createdOn: Date.UTC(2026, 8, 20, 9, 30),
      message: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Looks good' }] }] })
    }
    rowsOf(f.tables, chunter.class.ChatMessage).push(comment)
    const out = await tool('get_issue').run(f.session, { id: 'srv-12' })
    expect(out).toContain('SRV-12: Issue 12')
    expect(out).toContain('In Progress')
    expect(out).toContain('High')
    expect(out).toContain('An Tran')
    expect(out).toContain('Body **text**')
    expect(out).toContain('An Tran, 2026-09-20 09:30: Looks good')
    expect(f.readMarkdown).toHaveBeenCalledWith({ objectClass: tracker.class.Issue, objectId: 'i-12', objectAttr: 'description' }, 'blob-1')
  })
})

describe('get_issue sprint and description', () => {
  it('prints the sprint and story points', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Milestone).push(sprintRow('m-1', 'Sprint 1', MilestoneStatus.InProgress))
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { milestone: 'm-1' as Ref<Milestone>, storyPoints: 3 }))
    const out = await tool('get_issue').run(f.session, { id: 'SRV-12' })
    expect(out).toContain('Sprint: Sprint 1')
    expect(out).toContain('Points: 3')
  })

  it('still answers when the editor service times out', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { description: 'blob-1' as MarkupBlobRef }))
    f.readMarkdown.mockRejectedValue(new CollabTimeoutError())
    const out = await tool('get_issue').run(f.session, { id: 'SRV-12' })
    expect(out).toContain('(unavailable: The editor service did not respond. Try again later.)')
    expect(out).toContain('No comments')
  })
})

describe('find_issues', () => {
  it('passes limit through and prints the total', async () => {
    const f = setup()
    const issues = Array.from({ length: 25 }, (_, i) => issueRow(i + 1))
    f.findAll.mockImplementation(async (cls: Ref<Class<Doc>>, query: DocumentQuery<Doc>) =>
      cls === tracker.class.Issue ? toFindResult(issues, 340) : toFindResult((f.tables.get(cls) ?? []).filter((row) => matches(row, query)))
    )
    const out = await tool('find_issues').run(f.session, { project: 'srv' })
    const issueCall = f.findAll.mock.calls.find(([cls]) => cls === tracker.class.Issue)
    expect(issueCall?.[1]).toMatchObject({ space: 'p-srv' })
    expect(issueCall?.[2]).toMatchObject({ limit: 25, total: true })
    expect(out).toContain('SRV-1 [In Progress] [High] Issue 1 — @An Tran')
    expect(out.trim().split('\n').at(-1)).toBe('Showing 25 of 340')
  })

  it('reports unknown projects with the known identifiers', async () => {
    const f = setup()
    await expect(tool('find_issues').run(f.session, { project: 'XYZ' })).rejects.toThrow(
      new ToolInputError('Project XYZ not found. Known: SRV, OPS')
    )
  })

  it('resolves assignee me to the session person', async () => {
    const f = setup()
    await tool('find_issues').run(f.session, { assignee: 'me' })
    const issueCall = f.findAll.mock.calls.find(([cls]) => cls === tracker.class.Issue)
    expect(issueCall?.[1]).toMatchObject({ assignee: ME_PERSON })
  })

  it('filters by sprint name and prints sprint and points', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Milestone).push(sprintRow('m-1', 'Sprint 1', MilestoneStatus.InProgress), sprintRow('m-2', 'Sprint 2', MilestoneStatus.Planned))
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(4, { milestone: 'm-1' as Ref<Milestone>, storyPoints: 2 }))
    const out = await tool('find_issues').run(f.session, { project: 'SRV', sprint: 'sprint 1' })
    const issueCall = f.findAll.mock.calls.find(([cls]) => cls === tracker.class.Issue)
    expect(issueCall?.[1]).toMatchObject({ milestone: { $in: ['m-1'] } })
    expect(out).toContain('SRV-4 [In Progress] [High] Issue 4 (Sprint 1, 2 pts) — @An Tran')
  })

  it('resolves the active sprint from sprintState before milestone status', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Milestone).push(
      sprintRow('m-1', 'Sprint 1', MilestoneStatus.InProgress, 'closed'),
      sprintRow('m-2', 'Sprint 2', MilestoneStatus.Planned, 'active')
    )
    await tool('find_issues').run(f.session, { project: 'SRV', sprint: 'active' })
    const issueCall = f.findAll.mock.calls.find(([cls]) => cls === tracker.class.Issue)
    expect(issueCall?.[1]).toMatchObject({ milestone: { $in: ['m-2'] } })
  })

  it('reports unknown sprints with the known names', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Milestone).push(sprintRow('m-1', 'Sprint 1', MilestoneStatus.InProgress))
    await expect(tool('find_issues').run(f.session, { project: 'SRV', sprint: 'Sprint 9' })).rejects.toThrow(
      new ToolInputError('Sprint "Sprint 9" not found. Known: Sprint 1')
    )
  })

  it('resolves status by name within the project type', async () => {
    const f = setup()
    await tool('find_issues').run(f.session, { project: 'SRV', status: 'in progress', text: 'login' })
    const issueCall = f.findAll.mock.calls.find(([cls]) => cls === tracker.class.Issue)
    expect(issueCall?.[1]).toMatchObject({ status: { $in: ['st-progress'] }, title: { $like: '%login%' } })
  })
})

describe('create_issue', () => {
  it('increments the sequence, writes the description first and uses the Scrum kind', async () => {
    const f = setup()
    const out = await tool('create_issue').run(f.session, {
      project: 'SRV',
      title: ' Fix login ',
      description: '# Steps',
      priority: 'urgent',
      type: 'bug'
    })
    expect(f.updateDoc).toHaveBeenCalledWith(tracker.class.Project, expect.anything(), 'p-srv', { $inc: { sequence: 1 } }, true)
    expect(f.writeMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ objectClass: tracker.class.Issue, objectAttr: 'description' }),
      '# Steps'
    )
    expect(f.writeMarkdown.mock.invocationCallOrder[0]).toBeLessThan(f.addCollection.mock.invocationCallOrder[0])
    const [cls, space, parent, parentClass, collection, attrs, id] = f.addCollection.mock.calls[0]
    expect([cls, space, parent, parentClass, collection]).toEqual([
      tracker.class.Issue,
      'p-srv',
      tracker.ids.NoParent,
      tracker.class.Issue,
      'subIssues'
    ])
    expect(attrs).toMatchObject({
      title: 'Fix login',
      number: 13,
      identifier: 'SRV-13',
      kind: SCRUM_BUG,
      status: 'st-backlog',
      priority: IssuePriority.Urgent,
      description: 'blob-ref',
      assignee: null
    })
    expect(f.writeMarkdown.mock.calls[0][0].objectId).toBe(id)
    expect(out).toBe('Created SRV-13: Fix login')
  })

  it('gives sequential creates distinct numbers from each increment', async () => {
    const f = setup()
    await tool('create_issue').run(f.session, { project: 'SRV', title: 'A' })
    await tool('create_issue').run(f.session, { project: 'SRV', title: 'B' })
    const numbers = f.addCollection.mock.calls.map((call) => call[5].number)
    expect(numbers).toEqual([13, 14])
    expect(f.addCollection.mock.calls[1][5].identifier).toBe('SRV-14')
  })

  it('uses the project type task kind and first unstarted status for classic projects', async () => {
    const f = setup()
    await tool('create_issue').run(f.session, { project: 'OPS', title: 'Rotate keys', assignee: 'me' })
    expect(f.writeMarkdown).not.toHaveBeenCalled()
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({
      kind: 'tt-classic',
      status: 'st-todo',
      assignee: ME_PERSON,
      description: null,
      priority: IssuePriority.NoPriority
    })
  })

  it('places the new issue after the last ranked issue', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    await tool('create_issue').run(f.session, { project: 'SRV', title: 'A' })
    const rank: string = f.addCollection.mock.calls[0][5].rank
    expect(rank > FIRST_RANK).toBe(true)
  })
})

describe('update_issue', () => {
  it('requires at least one field', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    await expect(tool('update_issue').run(f.session, { id: 'SRV-12' })).rejects.toBeInstanceOf(ToolInputError)
    expect(f.update).not.toHaveBeenCalled()
  })

  it('patches status, priority and assignee', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const out = await tool('update_issue').run(f.session, {
      id: 'srv-12',
      status: 'backlog',
      priority: 'low',
      assignee: 'me'
    })
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ _id: 'i-12' }), {
      status: 'st-backlog',
      priority: IssuePriority.Low,
      assignee: ME_PERSON
    })
    expect(out).toContain('Updated SRV-12')
    expect(out).toContain('status Backlog')
  })

  it('unassigns with null', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    await tool('update_issue').run(f.session, { id: 'SRV-12', assignee: null })
    expect(f.update).toHaveBeenCalledWith(expect.anything(), { assignee: null })
  })

  it('resolves assignee by name', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { assignee: null }))
    await tool('update_issue').run(f.session, { id: 'SRV-12', assignee: 'an tran' })
    expect(f.update).toHaveBeenCalledWith(expect.anything(), { assignee: 'person-an' })
  })

  it('replaces an existing description through the collaborator only', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { description: 'blob-1' as MarkupBlobRef }))
    const out = await tool('update_issue').run(f.session, { id: 'SRV-12', description: '## New' })
    expect(f.updateMarkdown).toHaveBeenCalledWith({ objectClass: tracker.class.Issue, objectId: 'i-12', objectAttr: 'description' }, '## New')
    expect(f.writeMarkdown).not.toHaveBeenCalled()
    expect(f.update).not.toHaveBeenCalled()
    expect(out).toBe('Updated SRV-12: description')
  })

  it('creates the description blob when the issue has none', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    await tool('update_issue').run(f.session, { id: 'SRV-12', description: 'First text', priority: 'low' })
    expect(f.writeMarkdown).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'i-12' }), 'First text')
    expect(f.update).toHaveBeenCalledWith(expect.anything(), { priority: IssuePriority.Low, description: 'blob-ref' })
  })
})

describe('comment_on_issue', () => {
  it('adds a chat message to the issue comments', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const out = await tool('comment_on_issue').run(f.session, { id: 'SRV-12', text: 'Ship it' })
    const [cls, space, attachedTo, attachedToClass, collection, attrs] = f.addCollection.mock.calls[0]
    expect([cls, space, attachedTo, attachedToClass, collection]).toEqual([
      chunter.class.ChatMessage,
      'p-srv',
      'i-12',
      tracker.class.Issue,
      'comments'
    ])
    expect(attrs.message).toContain('Ship it')
    expect(out).toBe('Commented on SRV-12')
  })
})
