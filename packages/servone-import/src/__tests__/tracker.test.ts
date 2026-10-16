import { parseAsana } from '../tracker/asana'
import { parseDate } from '../tracker/bundle'
import { parseClickup } from '../tracker/clickup'
import { jiraToMarkdown, parseJira } from '../tracker/jira'
import { parseLinear } from '../tracker/linear'
import { priority, statusCategory } from '../tracker/status'
import { parseTrello } from '../tracker/trello'
import type { ExportFile } from '../types'

function exportFile (name: string, text: string): ExportFile {
  return { name, bytes: new TextEncoder().encode(text) }
}

describe('status and priority', () => {
  it('maps status names to categories', () => {
    expect(statusCategory('In Review')).toBe('inProgress')
    expect(statusCategory('Won\'t Do')).toBe('canceled')
    expect(statusCategory('Icebox')).toBe('backlog')
    expect(statusCategory('Incomplete')).toBe('todo')
    expect(statusCategory('Shipped')).toBe('done')
    expect(statusCategory('Something odd')).toBe('todo')
    expect(statusCategory('Duplicate', 'done')).toBe('canceled')
    expect(statusCategory('Backlog', 'todo')).toBe('backlog')
    expect(statusCategory('Ready', 'done')).toBe('done')
  })

  it('maps priorities', () => {
    expect(priority('No priority')).toBe('none')
    expect(priority('Highest')).toBe('urgent')
    expect(priority('normal')).toBe('medium')
    expect(priority('4')).toBe('low')
  })

  it('parses Jira, ISO, epoch and JS toString dates', () => {
    expect(parseDate('15/Jan/24 2:30 PM')).toBe(new Date(2024, 0, 15, 14, 30).getTime())
    expect(parseDate('2024-01-15T10:00:00.000Z')).toBe(Date.UTC(2024, 0, 15, 10))
    expect(parseDate('1705312800000')).toBe(1705312800000)
    expect(parseDate('Mon Jan 15 2024 10:00:00 GMT+0000 (Coordinated Universal Time)')).toBe(Date.UTC(2024, 0, 15, 10))
    expect(parseDate('soon')).toBeUndefined()
  })
})

describe('parseLinear', () => {
  const csv = [
    'ID,Team,Title,Description,Status,Estimate,Priority,Project,Creator,Assignee,Labels,Cycle Name,Created,Due Date,Parent issue,Completed,Canceled',
    'ENG-1,Engineering,Ship login,"Use **OAuth**",Done,3,High,Auth,ann@acme.io,Bob Lee,"Bug, Frontend",Cycle 4,2024-01-10T09:00:00.000Z,2024-02-01,,2024-01-20T09:00:00.000Z,',
    'ENG-2,Engineering,Login copy,,Duplicate,,No priority,,ann@acme.io,,,,2024-01-11T09:00:00.000Z,,ENG-1,,2024-01-12T09:00:00.000Z',
    'ENG-3,Engineering,Orphan,,Todo,,Low,,,,,,not a date,,ENG-99,,',
    'DES-1,Design,,,Todo,,,,,,,,,,,,',
    'DES-2,Design,Icons,,Backlog,,Urgent,,,,,,,,,,'
  ].join('\n')
  const bundle = parseLinear(exportFile('linear.csv', csv))

  it('builds one project per team', () => {
    expect(bundle.projects.map((project) => project.name)).toEqual(['Engineering', 'Design'])
    expect(bundle.channels).toEqual([])
    expect(bundle.teamspaces).toEqual([])
  })

  it('maps issue fields', () => {
    const [login, copy, orphan] = bundle.projects[0].issues
    expect(login).toEqual({
      key: 'ENG-1',
      title: 'Ship login',
      description: 'Use **OAuth**',
      status: 'done',
      sourceStatus: 'Done',
      priority: 'high',
      assignee: { name: 'Bob Lee' },
      creator: { email: 'ann@acme.io' },
      labels: ['Bug', 'Frontend'],
      dueDate: Date.UTC(2024, 1, 1),
      createdOn: Date.UTC(2024, 0, 10, 9),
      comments: []
    })
    expect(copy.status).toBe('canceled')
    expect(copy.parentKey).toBe('ENG-1')
    expect(orphan.parentKey).toBeUndefined()
    expect(orphan.createdOn).toBeUndefined()
  })

  it('aggregates warnings', () => {
    expect(bundle.warnings).toEqual([
      'Dates that could not be read were left empty: 1',
      'Rows without a title were skipped: 1',
      'Issues whose parent is not in the export were kept at the top level: 1'
    ])
  })

  it('rejects a CSV from another tool', () => {
    expect(() => parseLinear(exportFile('x.csv', 'Summary,Issue id\nA,1'))).toThrow('Missing column')
  })
})

