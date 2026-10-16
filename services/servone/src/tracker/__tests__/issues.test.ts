import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { type Employee, type Person } from '@hcengineering/contact'
import type { Class, Doc, Ref } from '@hcengineering/core'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import tags from '@hcengineering/tags'
import tracker, { IssuePriority, type Issue, type IssueStatus } from '@hcengineering/tracker'

import { ToolInputError } from '../../mcp/tool'
import {
  commentOnIssue,
  createIssue,
  dueDateOf,
  initialStatus,
  resolveAssignee,
  resolveIssue,
  resolveProject,
  TrackerInputError,
  updateIssue,
  type TrackerField
} from '../issues'
import {
  BASE,
  type Fixture,
  issueIn,
  issueRow,
  labelRow,
  PERSON_AN,
  PROJECT_SRV,
  rowsOf,
  SCRUM_TYPE_ID,
  setup,
  ST_BACKLOG,
  ST_PROGRESS,
  TAG_BUG,
  TAG_FRONTEND,
  type TaskTypeRow
} from './fixture'

const OWN_SCRUM_TYPE = `${SCRUM_TYPE_ID}:of:${PROJECT_SRV}` as Ref<ProjectType>

function ownKind (name: string): Ref<TaskType> {
  return `servone:taskType:${name}:of:${PROJECT_SRV}` as Ref<TaskType>
}

// Epic first so a lookup that takes the first task type picks the wrong one.
function ownScrumType (f: Fixture): void {
  const project = rowsOf(f.tables, tracker.class.Project)[0]
  Object.assign(project, { type: OWN_SCRUM_TYPE })
  const rows: TaskTypeRow[] = ['Epic', 'Task', 'Bug'].map((name) => ({
    ...BASE,
    _id: ownKind(name),
    _class: task.class.TaskType,
    parent: OWN_SCRUM_TYPE,
    name,
    statuses: [ST_BACKLOG]
  }))
  rowsOf(f.tables, task.class.TaskType).push(...rows)
}

const ST_TRIAGE = 'st-triage' as Ref<IssueStatus>
const PERSON_LAN = 'person-lan' as Ref<Employee>

function triageOn (f: Fixture): void {
  const project = rowsOf(f.tables, tracker.class.Project)[0]
  Object.assign(project, { servoneTriageStatus: ST_TRIAGE, servoneTriageOwner: PERSON_LAN })
  const kind = rowsOf(f.tables, task.class.TaskType)[0]
  Object.assign(kind, { statuses: [ST_TRIAGE, ST_BACKLOG, ST_PROGRESS] })
  const lan: Doc & Pick<Person, 'name'> = { ...BASE, _id: PERSON_LAN, _class: contact.class.Person, name: 'Le,Lan' }
  rowsOf(f.tables, contact.class.Person).push(lan)
}

function issueCall (f: Fixture): Partial<Issue> {
  const call = f.addCollection.mock.calls.find(([cls]) => cls === tracker.class.Issue)
  if (call === undefined) throw new Error('no issue created')
  return call[5]
}

function comments (f: Fixture): string[] {
  return f.addCollection.mock.calls.filter(([cls]) => cls === chunter.class.ChatMessage).map((call) => call[5].message)
}

const OCT_1_NOON = Date.UTC(2026, 9, 1, 12)

async function rejection (work: Promise<unknown>): Promise<TrackerInputError> {
  try {
    await work
  } catch (error) {
    if (error instanceof TrackerInputError) return error
    throw error
  }
  throw new Error('expected a TrackerInputError')
}

describe('resolvers', () => {
  it.each<[string, (f: ReturnType<typeof setup>) => Promise<unknown>, TrackerField, TrackerInputError['reason']]>([
    ['unknown project', async (f) => await resolveProject(f.session, 'XYZ'), 'project', 'not_found'],
    ['unknown issue', async (f) => await resolveIssue(f.session, 'SRV-99'), 'identifier', 'not_found'],
    ['malformed issue id', async (f) => await resolveIssue(f.session, 'hello'), 'identifier', 'invalid'],
    ['unknown email', async (f) => await resolveAssignee(f.session, 'nobody@servone.vn'), 'assignee', 'invalid'],
    ['unknown name', async (f) => await resolveAssignee(f.session, 'Zed'), 'assignee', 'invalid']
  ])('%s throws field %s', async (_name, run, field, reason) => {
    const error = await rejection(run(setup()))
    expect(error).toBeInstanceOf(ToolInputError)
    expect([error.field, error.reason]).toEqual([field, reason])
  })

  it('resolves an assignee by email', async () => {
    const f = setup()
    expect(await resolveAssignee(f.session, 'AN@servone.vn')).toEqual({ ref: PERSON_AN, label: 'An Tran' })
  })
})

