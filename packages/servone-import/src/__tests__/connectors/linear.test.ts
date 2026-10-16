import { z } from 'zod'
import { linearConnector } from '../../connectors/linear'
import type { ApiCall, Json } from '../../types'

const graphqlBody = z.object({ query: z.string(), variables: z.record(z.string(), z.string().nullable()) })

const ana = { name: 'Ana Silva', email: 'ana@acme.io' }
const noMore = { hasNextPage: false, endCursor: null }

function issue (fields: Record<string, Json>): Json {
  return {
    id: `id-${String(fields.identifier)}`,
    description: null,
    priority: 0,
    estimate: null,
    dueDate: null,
    createdAt: '2026-01-02T10:00:00.000Z',
    assignee: null,
    creator: ana,
    parent: null,
    labels: { nodes: [] },
    comments: { nodes: [], pageInfo: noMore },
    ...fields
  }
}

function answer (query: string, variables: Record<string, string | null>): Json {
  if (query.includes('query Teams')) {
    return { organization: { name: 'Acme' }, teams: { nodes: [{ id: 't1', name: 'Engineering' }], pageInfo: noMore } }
  }
  if (query.includes('query Comments')) {
    return { issue: { comments: { nodes: [{ body: 'Second ![shot](https://uploads.linear.app/x.png)', createdAt: '2026-01-04T10:00:00.000Z', user: null }], pageInfo: noMore } } }
  }
  if (variables.after === null) {
    return {
      team: {
        name: 'Engineering',
        issues: {
          nodes: [issue({
            identifier: 'ENG-1',
            title: 'Login fails',
            description: 'Steps **here**',
            priority: 1,
            estimate: 3,
            dueDate: '2026-02-01',
            state: { name: 'In Review', type: 'started' },
            assignee: ana,
            labels: { nodes: [{ name: 'Bug' }] },
            comments: { nodes: [{ body: 'First', createdAt: '2026-01-03T10:00:00.000Z', user: ana }], pageInfo: { hasNextPage: true, endCursor: 'c1' } }
          })],
          pageInfo: { hasNextPage: true, endCursor: 'p1' }
        }
      }
    }
  }
  return {
    team: {
      name: 'Engineering',
      issues: {
        nodes: [
          issue({ identifier: 'ENG-2', title: 'Fix token', priority: 0, state: { name: 'Duplicate', type: 'canceled' }, parent: { identifier: 'ENG-1' } }),
          issue({ identifier: 'ENG-3', title: 'Cross team', priority: 4, state: { name: 'Triage', type: 'triage' }, parent: { identifier: 'OPS-9' } })
        ],
        pageInfo: noMore
      }
    }
  }
}

const api: ApiCall = async (request) => {
  const { query, variables } = graphqlBody.parse(request.body)
  expect(request).toMatchObject({ method: 'POST', path: '/graphql' })
  return { status: 200, body: { data: answer(query, variables) } }
}

describe('linearConnector', () => {
  it('lists teams with the workspace name', async () => {
    await expect(linearConnector.listScopes(api)).resolves.toEqual([{ id: 't1', name: 'Engineering', kind: 'team', parentName: 'Acme', isSelected: true }])
  })

  it('pages through issues and comments and maps fields', async () => {
    const progress = jest.fn()
    const bundle = await linearConnector.fetch(api, ['t1'], progress, new AbortController().signal)
    expect(progress).toHaveBeenLastCalledWith({ label: 'Engineering', count: 3 })
    expect(bundle.projects).toHaveLength(1)
    const [first, second, third] = bundle.projects[0].issues
    expect(first).toEqual({
      key: 'ENG-1',
      parentKey: undefined,
      title: 'Login fails',
      description: 'Steps **here**',
      status: 'inProgress',
      sourceStatus: 'In Review',
      priority: 'urgent',
      assignee: ana,
      creator: ana,
      labels: ['Bug'],
      dueDate: Date.UTC(2026, 1, 1),
      createdOn: Date.UTC(2026, 0, 2, 10),
      comments: [
        { author: ana, date: Date.UTC(2026, 0, 3, 10), text: 'First' },
        { author: undefined, date: Date.UTC(2026, 0, 4, 10), text: 'Second [image: shot]' }
      ]
    })
    expect(second).toMatchObject({ key: 'ENG-2', parentKey: 'ENG-1', status: 'canceled', priority: 'none' })
    expect(third).toMatchObject({ key: 'ENG-3', status: 'backlog', priority: 'low' })
    expect(third.parentKey).toBeUndefined()
    expect(bundle.warnings).toEqual([
      'Issues whose parent is not in the export were kept at the top level: 1',
      'Linear estimates are points, not hours, so they were left out: 1 issues'
    ])
  })

  it('surfaces GraphQL errors', async () => {
    const failing: ApiCall = async () => ({ status: 200, body: { data: null, errors: [{ message: 'Query too complex' }] } })
    await expect(linearConnector.listScopes(failing)).rejects.toThrow('Linear: Query too complex')
  })
})
