import { asanaConnector } from '../../connectors/asana'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const alice = { gid: 'u1', resource_type: 'user', name: 'Alice Doe', email: 'alice@acme.com' }

function task (fields: Record<string, Json>): Json {
  return {
    gid: 'x',
    resource_type: 'task',
    name: 'Task',
    notes: '',
    html_notes: '<body></body>',
    completed: false,
    assignee: null,
    created_by: { gid: 'u1', resource_type: 'user', name: 'Alice Doe', email: 'alice@acme.com' },
    tags: [],
    due_on: null,
    due_at: null,
    created_at: '2024-01-02T03:04:05.000Z',
    num_subtasks: 0,
    memberships: [],
    custom_fields: [],
    ...fields
  }
}

function nextPage (offset: string): Json {
  return { offset, path: `/tasks?offset=${offset}`, uri: `https://app.asana.com/api/1.0/tasks?offset=${offset}` }
}

function route (request: ApiRequest): Json {
  const query = new Map(request.query ?? [])
  expect(query.get('limit') ?? '100').toBe('100')
  switch (request.path) {
    case '/api/1.0/workspaces':
      return query.get('offset') === undefined
        ? { data: [{ gid: 'w1', resource_type: 'workspace', name: 'Acme' }], next_page: nextPage('w2') }
        : { data: [{ gid: 'w2', resource_type: 'workspace', name: 'Side' }], next_page: null }
    case '/api/1.0/projects':
      expect(query.get('archived')).toBe('false')
      return { data: [{ gid: query.get('workspace') === 'w1' ? 'p1' : 'p2', resource_type: 'project', name: `Project of ${query.get('workspace') ?? ''}` }], next_page: null }
    case '/api/1.0/projects/p1':
      return { data: { gid: 'p1', resource_type: 'project', name: 'Launch' } }
    case '/api/1.0/projects/p2':
      return { data: { gid: 'p2', resource_type: 'project', name: 'Ops' } }
    case '/api/1.0/tasks':
      expect(query.get('opt_fields')).toContain('memberships.section.name')
      if (query.get('project') === 'p2') return { data: [task({ gid: 't2', name: 'Shared task' })], next_page: null }
      if (query.get('offset') === undefined) {
        return {
          data: [
            task({
              gid: 't1',
              name: 'Plan launch',
              html_notes: '<body>Read <strong>the brief</strong><img alt="mock"></body>',
              assignee: alice,
              tags: [{ gid: 'g', name: 'q3' }],
              due_on: '2024-02-01',
              num_subtasks: 1,
              memberships: [{ project: { gid: 'p1' }, section: { gid: 's', name: 'In Progress' } }],
              custom_fields: [{ gid: 'f', name: 'Priority', display_value: 'High' }]
            })
          ],
          next_page: nextPage('o2')
        }
      }
      return { data: [task({ gid: 't2', name: 'Shared task', completed: true, notes: 'plain', html_notes: '<body>plain</body>' })], next_page: null }
    case '/api/1.0/tasks/t1/subtasks':
      return { data: [task({ gid: 't1a', name: 'Draft deck', num_subtasks: 1 })], next_page: null }
    case '/api/1.0/tasks/t1a/subtasks':
      return { data: [task({ gid: 't1b', name: 'Pick fonts', due_at: '2024-02-03T10:00:00.000Z' })], next_page: null }
    case '/api/1.0/tasks/t1/stories':
      return {
        data: [
          { gid: 'h1', resource_type: 'story', resource_subtype: 'assigned', text: 'assigned to Alice', created_at: '2024-01-03T00:00:00.000Z', created_by: alice },
          { gid: 'h2', resource_type: 'story', resource_subtype: 'comment_added', text: 'Looks good', created_at: '2024-01-04T00:00:00.000Z', created_by: alice }
        ],
        next_page: null
      }
    default:
      if (/^\/api\/1\.0\/tasks\/\w+\/stories$/.test(request.path)) return { data: [], next_page: null }
      throw new Error(`Unexpected ${request.method} ${request.path}`)
  }
}

const api = async (request: ApiRequest): Promise<ApiResponse> => ({ status: 200, body: route(request) })

describe('asanaConnector', () => {
  it('lists projects across paged workspaces', async () => {
    await expect(asanaConnector.listScopes(api)).resolves.toEqual([
      { id: 'p1', name: 'Project of w1', kind: 'project', parentName: 'Acme', isSelected: true },
      { id: 'p2', name: 'Project of w2', kind: 'project', parentName: 'Side', isSelected: true }
    ])
  })

  it('pages tasks, nests subtasks and keeps only comment stories', async () => {
    const bundle = await asanaConnector.fetch(api, ['p1', 'p2'], () => {}, new AbortController().signal)
    expect(bundle.projects.map((project) => project.name)).toEqual(['Launch'])
    const issues = bundle.projects[0].issues
    expect(issues.map((issue) => [issue.key, issue.parentKey])).toEqual([
      ['t1', undefined],
      ['t1a', 't1'],
      ['t1b', 't1a'],
      ['t2', undefined]
    ])
    expect(issues[0]).toMatchObject({
      title: 'Plan launch',
      description: 'Read **the brief**[image: mock]',
      status: 'inProgress',
      sourceStatus: 'In Progress',
      priority: 'high',
      assignee: { name: 'Alice Doe', email: 'alice@acme.com' },
      creator: { name: 'Alice Doe', email: 'alice@acme.com' },
      labels: ['q3'],
      dueDate: Date.parse('2024-02-01'),
      createdOn: Date.parse('2024-01-02T03:04:05.000Z'),
      comments: [{ author: { name: 'Alice Doe', email: 'alice@acme.com' }, date: Date.parse('2024-01-04T00:00:00.000Z'), text: 'Looks good' }]
    })
    expect(issues[2].dueDate).toBe(Date.parse('2024-02-03T10:00:00.000Z'))
    expect(issues[3]).toMatchObject({ status: 'done', description: 'plain' })
    expect(bundle.warnings).toEqual(['Asana tasks in more than one selected project were imported once: 1'])
  })
})
