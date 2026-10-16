import type { Json } from '../../http-json'
import { IssuePriority } from '@hcengineering/tracker'
import { buildPayload, type IssueFacts, MAX_COMMENT_CHARS, type ResolvedChange, testChange } from '../payload'

const DELIVERY = '8f14e45fceea167a5a36dedd4bea2543'
const AN = { name: 'An Tran', email: 'an@servone.vn' }
const HUNG = { name: 'Hung Nguyen', email: 'hung@servone.vn' }
const DUE = Date.parse('2026-10-03T00:00:00.000Z')

const current: IssueFacts = {
  title: 'Send tracker events to outside webhooks',
  status: 'In Progress',
  priority: IssuePriority.High,
  assignee: AN,
  dueDate: DUE
}

function change (overrides: Partial<ResolvedChange> = {}): ResolvedChange {
  return {
    occurredAt: Date.parse('2026-09-27T09:14:03.512Z'),
    project: { identifier: 'SRV', name: 'Servone' },
    issue: { ...current, identifier: 'SRV-122', url: 'https://platform.servone.app/workbench/servone/tracker/SRV-122' },
    previous: { ...current, status: 'Todo' },
    changedFields: ['status'],
    actor: HUNG,
    comment: undefined,
    ...overrides
  }
}

const parsed = (body: string): { [key: string]: Json } => JSON.parse(body)

describe('buildPayload', () => {
  it('builds the documented status_changed body', () => {
    expect(parsed(buildPayload('issue.status_changed', DELIVERY, change()))).toEqual({
      version: 1,
      event: 'issue.status_changed',
      deliveryId: DELIVERY,
      occurredAt: '2026-09-27T09:14:03.512Z',
      project: { identifier: 'SRV', name: 'Servone' },
      issue: {
        identifier: 'SRV-122',
        title: 'Send tracker events to outside webhooks',
        status: 'In Progress',
        priority: 'high',
        assignee: { name: 'An Tran', email: 'an@servone.vn' },
        dueDate: '2026-10-03T00:00:00.000Z',
        url: 'https://platform.servone.app/workbench/servone/tracker/SRV-122'
      },
      changes: [{ field: 'status', from: 'Todo', to: 'In Progress' }],
      actor: { name: 'Hung Nguyen', email: 'hung@servone.vn' }
    })
  })

  it('lists every changed field of an update', () => {
    const body = buildPayload(
      'issue.updated',
      DELIVERY,
      change({
        previous: { ...current, title: 'Send tracker events', priority: IssuePriority.Medium, dueDate: null },
        changedFields: ['title', 'priority', 'dueDate']
      })
    )
    expect(parsed(body).changes).toEqual([
      { field: 'title', from: 'Send tracker events', to: 'Send tracker events to outside webhooks' },
      { field: 'priority', from: 'medium', to: 'high' },
      { field: 'dueDate', from: null, to: '2026-10-03T00:00:00.000Z' }
    ])
  })

  it('shows an assignment from nobody', () => {
    const body = buildPayload('issue.assigned', DELIVERY, change({ previous: { ...current, assignee: null }, changedFields: ['assignee'] }))
    expect(parsed(body).changes).toEqual([{ field: 'assignee', from: null, to: AN }])
  })

  it('keeps a null assignee and a null email', () => {
    const body = buildPayload(
      'issue.created',
      DELIVERY,
      change({ issue: { ...change().issue, assignee: null }, actor: { name: 'System', email: null }, previous: undefined, changedFields: [] })
    )
    expect(parsed(body)).toMatchObject({ event: 'issue.created', changes: [], actor: { name: 'System', email: null } })
    expect(parsed(body).issue).toMatchObject({ assignee: null })
  })

  it('uses null for "from" when the previous state is unknown', () => {
    const body = buildPayload('issue.status_changed', DELIVERY, change({ previous: undefined }))
    expect(parsed(body).changes).toEqual([{ field: 'status', from: null, to: 'In Progress' }])
  })

  it.each([
    [IssuePriority.NoPriority, 'none'],
    [IssuePriority.Urgent, 'urgent'],
    [IssuePriority.High, 'high'],
    [IssuePriority.Medium, 'medium'],
    [IssuePriority.Low, 'low']
  ])('names priority %s as %s', (priority, name) => {
    const body = buildPayload('issue.created', DELIVERY, change({ issue: { ...change().issue, priority }, changedFields: [] }))
    expect(parsed(body).issue).toMatchObject({ priority: name })
  })

  it('sends a deleted issue with no url', () => {
    const body = buildPayload('issue.deleted', DELIVERY, change({ issue: { ...change().issue, url: null }, changedFields: [] }))
    expect(parsed(body)).toMatchObject({ event: 'issue.deleted', changes: [], issue: { identifier: 'SRV-122', url: null } })
  })

  it('adds the comment only to comment.added', () => {
    const comment = 'Deployed to staging, **please test**.'
    expect(parsed(buildPayload('comment.added', DELIVERY, change({ comment, changedFields: [] })))).toMatchObject({
      changes: [],
      comment: { text: comment, isTruncated: false }
    })
    expect(parsed(buildPayload('issue.status_changed', DELIVERY, change({ comment })))).not.toHaveProperty('comment')
  })

  it('cuts a long comment', () => {
    const comment = 'x'.repeat(MAX_COMMENT_CHARS + 10)
    const body = parsed(buildPayload('comment.added', DELIVERY, change({ comment, changedFields: [] })))
    expect(body.comment).toEqual({ text: 'x'.repeat(MAX_COMMENT_CHARS), isTruncated: true })
  })
})

describe('testChange', () => {
  it('builds the documented test event', () => {
    const body = parsed(buildPayload('test', DELIVERY, testChange({ identifier: 'SRV', name: 'Servone' }, HUNG, Date.parse('2026-09-27T09:00:00.000Z'))))
    expect(body).toEqual({
      version: 1,
      event: 'test',
      deliveryId: DELIVERY,
      occurredAt: '2026-09-27T09:00:00.000Z',
      project: { identifier: 'SRV', name: 'Servone' },
      issue: {
        identifier: 'SRV-0',
        title: 'Test event from Servone',
        status: 'Todo',
        priority: 'none',
        assignee: null,
        dueDate: null,
        url: null
      },
      changes: [],
      actor: HUNG
    })
  })
})
