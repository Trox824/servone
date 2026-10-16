import { jiraConnector } from '../../connectors/jira'
import type { ApiCall, ApiRequest, Json } from '../../types'

const CLOUD = 'cloud-1'
const ana = { accountId: 'a1', displayName: 'Ana Silva', emailAddress: 'ana@acme.io', active: true }
const bo = { accountId: 'b2', displayName: 'Bo Chen', active: true }

const adf = (value: string): Json => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] })
const comment = (id: string, author: Json, value: string, created: string): Json => ({ id, author, body: adf(value), created, updated: created })

function fields (overrides: Record<string, Json>): Json {
  return {
    summary: '',
    description: null,
    status: { name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
    priority: { name: 'Medium', id: '3' },
    assignee: null,
    reporter: bo,
    labels: [],
    duedate: null,
    created: '2026-01-02T10:00:00.000+0000',
    issuetype: { name: 'Task', subtask: false },
    timeoriginalestimate: null,
    comment: { comments: [], maxResults: 0, total: 0, startAt: 0 },
    ...overrides
  }
}

function param (request: ApiRequest, name: string): string | undefined {
  return request.query?.find(([key]) => key === name)?.[1]
}

function answer (request: ApiRequest): Json {
  switch (request.path) {
    case '/oauth/token/accessible-resources':
      return [{ id: CLOUD, name: 'acme', url: 'https://acme.atlassian.net', scopes: ['read:jira-work'], avatarUrl: '' }]
    case `/ex/jira/${CLOUD}/rest/api/3/project/search`:
      return param(request, 'startAt') === '0'
        ? { startAt: 0, maxResults: 50, total: 2, isLast: false, values: [{ id: '10', key: 'WEB', name: 'Website' }] }
        : { startAt: 50, maxResults: 50, total: 2, isLast: true, values: [{ id: '11', key: 'OPS', name: 'Operations' }] }
    case `/ex/jira/${CLOUD}/rest/api/3/search/jql`:
      expect(param(request, 'jql')).toBe('project = "WEB" ORDER BY created ASC')
      if (param(request, 'nextPageToken') === undefined) {
        return {
          isLast: false,
          nextPageToken: 'tok-2',
          issues: [{
            id: '1001',
            key: 'WEB-1',
            fields: fields({
              summary: 'Checkout broken',
              description: adf('Pay button does nothing'),
              status: { name: 'In Review', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
              priority: { name: 'Highest', id: '1' },
              assignee: ana,
              labels: ['payments'],
              duedate: '2026-03-01',
              issuetype: { name: 'Bug', subtask: false },
              timeoriginalestimate: 7200,
              comment: { comments: [comment('c1', ana, 'Looking', '2026-01-03T10:00:00.000+0000')], maxResults: 1, total: 2, startAt: 0 }
            })
          }]
        }
      }
      return {
        isLast: true,
        issues: [
          { id: '1002', key: 'WEB-2', fields: fields({ summary: 'Retry payment', parent: { id: '1001', key: 'WEB-1' }, status: { name: "Won't Do", statusCategory: { id: 3, key: 'done', name: 'Done' } } }) },
          { id: '1003', key: 'WEB-3', fields: fields({ summary: 'Epic child', parent: { id: '900', key: 'EPIC-9' } }) }
        ]
      }
    case `/ex/jira/${CLOUD}/rest/api/3/issue/WEB-1/comment`:
      return { startAt: 0, maxResults: 100, total: 2, comments: [comment('c1', ana, 'Looking', '2026-01-03T10:00:00.000+0000'), comment('c2', bo, 'Fixed', '2026-01-04T10:00:00.000+0000')] }
    default:
      throw new Error(`unexpected ${request.path}`)
  }
}

const api: ApiCall = async (request) => ({ status: 200, body: answer(request) })

describe('jiraConnector', () => {
  it('lists projects across pages with the site name', async () => {
    await expect(jiraConnector.listScopes(api)).resolves.toEqual([
      { id: `${CLOUD}/WEB`, name: 'Website', kind: 'project', parentName: 'acme', isSelected: true },
      { id: `${CLOUD}/OPS`, name: 'Operations', kind: 'project', parentName: 'acme', isSelected: true }
    ])
  })

  it('pages issues, loads truncated comments, and maps fields', async () => {
    const progress = jest.fn()
    const bundle = await jiraConnector.fetch(api, [`${CLOUD}/WEB`], progress, new AbortController().signal)
    expect(progress).toHaveBeenLastCalledWith({ label: 'Website', count: 3 })
    expect(bundle.projects.map((project) => project.name)).toEqual(['Website'])
    const [bug, child, orphan] = bundle.projects[0].issues
    expect(bug).toEqual({
      key: 'WEB-1',
      parentKey: undefined,
      title: 'Checkout broken',
      description: 'Pay button does nothing',
      status: 'inProgress',
      sourceStatus: 'In Review',
      priority: 'urgent',
      assignee: { name: 'Ana Silva', email: 'ana@acme.io' },
      creator: { name: 'Bo Chen', email: undefined },
      labels: ['payments', 'Bug'],
      estimateHours: 2,
      dueDate: Date.UTC(2026, 2, 1),
      createdOn: Date.UTC(2026, 0, 2, 10),
      comments: [
        { author: { name: 'Ana Silva', email: 'ana@acme.io' }, date: Date.UTC(2026, 0, 3, 10), text: 'Looking' },
        { author: { name: 'Bo Chen', email: undefined }, date: Date.UTC(2026, 0, 4, 10), text: 'Fixed' }
      ]
    })
    expect(child).toMatchObject({ key: 'WEB-2', parentKey: 'WEB-1', status: 'canceled', priority: 'medium' })
    expect(orphan.parentKey).toBeUndefined()
    expect(bundle.warnings).toEqual(['Issues whose parent is not in the export were kept at the top level: 1'])
  })
})
