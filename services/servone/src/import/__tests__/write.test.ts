import chunter, { type Channel, type ChatMessage } from '@hcengineering/chunter'
import contact, { AvatarType, type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import core, { type AccountUuid, type Doc, type PersonId, type Ref, SocialIdType, type Space, type StatusCategory, type TxCUD, TxFactory } from '@hcengineering/core'
import notification from '@hcengineering/notification'
import task from '@hcengineering/task'
import tracker, { type IssueStatus } from '@hcengineering/tracker'

import type { Json } from '../../http-json'
import { createPeople } from '../people'
import {
  authorship,
  type ImportCaller,
  ImportRefError,
  type ImportSession,
  issueDescription,
  projectIdentifier,
  runImport,
  stampedAttach,
  stampedCreate,
  statusFor
} from '../write'

const caller: ImportCaller = { account: 'acc-me' as AccountUuid, person: 'p-me' as Ref<Person>, socialId: 's-me' as PersonId }
const BASE = { space: core.space.Workspace, modifiedOn: 0, modifiedBy: core.account.System }

const people = createPeople(
  [{ ...BASE, _id: 'p-ann' as Ref<Employee>, _class: contact.class.Person, name: 'Lee,Ann', avatarType: AvatarType.COLOR, active: true, personUuid: 'acc-ann' as AccountUuid }],
  [
    {
      ...BASE,
      _id: 's-ann' as PersonId & Ref<SocialIdentity>,
      _class: contact.class.SocialIdentity,
      attachedTo: 'p-ann' as Ref<Employee>,
      attachedToClass: contact.class.Person,
      collection: 'socialIds',
      type: SocialIdType.EMAIL,
      value: 'ann@example.com',
      key: 'email:ann@example.com'
    }
  ]
)

describe('projectIdentifier', () => {
  it.each([
    ['Mobile App', new Set<string>(), 'MOBIL'],
    ['Đội vận hành', new Set<string>(), 'DOIVA'],
    ['2024 roadmap', new Set<string>(), 'ROADM'],
    ['!!!', new Set<string>(), 'IMP'],
    ['Ops', new Set(['OPS']), 'OPS2'],
    ['Mobile', new Set(['MOBIL', 'MOBI2']), 'MOBI3'],
    ['Mobile', new Set(['MOBIL', ...Array.from({ length: 8 }, (_, i) => `MOBI${i + 2}`)]), 'MOB10']
  ])('derives %s', (name, taken, expected) => {
    expect(projectIdentifier(name, taken)).toBe(expected)
  })
})

describe('statusFor', () => {
  const status = (id: string, category: Ref<StatusCategory>): IssueStatus => ({
    ...BASE,
    _id: id as Ref<IssueStatus>,
    _class: tracker.class.IssueStatus,
    ofAttribute: tracker.attribute.IssueStatus,
    name: id,
    category
  })
  const ordered = [
    status('backlog', task.statusCategory.UnStarted),
    status('todo', task.statusCategory.ToDo),
    status('doing', task.statusCategory.Active),
    status('review', task.statusCategory.Active),
    status('done', task.statusCategory.Won),
    status('dropped', task.statusCategory.Lost)
  ]

  it.each([
    ['backlog', 'backlog'],
    ['todo', 'todo'],
    ['inProgress', 'doing'],
    ['done', 'done'],
    ['canceled', 'dropped']
  ] as const)('maps %s to the first status of its category', (category, expected) => {
    expect(statusFor(category, ordered)).toBe(expected)
  })

  it('falls back to the first status when the workflow lacks the category', () => {
    expect(statusFor('canceled', ordered.slice(0, 3))).toBe('backlog')
  })
})

describe('stamping', () => {
  const factory = new TxFactory(core.account.System)

  it('keeps the original date and author on a create', () => {
    const tx = stampedCreate(factory, chunter.class.Channel, core.space.Space, { name: 'x', description: '', private: false, archived: false, members: [] }, 'c-1' as Ref<Channel>, 's-ann' as PersonId, 1000)
    expect(tx).toMatchObject({ objectId: 'c-1', modifiedBy: core.account.System, modifiedOn: 1000, createdBy: 's-ann', createdOn: 1000 })
  })

  it('wraps an attached create in its collection', () => {
    const tx = stampedAttach(
      factory,
      { _id: 'c-1' as Ref<Doc>, _class: chunter.class.Channel },
      'messages',
      chunter.class.ChatMessage,
      'c-1' as Ref<Space>,
      { attachedTo: 'c-1' as Ref<Doc>, attachedToClass: chunter.class.Channel, collection: 'messages', message: 'hi' },
      'm-1' as Ref<ChatMessage>,
      's-ann' as PersonId,
      2000
    )
    expect(tx).toMatchObject({
      _class: core.class.TxCreateDoc,
      objectClass: chunter.class.ChatMessage,
      attachedTo: 'c-1',
      attachedToClass: chunter.class.Channel,
      collection: 'messages',
      modifiedBy: core.account.System,
      modifiedOn: 2000,
      createdBy: 's-ann',
      createdOn: 2000
    })
  })
})

describe('authorship', () => {
  it('uses a matched author', () => {
    expect(authorship(people.match({ email: 'ann@example.com' }), { email: 'ann@example.com' }, caller)).toEqual({ socialId: 's-ann', person: 'p-ann', prefix: '' })
  })

  it('posts an unmatched author as the caller under their original name', () => {
    expect(authorship(undefined, { name: 'Zed', email: 'zed@x.io' }, caller)).toEqual({ socialId: 's-me', person: 'p-me', prefix: '**Zed:** ' })
    expect(authorship(undefined, { email: 'zed@x.io' }, caller).prefix).toBe('**zed@x.io:** ')
    expect(authorship(undefined, undefined, caller).prefix).toBe('')
  })
})

describe('issueDescription', () => {
  it('notes an unmatched assignee', () => {
    expect(issueDescription({ description: 'Body', assignee: { name: 'Zed' } }, undefined)).toBe('Body\n\nOriginal assignee: Zed')
    expect(issueDescription({ description: '', assignee: { email: 'zed@x.io' } }, undefined)).toBe('Original assignee: zed@x.io')
  })

  it('leaves the text alone when the assignee matched or was absent', () => {
    expect(issueDescription({ description: 'Body', assignee: { name: 'Ann Lee' } }, people.match({ name: 'Ann Lee' }))).toBe('Body')
    expect(issueDescription({ description: 'Body' }, undefined)).toBe('Body')
  })
})

type Row = { [key: string]: Json }

function matches (row: Row, query: Row): boolean {
  return Object.entries(query).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      const options = cond.$in
      return Array.isArray(options) ? options.includes(row[key]) : true
    }
    return row[key] === cond
  })
}