describe('createIssue', () => {
  it('writes the issue under the caller id', async () => {
    const f = setup()
    const id = 'issue-fixed' as Ref<Issue>
    const created = await createIssue(f.session, { project: 'srv', title: 'Fix login', description: 'Steps' }, id)
    expect(created).toEqual({ _id: id, identifier: 'SRV-13', title: 'Fix login' })
    expect(f.writeMarkdown.mock.calls[0][0].objectId).toBe(id)
    expect(f.addCollection.mock.calls[0][6]).toBe(id)
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({ priority: IssuePriority.NoPriority, status: 'st-backlog' })
  })

  it('carries the given relations onto the issue', async () => {
    const f = setup()
    const id = 'issue-fixed' as Ref<Issue>
    const relation = { _id: 'm-1' as Ref<Doc>, _class: 'servone:type:MailMessage' as Ref<Class<Doc>> }
    await createIssue(f.session, { project: 'srv', title: 'Fix login', relations: [relation] }, id)
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({ relations: [relation] })
  })

  it('files a bug under the Bug copy of a Scrum project that owns its type', async () => {
    const f = setup()
    ownScrumType(f)
    await createIssue(f.session, { project: 'srv', title: 'Crash on save', kind: 'bug' }, 'issue-bug' as Ref<Issue>)
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({ kind: ownKind('Bug') })
  })

  it('files a Task by default in a Scrum project that owns its type', async () => {
    const f = setup()
    ownScrumType(f)
    await createIssue(f.session, { project: 'srv', title: 'Write docs' }, 'issue-task' as Ref<Issue>)
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({ kind: ownKind('Task') })
  })
})

describe('triage on create', () => {
  it('files into triage unassigned and mentions the triage owner', async () => {
    const f = setup()
    triageOn(f)
    await createIssue(f.session, { project: 'srv', title: 'Printer down' }, 'issue-triage' as Ref<Issue>)
    expect(issueCall(f)).toMatchObject({ status: ST_TRIAGE, assignee: null })
    expect(comments(f)).toEqual([expect.stringContaining(PERSON_LAN)])
  })

  it('keeps an explicit assignee', async () => {
    const f = setup()
    triageOn(f)
    await createIssue(f.session, { project: 'srv', title: 'Printer down', assignee: 'an@servone.vn' }, 'issue-triage' as Ref<Issue>)
    expect(issueCall(f)).toMatchObject({ status: ST_TRIAGE, assignee: PERSON_AN })
  })

  it('files into the default status without a mention when triage is off', async () => {
    const f = setup()
    await createIssue(f.session, { project: 'srv', title: 'Printer down' }, 'issue-plain' as Ref<Issue>)
    expect(issueCall(f)).toMatchObject({ status: ST_BACKLOG })
    expect(comments(f)).toEqual([])
  })

  it('lets a form\'s own status win over triage', async () => {
    const f = setup()
    triageOn(f)
    const project = await resolveProject(f.session, 'srv')
    const kind: TaskType | undefined = await f.session.client.findOne(task.class.TaskType, { parent: project.type })
    if (kind === undefined) throw new Error('no task type')
    expect(await initialStatus(f.session.client, project, kind, ST_PROGRESS)).toBe(ST_PROGRESS)
    expect(await initialStatus(f.session.client, project, kind, null)).toBe(ST_TRIAGE)
  })
})

describe('updateIssue', () => {
  it('rejects an empty patch with field body', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const error = await rejection(updateIssue(f.session, await issueIn(f, 12), {}))
    expect([error.field, error.reason]).toEqual(['body', 'invalid'])
  })

  it('reports an unknown status with the known names', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const error = await rejection(updateIssue(f.session, await issueIn(f, 12), { status: 'Doing' }))
    expect([error.field, error.message]).toEqual(['status', 'Status "Doing" not found. Known: Backlog, In Progress'])
  })

  it('returns one change per field', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const changes = await updateIssue(f.session, await issueIn(f, 12), { status: 'backlog', assignee: null, priority: 'low' })
    expect(changes).toEqual([
      { field: 'status', shown: 'status Backlog' },
      { field: 'priority', shown: 'priority Low' },
      { field: 'assignee', shown: 'unassigned' }
    ])
  })
})