describe('parseClickup', () => {
  const comments = JSON.stringify([{ by: 'ann@acme.io', date: 1705312800000, text: 'Looks good' }])
  const checklists = JSON.stringify({ QA: ['Test Safari', 'Test Chrome'] })
  const csv = [
    'Task ID,Task Name,Task Content,Status,Date Created,Due Date,Parent ID,Assignees,Tags,Priority,Space Name,Folder Name,List Name,Time Estimated,Checklists,Comments',
    `86a1,Launch page,Hero\\nand footer,in progress,1705312800000,1706000000000,null,"[Ann Lee, Bob]",[web],2,Marketing,Q1,Site,7200000,"${checklists.replace(/"/g, '""')}","${comments.replace(/"/g, '""')}"`,
    '86a2,Copy,null,complete,1705312800000,null,86a1,[],[],null,,,Backlog list,null,{},[]',
    '86a3,Broken,,to do,,,,,,,Marketing,,,,{oops,[]'
  ].join('\n')
  const bundle = parseClickup(exportFile('clickup.csv', csv))

  it('groups by space, falling back to list name', () => {
    expect(bundle.projects.map((project) => [project.name, project.issues.length])).toEqual([
      ['Marketing', 2],
      ['Backlog list', 1]
    ])
  })

  it('maps fields, checklists and comments', () => {
    const [page] = bundle.projects[0].issues
    expect(page.description).toBe('Hero\nand footer\n\n**QA**\n- [ ] Test Safari\n- [ ] Test Chrome')
    expect(page.status).toBe('inProgress')
    expect(page.priority).toBe('high')
    expect(page.assignee).toEqual({ name: 'Ann Lee' })
    expect(page.labels).toEqual(['web'])
    expect(page.estimateHours).toBe(2)
    expect(page.dueDate).toBe(1706000000000)
    expect(page.comments).toEqual([{ author: { email: 'ann@acme.io' }, date: 1705312800000, text: 'Looks good' }])
    const copy = bundle.projects[1].issues[0]
    expect(copy.parentKey).toBe('86a1')
    expect(copy.status).toBe('done')
    expect(copy.description).toBe('')
    expect(copy.priority).toBe('none')
  })

  it('warns on unreadable JSON cells', () => {
    expect(bundle.warnings).toEqual(['ClickUp comment or checklist cells that could not be read were ignored: 1'])
  })
})

describe('parseJira', () => {
  const csv = [
    'Summary,Issue key,Issue id,Parent id,Issue Type,Status,Status Category,Project name,Priority,Assignee,Assignee Id,Reporter,Reporter Id,Created,Due date,Original Estimate,Labels,Labels,Comment,Comment,Description',
    'Checkout fails,SHOP-7,10007,,Bug,Won\'t Do,Done,Shop,Highest,Ann Lee,acc-ann,Bob,acc-bob,15/Jan/24 9:05 AM,20/Jan/24,7200,payments,urgent,"16/Jan/24 10:00 AM;acc-ann;Repro on *Safari*; only there","17/Jan/24 11:00 AM;acc-zed;ok","h1. Steps\n*Click* pay"',
    'Add logging,SHOP-8,10008,10007,Sub-task,Selected for Development,To Do,Shop,Lowest,,,Bob,acc-bob,16/Jan/24 9:05 AM,,,,,,,',
    'Docs,OPS-1,20001,,Task,In Progress,,Ops,Medium,,,,,16/Jan/24 9:05 AM,,,,,,,'
  ].join('\n')
  const bundle = parseJira(exportFile('jira.csv', csv))

  it('groups by project name and links sub-tasks by issue id', () => {
    expect(bundle.projects.map((project) => project.name)).toEqual(['Shop', 'Ops'])
    expect(bundle.projects[0].issues[1].parentKey).toBe('10007')
    expect(bundle.warnings).toEqual([])
  })

  it('maps fields and repeated columns', () => {
    const [checkout, logging] = bundle.projects[0].issues
    expect(checkout.status).toBe('canceled')
    expect(checkout.sourceStatus).toBe('Won\'t Do')
    expect(checkout.priority).toBe('urgent')
    expect(checkout.labels).toEqual(['payments', 'urgent'])
    expect(checkout.estimateHours).toBe(2)
    expect(checkout.createdOn).toBe(new Date(2024, 0, 15, 9, 5).getTime())
    expect(checkout.description).toBe('# Steps\n**Click** pay')
    expect(checkout.comments).toEqual([
      { author: { name: 'Ann Lee' }, date: new Date(2024, 0, 16, 10).getTime(), text: 'Repro on **Safari**; only there' },
      { author: { name: 'acc-zed' }, date: new Date(2024, 0, 17, 11).getTime(), text: 'ok' }
    ])
    expect(logging.status).toBe('todo')
    expect(logging.priority).toBe('low')
    expect(bundle.projects[1].issues[0].status).toBe('inProgress')
  })

  it('converts common wiki markup', () => {
    expect(jiraToMarkdown('{code:java}int x;{code}\n# one\n[site|https://a.io] {{mono}}')).toBe(
      '```java\nint x;\n```\n1. one\n[site](https://a.io) `mono`'
    )
  })
})