function fakeWorkspace (tables: Map<string, Row[]>): { session: ImportSession, sent: Array<TxCUD<Doc>>, updateDoc: jest.Mock, createDoc: jest.Mock } {
  const rows = (cls: string): Row[] => tables.get(cls) ?? []
  const sent: Array<TxCUD<Doc>> = []
  const updateDoc = jest.fn(async () => ({ object: { sequence: 12 } }))
  const createDoc = jest.fn().mockResolvedValue('tag-new')
  const session: ImportSession = {
    client: {
      txFactory: new TxFactory(core.account.System),
      tx: jest.fn(async (tx: TxCUD<Doc>) => {
        sent.push(tx)
        return {}
      }),
      findOne: jest.fn().mockImplementation(async (cls: string, query: Row) => rows(cls).find((row) => matches(row, query))),
      findAll: jest.fn().mockImplementation(async (cls: string, query: Row) => rows(cls).filter((row) => matches(row, query))),
      updateDoc,
      createDoc,
      createMixin: jest.fn(async () => ({})),
      addCollection: jest.fn().mockResolvedValue('ref-new')
    },
    collab: { writeMarkdown: jest.fn().mockResolvedValue('blob-1') },
    caller,
    people,
    now: () => 5000
  }
  return { session, sent, updateDoc, createDoc }
}

describe('runImport channel', () => {
  it('gives every matched member a chat context so the channel shows in their sidebar', async () => {
    const { session, sent, createDoc } = fakeWorkspace(
      new Map([[contact.class.PersonSpace, [{ _id: 'ps-me', person: 'p-me' }, { _id: 'ps-ann', person: 'p-ann' }]]])
    )
    const response = await runImport(session, {
      op: 'channel',
      channel: { name: 'general', topic: '', isPrivate: false, isArchived: false, members: [{ email: 'ann@example.com' }, { name: 'Zed' }] }
    })

    const [created] = sent
    expect(response).toEqual({ id: created.objectId })
    expect(created).toMatchObject({ attributes: { members: ['acc-me', 'acc-ann'] } })
    expect(createDoc.mock.calls.map(([cls, space, attrs]) => [cls, space, attrs.user, attrs.objectId])).toEqual([
      [notification.class.DocNotifyContext, 'ps-me', 'acc-me', created.objectId],
      [notification.class.DocNotifyContext, 'ps-ann', 'acc-ann', created.objectId]
    ])
  })
})