describe('commentOnIssue', () => {
  it('posts under the caller id', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const id = 'msg-fixed' as Ref<ChatMessage>
    expect(await commentOnIssue(f.session, await issueIn(f, 12), 'Ship it', id)).toBe(id)
    const [cls, , attachedTo, , collection, attrs, docId] = f.addCollection.mock.calls[0]
    expect([cls, attachedTo, collection, docId]).toEqual([chunter.class.ChatMessage, 'i-12', 'comments', id])
    expect(attrs.message).toContain('Ship it')
  })
})

describe('dueDateOf', () => {
  it('reads a day as noon UTC', () => {
    expect(dueDateOf('2026-10-01')).toBe(OCT_1_NOON)
  })

  it.each(['2026-02-30', '1.10.2026', ''])('rejects %p with field dueDate', (day) => {
    expect(() => dueDateOf(day)).toThrow(TrackerInputError)
  })
})

describe('labels and due date on create', () => {
  it('attaches each label once, matched by title ignoring case and spaces', async () => {
    const f = setup()
    const id = 'issue-fixed' as Ref<Issue>
    await createIssue(f.session, { project: 'SRV', title: 'A', labels: [' bug ', 'Frontend', 'BUG'], dueDate: OCT_1_NOON }, id)
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({ dueDate: OCT_1_NOON })
    const labelCalls = f.addCollection.mock.calls.filter(([cls]) => cls === tags.class.TagReference)
    expect(labelCalls.map((call) => [call[1], call[2], call[3], call[4], call[5].tag])).toEqual([
      ['p-srv', id, tracker.class.Issue, 'labels', TAG_BUG],
      ['p-srv', id, tracker.class.Issue, 'labels', TAG_FRONTEND]
    ])
  })

  it('rejects an unknown label before writing anything', async () => {
    const f = setup()
    const error = await rejection(createIssue(f.session, { project: 'SRV', title: 'A', labels: ['bug', 'docs'] }, 'x' as Ref<Issue>))
    expect([error.field, error.reason]).toEqual(['labels', 'invalid'])
    expect(error.message).toContain('"docs"')
    expect(f.updateDoc).not.toHaveBeenCalled()
    expect(f.addCollection).not.toHaveBeenCalled()
  })
})

describe('labels and due date on update', () => {
  it('removes extra labels and adds missing ones', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    rowsOf(f.tables, tags.class.TagReference).push(labelRow('i-12' as Ref<Issue>, TAG_BUG, 'Bug'))
    const changes = await updateIssue(f.session, await issueIn(f, 12), { labels: ['frontend'] })
    expect(f.removeCollection).toHaveBeenCalledWith(tags.class.TagReference, 'p-srv', 'ref-tag-bug', 'i-12', tracker.class.Issue, 'labels')
    const added = f.addCollection.mock.calls.map((call) => call[5].tag)
    expect(added).toEqual([TAG_FRONTEND])
    expect(changes).toEqual([{ field: 'labels', shown: 'labels frontend' }])
    expect(f.update).not.toHaveBeenCalled()
  })

  it('leaves an unchanged label set alone', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    rowsOf(f.tables, tags.class.TagReference).push(labelRow('i-12' as Ref<Issue>, TAG_BUG, 'Bug'))
    await updateIssue(f.session, await issueIn(f, 12), { labels: ['BUG'] })
    expect(f.removeCollection).not.toHaveBeenCalled()
    expect(f.addCollection).not.toHaveBeenCalled()
  })

  it('clears labels with an empty list', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    rowsOf(f.tables, tags.class.TagReference).push(labelRow('i-12' as Ref<Issue>, TAG_BUG, 'Bug'))
    const changes = await updateIssue(f.session, await issueIn(f, 12), { labels: [] })
    expect(f.removeCollection).toHaveBeenCalledTimes(1)
    expect(changes).toEqual([{ field: 'labels', shown: 'labels cleared' }])
  })

  it('rejects an unknown label before changing other fields', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const error = await rejection(updateIssue(f.session, await issueIn(f, 12), { title: 'New', labels: ['nope'] }))
    expect(error.field).toBe('labels')
    expect(f.update).not.toHaveBeenCalled()
  })

  it('sets and clears the due date', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
    const issue = await issueIn(f, 12)
    expect(await updateIssue(f.session, issue, { dueDate: OCT_1_NOON })).toEqual([{ field: 'dueDate', shown: 'due 2026-10-01' }])
    expect(f.update).toHaveBeenLastCalledWith(issue, { dueDate: OCT_1_NOON })
    expect(await updateIssue(f.session, issue, { dueDate: null })).toEqual([{ field: 'dueDate', shown: 'due date cleared' }])
    expect(f.update).toHaveBeenLastCalledWith(issue, { dueDate: null })
  })
})
