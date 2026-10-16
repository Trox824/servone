import { mondayConnector } from '../../connectors/monday'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const alice = { name: 'Alice Doe', email: 'alice@acme.com' }

function column (id: string, type: string, title: string, fields: Record<string, Json>): Json {
  return { id, type, text: '', column: { title }, value: null, ...fields }
}

const firstItem = {
  id: '101',
  name: 'Design homepage',
  created_at: '2024-01-02T03:04:05Z',
  creator: alice,
  group: { title: 'This week' },
  column_values: [
    column('status', 'status', 'Status', { label: 'Working on it', is_done: false, text: 'Working on it' }),
    column('priority', 'status', 'Priority', { label: 'Critical ⚠️', is_done: false }),
    column('person', 'people', 'Owner', { persons_and_teams: [{ id: '7', kind: 'team' }, { id: '5', kind: 'person' }] }),
    column('timeline', 'timeline', 'Timeline', { to: '2024-02-10T00:00:00+00:00' }),
    column('tags', 'tags', 'Tags', { tags: [{ name: 'web' }] }),
    column('notes', 'long_text', 'Notes', { text: 'Hero and pricing' })
  ],
  updates: [
    {
      text_body: 'Second',
      body: '<p>Second <strong>update</strong></p>',
      created_at: '2024-01-04T00:00:00Z',
      creator: alice,
      replies: [{ text_body: 'Agreed', body: '', created_at: '2024-01-05T00:00:00Z', creator: { name: 'Bob Roe', email: 'bob@acme.com' } }]
    },
    { text_body: 'First', body: '<p>First</p>', created_at: '2024-01-03T00:00:00Z', creator: alice, replies: [] }
  ],
  subitems: [
    {
      id: '201',
      name: 'Pick hero image',
      created_at: '2024-01-03T00:00:00Z',
      creator: alice,
      group: { title: 'Subitems' },
      column_values: [
        column('status', 'status', 'Status', { label: 'Done', is_done: true }),
        column('date', 'date', 'Date', { date: '2024-02-01' })
      ],
      updates: []
    }
  ]
}

const secondItem = {
  id: '102',
  name: 'Audit SEO',
  created_at: '2024-01-06T00:00:00Z',
  creator: null,
  group: { title: 'Backlog' },
  column_values: [],
  updates: [],
  subitems: []
}

function route (request: ApiRequest): Json {
  expect(request).toMatchObject({ method: 'POST', path: '/v2' })
  const query = JSON.stringify(request.body)
  if (query.includes('users(')) {
    return { data: { users: [{ id: '5', name: 'Bob Roe', email: 'bob@acme.com' }] } }
  }
  if (query.includes('next_items_page')) {
    expect(query).toContain('"cursor":"cursor-2"')
    return { data: { next_items_page: { cursor: null, items: [secondItem] } } }
  }
  if (query.includes('items_page')) {
    if (query.includes('"board":["999"]')) return { data: { boards: [] } }
    return { data: { boards: [{ name: 'Website', items_page: { cursor: 'cursor-2', items: [firstItem] } }] } }
  }
  if (query.includes('boards(limit')) {
    return {
      data: {
        boards: [
          { id: '1', name: 'Website', type: 'board', workspace: { name: 'Marketing' } },
          { id: '2', name: 'Subitems of Website', type: 'sub_items_board', workspace: { name: 'Marketing' } },
          { id: '3', name: 'Hiring', type: 'board', workspace: null }
        ]
      },
      account_id: 1
    }
  }
  throw new Error(`Unexpected query ${query}`)
}

const api = async (request: ApiRequest): Promise<ApiResponse> => ({ status: 200, body: route(request) })

describe('mondayConnector', () => {
  it('lists boards with their workspace and skips subitem boards', async () => {
    await expect(mondayConnector.listScopes(api)).resolves.toEqual([
      { id: '1', name: 'Website', kind: 'board', parentName: 'Marketing', isSelected: true },
      { id: '3', name: 'Hiring', kind: 'board', parentName: 'Main workspace', isSelected: true }
    ])
  })

  it('pages items by cursor and maps columns, subitems and updates', async () => {
    const bundle = await mondayConnector.fetch(api, ['1', '999'], () => {}, new AbortController().signal)
    const issues = bundle.projects[0].issues
    expect(bundle.projects[0].name).toBe('Website')
    expect(issues.map((issue) => [issue.key, issue.parentKey])).toEqual([
      ['101', undefined],
      ['201', '101'],
      ['102', undefined]
    ])
    expect(issues[0]).toMatchObject({
      title: 'Design homepage',
      description: 'Hero and pricing',
      status: 'inProgress',
      sourceStatus: 'Working on it',
      priority: 'urgent',
      assignee: { name: 'Bob Roe', email: 'bob@acme.com' },
      creator: alice,
      labels: ['This week', 'web'],
      dueDate: Date.parse('2024-02-10T00:00:00+00:00'),
      createdOn: Date.parse('2024-01-02T03:04:05Z')
    })
    expect(issues[0].comments).toEqual([
      { author: alice, date: Date.parse('2024-01-03T00:00:00Z'), text: 'First' },
      { author: alice, date: Date.parse('2024-01-04T00:00:00Z'), text: 'Second **update**' },
      { author: { name: 'Bob Roe', email: 'bob@acme.com' }, date: Date.parse('2024-01-05T00:00:00Z'), text: 'Agreed' }
    ])
    expect(issues[1]).toMatchObject({ status: 'done', dueDate: Date.parse('2024-02-01') })
    expect(issues[2]).toMatchObject({ status: 'backlog', sourceStatus: 'Backlog', creator: undefined })
    expect(bundle.warnings).toEqual(['Selected boards that no longer exist were skipped: 1'])
  })

  it('surfaces GraphQL errors', async () => {
    const failing = async (): Promise<ApiResponse> => ({ status: 200, body: { errors: [{ message: 'Complexity budget exhausted' }] } })
    await expect(mondayConnector.listScopes(failing)).rejects.toThrow('Complexity budget exhausted')
  })
})