describe('runImport messages', () => {
  const tables = (): Map<string, Row[]> =>
    new Map([
      [chunter.class.Channel, [{ _id: 'c-1', _class: chunter.class.Channel }]],
      [chunter.class.ChatMessage, [{ _id: 'm-old', _class: chunter.class.ChatMessage, attachedTo: 'c-1', repliedPersons: ['p-ann'] }]]
    ])

  it('writes roots and replies with their original authors and dates', async () => {
    const { session, sent, updateDoc } = fakeWorkspace(tables())
    const response = await runImport(session, {
      op: 'messages',
      channel: 'c-1',
      messages: [
        { key: '1', author: { email: 'ann@example.com' }, date: 100, text: 'root' },
        { key: '2', thread: '1', author: { name: 'Zed' }, date: 200, text: 'reply' },
        { key: '3', thread: 'm-old', author: { email: 'ANN@example.com' }, date: 300, text: 'late reply' }
      ]
    })

    expect(sent).toHaveLength(3)
    const [root, reply, late] = sent
    expect(response).toEqual({ ids: { 1: root.objectId, 2: reply.objectId, 3: late.objectId } })
    expect(root).toMatchObject({ objectClass: chunter.class.ChatMessage, attachedTo: 'c-1', collection: 'messages', createdBy: 's-ann', createdOn: 100, modifiedBy: core.account.System })
    expect(reply).toMatchObject({
      objectClass: chunter.class.ThreadMessage,
      attachedTo: root.objectId,
      attachedToClass: chunter.class.ChatMessage,
      collection: 'replies',
      createdBy: 's-me',
      createdOn: 200,
      attributes: { objectId: 'c-1', objectClass: chunter.class.Channel }
    })
    expect(JSON.stringify(reply)).toContain('Zed:')
    expect(late).toMatchObject({ attachedTo: 'm-old', createdBy: 's-ann', createdOn: 300 })
    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledWith(chunter.class.ChatMessage, 'c-1', root.objectId, { repliedPersons: ['p-me'] })
  })

  it('refuses a thread that is not a root message of the channel', async () => {
    const { session, sent } = fakeWorkspace(tables())
    const request = { op: 'messages' as const, channel: 'c-1', messages: [{ key: '1', thread: 'm-gone', date: 1, text: 'x' }] }
    await expect(runImport(session, request)).rejects.toEqual(new ImportRefError('thread'))
    expect(sent).toHaveLength(0)
  })

  it('refuses an unknown channel', async () => {
    const { session } = fakeWorkspace(tables())
    await expect(runImport(session, { op: 'messages', channel: 'c-x', messages: [] })).rejects.toEqual(new ImportRefError('channel'))
  })
})

describe('runImport issues', () => {
  const issue = {
    title: 'Parent',
    description: '',
    status: 'inProgress' as const,
    sourceStatus: 'Doing',
    priority: 'high' as const,
    labels: ['Bug'],
    comments: []
  }

  it('numbers issues, nests sub-issues and keeps comment authors', async () => {
    const { session, sent, updateDoc, createDoc } = fakeWorkspace(
      new Map([
        [tracker.class.Project, [{ _id: 'p-1', _class: tracker.class.Project, identifier: 'LIN', type: tracker.ids.ClassingProjectType }]],
        [task.class.TaskType, [{ _id: 'tt-1', parent: tracker.ids.ClassingProjectType, ofClass: tracker.class.Issue, statuses: ['st-b', 'st-a'] }]],
        [
          tracker.class.IssueStatus,
          [
            { _id: 'st-a', category: task.statusCategory.Active },
            { _id: 'st-b', category: task.statusCategory.UnStarted }
          ]
        ]
      ])
    )
    const response = await runImport(session, {
      op: 'issues',
      project: 'p-1',
      issues: [
        { ...issue, key: 'A', creator: { email: 'ann@example.com' }, createdOn: 700, comments: [{ author: { name: 'Zed' }, date: 800, text: 'hi' }] },
        { ...issue, key: 'B', parent: 'A', title: 'Child', status: 'backlog', assignee: { name: 'Zed' }, estimateHours: 3 }
      ]
    })

    expect(updateDoc).toHaveBeenCalledWith(tracker.class.Project, core.space.Space, 'p-1', { $inc: { sequence: 2 } }, true)
    expect(createDoc).toHaveBeenCalledTimes(1)
    const [parent, comment, child] = sent
    expect(response).toEqual({ ids: { A: parent.objectId, B: child.objectId } })
    expect(parent).toMatchObject({
      attachedTo: tracker.ids.NoParent,
      collection: 'subIssues',
      createdBy: 's-ann',
      createdOn: 700,
      attributes: { number: 11, identifier: 'LIN-11', status: 'st-a', parents: [], assignee: null }
    })
    expect(comment).toMatchObject({ objectClass: chunter.class.ChatMessage, attachedTo: parent.objectId, collection: 'comments', createdBy: 's-me', createdOn: 800 })
    expect(child).toMatchObject({
      attachedTo: parent.objectId,
      createdBy: 's-me',
      createdOn: 5000,
      attributes: {
        number: 12,
        status: 'st-b',
        estimation: 3,
        remainingTime: 3,
        description: 'blob-1',
        parents: [{ parentId: parent.objectId, parentTitle: 'Parent', identifier: 'LIN-11', space: 'p-1' }]
      }
    })
  })

  it('refuses a parent outside the project before writing', async () => {
    const { session, sent } = fakeWorkspace(new Map([[tracker.class.Project, [{ _id: 'p-1', _class: tracker.class.Project, identifier: 'LIN' }]]]))
    const request = { op: 'issues' as const, project: 'p-1', issues: [{ ...issue, key: 'B', parent: 'A' }, { ...issue, key: 'A' }] }
    await expect(runImport(session, request)).rejects.toEqual(new ImportRefError('parent'))
    expect(sent).toHaveLength(0)
  })
})
