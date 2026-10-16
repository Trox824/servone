/**
 * @jest-environment node
 */
import type { ImportBundle, ImportRequest, IssueImport, MessageImport } from '@servone/import'
import type { Json } from '../../../chunter-resources/webhooks/api'
import { batches, collectPeople, ImportFailure, itemCount, matchPeople, newcomers, runImport } from '../run'

function issue (key: string, parentKey?: string): IssueImport {
  return { key, parentKey, title: key, description: '', status: 'todo', sourceStatus: 'Todo', priority: 'none', labels: [], comments: [] }
}

function message (key: string, threadKey?: string): MessageImport {
  return { key, threadKey, date: 0, text: key, author: { name: `author ${key}` } }
}

function emptyBundle (): ImportBundle {
  return { projects: [], channels: [], teamspaces: [], warnings: [] }
}

function fakeServer (failOn?: (request: ImportRequest) => boolean): { requests: ImportRequest[], post: (request: ImportRequest) => Promise<Json> } {
  const requests: ImportRequest[] = []
  const post = async (request: ImportRequest): Promise<Json> => {
    requests.push(request)
    if (failOn?.(request) === true) throw new Error('500 internal')
    switch (request.op) {
      case 'match':
        return { matches: request.people.map((person) => (person.email === 'known@x.io' ? 'Known Person' : null)) }
      case 'project':
      case 'channel':
      case 'teamspace':
        return { id: `${request.op}-id` }
      case 'issues':
        return { ids: Object.fromEntries(request.issues.map((entry) => [entry.key, `id-${entry.key}`])) }
      case 'messages':
        return { ids: Object.fromEntries(request.messages.map((entry) => [entry.key, `id-${entry.key}`])) }
      case 'docs':
        return { ids: Object.fromEntries(request.docs.map((entry) => [entry.key, `id-${entry.key}`])) }
    }
  }
  return { requests, post }
}

describe('batches', () => {
  it('splits on count', () => {
    expect(batches([1, 2, 3, 4, 5], 2).map((group) => group.length)).toEqual([2, 2, 1])
  })

  it('splits on encoded size and keeps an oversized entry alone', () => {
    const groups = batches(['aaaa', 'bbbb', 'cccccccccccc', 'd'], 100, 14)
    expect(groups).toEqual([['aaaa', 'bbbb'], ['cccccccccccc'], ['d']])
  })
})