describe('parseAsana', () => {
  const csv = [
    'Task ID,Created At,Completed At,Last Modified,Name,Section/Column,Assignee,Assignee Email,Start Date,Due Date,Tags,Notes,Projects,Parent task',
    '1201,2024-01-10,,2024-01-11,Plan launch,Doing,Ann Lee,ann@acme.io,,2024-02-01,"Launch,Q1",Draft the plan,Launch,',
    '1202,2024-01-10,2024-01-12,2024-01-12,Book venue,Doing,,,,,,,Launch,Plan launch',
    '1203,2024-01-10,,,Same,Backlog,,,,,,,Launch,',
    '1204,2024-01-10,,,Same,Backlog,,,,,,,Launch,',
    '1205,2024-01-10,,,Child of dup,,,,,,,,,Same'
  ].join('\n')
  const bundle = parseAsana(exportFile('Launch tasks.csv', csv))

  it('maps tasks and resolves parents by unique name', () => {
    const issues = bundle.projects[0].issues
    expect(bundle.projects.map((project) => project.name)).toEqual(['Launch', 'Launch tasks'])
    expect(issues[0]).toMatchObject({
      key: '1201',
      status: 'inProgress',
      sourceStatus: 'Doing',
      assignee: { name: 'Ann Lee', email: 'ann@acme.io' },
      labels: ['Launch', 'Q1'],
      description: 'Draft the plan',
      dueDate: Date.UTC(2024, 1, 1)
    })
    expect(issues[1]).toMatchObject({ parentKey: '1201', status: 'done' })
    expect(issues[2].status).toBe('backlog')
    expect(bundle.projects[1].issues[0].parentKey).toBeUndefined()
    expect(bundle.warnings).toEqual(['Asana subtasks whose parent name is missing or not unique were kept at the top level: 1'])
  })
})

describe('parseTrello', () => {
  const board = {
    name: 'Roadmap',
    lists: [
      { id: 'l1', name: 'To Do', closed: false },
      { id: 'l2', name: 'Doing', closed: false }
    ],
    members: [{ id: 'm1', fullName: 'Ann Lee', username: 'ann' }],
    cards: [
      {
        id: '65a4f2c0aaaaaaaaaaaaaaaa',
        name: 'Design hero',
        desc: 'Bold',
        idList: 'l2',
        closed: false,
        due: '2024-02-01T12:00:00.000Z',
        dueComplete: false,
        idMembers: ['m1'],
        labels: [{ name: 'Design', color: 'green' }, { name: '', color: 'red' }],
        dateLastActivity: '2024-01-16T00:00:00.000Z'
      },
      {
        id: '65a4f2c0bbbbbbbbbbbbbbbb',
        name: 'Old idea',
        desc: '',
        idList: 'l1',
        closed: true,
        due: null,
        dueComplete: false,
        idMembers: [],
        labels: [],
        dateLastActivity: '2024-01-16T00:00:00.000Z'
      }
    ],
    checklists: [{ idCard: '65a4f2c0aaaaaaaaaaaaaaaa', name: 'Steps', checkItems: [{ name: 'Sketch', state: 'complete' }] }],
    actions: [
      { type: 'commentCard', date: '2024-01-16T10:00:00.000Z', data: { card: { id: '65a4f2c0aaaaaaaaaaaaaaaa' }, text: 'Second' }, memberCreator: { fullName: 'Ann Lee' } },
      { type: 'commentCard', date: '2024-01-15T10:00:00.000Z', data: { card: { id: '65a4f2c0aaaaaaaaaaaaaaaa' }, text: 'First' }, memberCreator: { fullName: 'Bob' } },
      { type: 'createCard', date: '2024-01-15T09:00:00.000Z', data: { card: { id: '65a4f2c0aaaaaaaaaaaaaaaa' } }, memberCreator: { fullName: 'Bob' } }
    ]
  }
  const bundle = parseTrello(exportFile('roadmap.json', JSON.stringify(board)))

  it('maps cards to issues', () => {
    expect(bundle.projects.map((project) => project.name)).toEqual(['Roadmap'])
    const [hero, old] = bundle.projects[0].issues
    expect(hero).toEqual({
      key: '65a4f2c0aaaaaaaaaaaaaaaa',
      title: 'Design hero',
      description: 'Bold\n\n**Steps**\n- [x] Sketch',
      status: 'inProgress',
      sourceStatus: 'Doing',
      priority: 'none',
      assignee: { name: 'Ann Lee' },
      creator: { name: 'Bob' },
      labels: ['Design', 'red'],
      dueDate: Date.UTC(2024, 1, 1, 12),
      createdOn: 0x65a4f2c0 * 1000,
      comments: [
        { author: { name: 'Bob' }, date: Date.UTC(2024, 0, 15, 10), text: 'First' },
        { author: { name: 'Ann Lee' }, date: Date.UTC(2024, 0, 16, 10), text: 'Second' }
      ]
    })
    expect(old.status).toBe('done')
    expect(old.sourceStatus).toBe('To Do')
  })

  it('rejects non-board JSON', () => {
    expect(() => parseTrello(exportFile('x.json', '{"foo":1}'))).toThrow('Trello board')
  })
})
