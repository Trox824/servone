import { clickupConnector } from '../../connectors/clickup'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const alice = { id: 1, username: 'Alice Doe', email: 'alice@acme.com', color: '#fff', profilePicture: null }
const bob = { id: 2, username: 'Bob Roe', email: 'bob@acme.com', color: '#000', profilePicture: null }

function task (fields: Record<string, Json>): Json {
  return {
    id: 'x',
    custom_id: null,
    name: 'Task',
    text_content: '',
    description: '',
    status: { id: 'st', status: 'to do', color: '#d3d3d3', orderindex: 0, type: 'open' },
    orderindex: '1.0',
    date_created: '1700000000000',
    date_updated: '1700000000000',
    creator: alice,
    assignees: [],
    tags: [],
    parent: null,
    priority: null,
    due_date: null,
    time_estimate: null,
    checklists: [],
    list: { id: 'l1', name: 'Sprint', access: true },
    space: { id: 's1' },
    ...fields
  }
}

const olderComments = Array.from({ length: 25 }, (_, index) => ({
  id: `c${25 - index}`,
  comment: [{ text: `note ${25 - index}` }],
  comment_text: `note ${25 - index}`,
  user: bob,
  resolved: false,
  date: String(1700000100000 + (25 - index) * 1000),
  reply_count: index === 0 ? '1' : '0'
}))

function route (request: ApiRequest): Json {
  const query = new Map(request.query ?? [])
  switch (request.path) {
    case '/api/v2/team':
      return { teams: [{ id: 't1', name: 'Acme', color: '#000', avatar: null, members: [] }] }
    case '/api/v2/team/t1/space':
      return { spaces: [{ id: 's1', name: 'Product', private: false }, { id: 's2', name: 'Ops', private: false }] }
    case '/api/v2/team/t1/task':
      expect(query.get('space_ids[]')).toBe('s1')
      expect(query.get('subtasks')).toBe('true')
      expect(query.get('include_closed')).toBe('true')
      if (query.get('page') === '0') {
        return {
          tasks: [
            task({
              id: 'a1',
              name: 'Ship onboarding',
              markdown_description: 'Steps **bold**',
              status: { id: 'st2', status: 'in review', color: '#f00', orderindex: 2, type: 'custom' },
              priority: { id: '1', priority: 'urgent', color: '#f50000', orderindex: '1' },
              assignees: [alice, bob],
              tags: [{ name: 'web', tag_fg: '#fff', tag_bg: '#000' }],
              time_estimate: 7200000,
              due_date: '1700500000000',
              checklists: [{ id: 'k', name: 'QA', items: [{ id: 'i', name: 'Smoke test', resolved: true }] }]
            }),
            task({
              id: 'a2',
              name: 'Write copy',
              parent: 'a1',
              status: { id: 'st3', status: 'complete', color: '#0f0', orderindex: 3, type: 'closed' },
              priority: { id: '3', priority: 'normal', color: '#ccc', orderindex: '3' }
            })
          ],
          last_page: false
        }
      }
      return { tasks: [task({ id: 'a3', name: 'Orphan', parent: 'gone', text_content: 'plain' })], last_page: true }
    case '/api/v2/task/a1/comment':
      if (query.get('start') === undefined) return { comments: olderComments }
      expect(query.get('start_id')).toBe('c1')
      return { comments: [{ id: 'c0', comment: [], comment_text: 'first', user: alice, date: '1700000000500', reply_count: '0' }] }
    case '/api/v2/comment/c25/reply':
      return { comments: [{ id: 'r1', comment: [], comment_text: 'reply', user: alice, date: '1700000200000' }] }
    default:
      if (/^\/api\/v2\/task\/a\d\/comment$/.test(request.path)) return { comments: [] }
      throw new Error(`Unexpected ${request.method} ${request.path}`)
  }
}

const api = async (request: ApiRequest): Promise<ApiResponse> => ({ status: 200, body: route(request) })

describe('clickupConnector', () => {
  it('lists spaces under their workspace', async () => {
    await expect(clickupConnector.listScopes(api)).resolves.toEqual([
      { id: 's1', name: 'Product', kind: 'space', parentName: 'Acme', isSelected: true },
      { id: 's2', name: 'Ops', kind: 'space', parentName: 'Acme', isSelected: true }
    ])
  })

  it('pages tasks and comments and maps fields', async () => {
    const progress: number[] = []
    const bundle = await clickupConnector.fetch(api, ['s1'], (step) => progress.push(step.count), new AbortController().signal)
    expect(bundle.projects).toHaveLength(1)
    const [project] = bundle.projects
    expect(project.name).toBe('Product')
    expect(project.issues.map((issue) => issue.key)).toEqual(['a1', 'a2', 'a3'])
    const [parent, child, orphan] = project.issues
    expect(parent).toMatchObject({
      title: 'Ship onboarding',
      description: 'Steps **bold**\n\n**QA**\n- [x] Smoke test',
      status: 'inProgress',
      sourceStatus: 'in review',
      priority: 'urgent',
      assignee: { name: 'Alice Doe', email: 'alice@acme.com' },
      creator: { name: 'Alice Doe', email: 'alice@acme.com' },
      labels: ['web'],
      estimateHours: 2,
      dueDate: 1700500000000,
      createdOn: 1700000000000
    })
    expect(parent.comments).toHaveLength(27)
    expect(parent.comments[0]).toEqual({ author: { name: 'Alice Doe', email: 'alice@acme.com' }, date: 1700000000500, text: 'first' })
    expect(parent.comments.slice(-2).map((comment) => comment.text)).toEqual(['note 25', 'reply'])
    expect(child).toMatchObject({ parentKey: 'a1', status: 'done', priority: 'medium' })
    expect(orphan).toMatchObject({ status: 'todo', description: 'plain', priority: 'none' })
    expect(orphan.parentKey).toBeUndefined()
    expect(bundle.warnings).toEqual(['Issues whose parent is not in the export were kept at the top level: 1'])
    expect(progress.slice(0, 2)).toEqual([2, 3])
  })
})