describe('runImport', () => {
  it('creates issues level by level with created parent ids', async () => {
    const bundle = emptyBundle()
    bundle.projects.push({ name: 'Core', issues: [issue('C', 'B'), issue('B', 'A'), issue('A'), issue('O', 'missing')] })
    const { requests, post } = fakeServer()
    const counts = await runImport(bundle, post, () => {})

    expect(requests.map((request) => request.op)).toEqual(['project', 'issues', 'issues', 'issues'])
    const levels = requests.flatMap((request) =>
      request.op === 'issues' ? [request.issues.map((entry) => [entry.key, entry.parent])] : []
    )
    expect(levels).toEqual([
      [['A', undefined], ['O', undefined]],
      [['B', 'id-A']],
      [['C', 'id-B']]
    ])
    expect(requests[1]).toMatchObject({ project: 'project-id' })
    expect(counts).toMatchObject({ projects: 1, issues: 4 })
  })

  it('caps issue batches at 100', async () => {
    const bundle = emptyBundle()
    bundle.projects.push({ name: 'Big', issues: Array.from({ length: 250 }, (_, index) => issue(`I-${index}`)) })
    const { requests, post } = fakeServer()
    await runImport(bundle, post, () => {})
    expect(requests.flatMap((request) => (request.op === 'issues' ? [request.issues.length] : []))).toEqual([100, 100, 50])
  })

  it('sends root messages before replies and skips replies without a root', async () => {
    const bundle = emptyBundle()
    bundle.channels.push({
      name: 'general',
      topic: '',
      isPrivate: false,
      isArchived: false,
      members: [],
      messages: [message('r1', 'm1'), message('m1', 'm1'), message('orphan', 'gone'), message('m2')]
    })
    const { requests, post } = fakeServer()
    const counts = await runImport(bundle, post, () => {})

    expect(requests[0]).toEqual({ op: 'channel', channel: { name: 'general', topic: '', isPrivate: false, isArchived: false, members: [] } })
    const sent = requests.flatMap((request) =>
      request.op === 'messages' ? [request.messages.map((entry) => [entry.key, entry.thread])] : []
    )
    expect(sent).toEqual([
      [['m1', undefined], ['m2', undefined]],
      [['r1', 'id-m1']]
    ])
    expect(counts.messages).toBe(3)
  })

  it('creates docs level by level with generated keys', async () => {
    const bundle = emptyBundle()
    const leaf = { title: 'Leaf', markdown: '', children: [] }
    bundle.teamspaces.push({ name: 'Wiki', docs: [{ title: 'Root', markdown: '# Root', children: [leaf] }, { title: 'Other', markdown: '', children: [] }] })
    const { requests, post } = fakeServer()
    await runImport(bundle, post, () => {})

    const sent = requests.flatMap((request) =>
      request.op === 'docs' ? [request.docs.map((entry) => [entry.key, entry.title, entry.parent])] : []
    )
    expect(sent).toEqual([
      [['0', 'Root', undefined], ['1', 'Other', undefined]],
      [['0.0', 'Leaf', 'id-0']]
    ])
  })

  it('stops at the first failed request and reports what was imported', async () => {
    const bundle = emptyBundle()
    bundle.projects.push({ name: 'First', issues: [issue('A')] }, { name: 'Second', issues: [issue('B')] }, { name: 'Third', issues: [] })
    const { requests, post } = fakeServer((request) => request.op === 'issues' && request.issues[0].key === 'B')

    const failure = await runImport(bundle, post, () => {}).catch((error) => error)
    expect(failure).toBeInstanceOf(ImportFailure)
    expect(failure.unit).toBe('Second')
    expect(failure.imported).toMatchObject({ projects: 2, issues: 1 })
    expect(requests.filter((request) => request.op === 'project')).toHaveLength(2)
  })

  it('reports progress against the total item count', async () => {
    const bundle = emptyBundle()
    bundle.projects.push({ name: 'Core', issues: [issue('A'), issue('B', 'A')] })
    const { post } = fakeServer()
    const seen: number[] = []
    await runImport(bundle, post, (progress) => {
      seen.push(progress.done)
      expect(progress.total).toBe(3)
    })
    expect(itemCount(bundle)).toBe(3)
    expect(seen[seen.length - 1]).toBe(3)
  })
})

describe('people', () => {
  it('collects distinct people by email, then by name', () => {
    const bundle = emptyBundle()
    const withAuthors = issue('A')
    withAuthors.assignee = { name: 'Ann', email: 'Ann@x.io' }
    withAuthors.creator = { name: 'Ann B', email: 'ann@x.io' }
    withAuthors.comments.push({ author: { name: 'Bob' }, text: '' })
    bundle.projects.push({ name: 'P', issues: [withAuthors] })
    bundle.channels.push({ name: 'c', topic: '', isPrivate: false, isArchived: false, members: [{ name: 'bob' }, {}], messages: [message('m')] })

    expect(collectPeople(bundle)).toEqual([{ name: 'Ann', email: 'Ann@x.io' }, { name: 'Bob' }, { name: 'author m' }])
  })

  it('matches people in batches and keeps order', async () => {
    const people = [...Array.from({ length: 600 }, (_, index) => ({ name: `p${index}` })), { email: 'known@x.io' }]
    const { requests, post } = fakeServer()
    const matches = await matchPeople(people, post)
    expect(requests).toHaveLength(2)
    expect(matches).toHaveLength(601)
    expect(matches[600]).toBe('Known Person')
    expect(matches[0]).toBeNull()
  })

  it('lists unmatched people with an email once each', () => {
    const people = [
      { name: 'Ann', email: 'ann@x.io' },
      { name: 'Known', email: 'known@x.io' },
      { name: 'No Email' },
      { name: ' ', email: ' bob@x.io ' },
      { email: 'not-an-email' },
      { name: 'Ann Again', email: 'ANN@x.io' }
    ]
    expect(newcomers(people, [null, 'Known Person', null, null, null, null])).toEqual([
      { email: 'ann@x.io', name: 'Ann' },
      { email: 'bob@x.io', name: undefined }
    ])
  })
})
