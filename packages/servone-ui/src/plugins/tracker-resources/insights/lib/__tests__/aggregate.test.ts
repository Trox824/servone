import { DAY } from '../../../sprints/lib/types'
import { bucketStats, insightBars, median, OTHER_KEY, panelIssues, statusTable, summaryRows } from '../aggregate'
import type { InsightIssue } from '../types'

const T0 = new Date(2026, 8, 1).getTime()

function issue (_id: string, over: Partial<InsightIssue> = {}): InsightIssue {
  return {
    _id,
    identifier: `SRV-${_id}`,
    title: `Issue ${_id}`,
    project: 'p',
    status: 'st-done',
    statusName: 'Done',
    statusKind: 'done',
    isEpic: false,
    assignee: null,
    points: 1,
    labels: [],
    epic: null,
    sprint: null,
    createdOn: T0,
    startedOn: T0 + DAY,
    completedOn: T0 + 3 * DAY,
    ...over
  }
}

describe('median', () => {
  it('takes the middle value, or the mean of the two middle values like Sheets MEDIAN', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeUndefined()
  })
})

describe('bucketStats', () => {
  it('counts issues, sums points and counts unestimated ones', () => {
    const stats = bucketStats([issue('a', { points: 3 }), issue('b', { points: null }), issue('c', { points: 5 })])
    expect(stats.issues).toBe(3)
    expect(stats.points).toBe(8)
    expect(stats.unestimated).toBe(1)
  })

  it('leaves work that never started out of cycle time', () => {
    const stats = bucketStats([
      issue('a', { startedOn: T0 + DAY, completedOn: T0 + 3 * DAY }),
      issue('b', { startedOn: null, completedOn: T0 + 2 * DAY })
    ])
    expect(stats.cycleMs).toEqual([2 * DAY])
    expect(stats.neverStarted).toBe(1)
  })

  it('measures lead time from creation to completion', () => {
    expect(bucketStats([issue('a', { createdOn: T0, completedOn: T0 + 4 * DAY })]).leadMs).toEqual([4 * DAY])
  })
})

describe('insightBars', () => {
  it('sums points per assignee, biggest first, unassigned last', () => {
    const bars = insightBars(
      [
        issue('a', { assignee: 'ann', points: 3 }),
        issue('b', { assignee: 'bob', points: 5 }),
        issue('c', { assignee: 'ann', points: 1 }),
        issue('d', { points: 13 })
      ],
      { measure: 'points', slice: 'assignee', segment: null }
    )
    expect(bars.map((bar) => [bar.key, bar.amount])).toEqual([
      ['bob', 5],
      ['ann', 4],
      ['', 13]
    ])
  })

  it('leaves out epics and canceled issues', () => {
    const bars = insightBars(
      [issue('a', { assignee: 'ann' }), issue('e', { assignee: 'ann', isEpic: true }), issue('x', { assignee: 'ann', statusKind: 'canceled' })],
      { measure: 'count', slice: 'assignee', segment: null }
    )
    expect(bars).toEqual([{ key: 'ann', amount: 1, p85: undefined, segments: [] }])
  })

  it('puts a multi-label issue into every label bucket', () => {
    const bars = insightBars([issue('a', { labels: ['ui', 'api'] }), issue('b', { labels: ['ui'] }), issue('c')], {
      measure: 'count',
      slice: 'label',
      segment: null
    })
    expect(bars.map((bar) => [bar.key, bar.amount])).toEqual([
      ['ui', 2],
      ['api', 1],
      ['', 1]
    ])
  })

  it('folds buckets past the twelfth into Other, counting each issue once', () => {
    const big = Array.from({ length: 36 }, (_, n) => issue(`i${n}`, { labels: [`l${String(n % 12).padStart(2, '0')}`] }))
    const issues = [...big, issue('x12', { labels: ['l12'] }), issue('x13', { labels: ['l13'] }), issue('both', { labels: ['l12', 'l13'] })]
    const bars = insightBars(issues, { measure: 'count', slice: 'label', segment: null })
    expect(bars).toHaveLength(13)
    expect(bars[12]).toMatchObject({ key: OTHER_KEY, amount: 3 })
  })

  it('splits bars into the top segments with the rest as Other', () => {
    const bars = insightBars(
      [
        issue('a', { assignee: 'ann', statusName: 'Done' }),
        issue('b', { assignee: 'ann', statusName: 'Shipped' }),
        issue('c', { assignee: 'ann', statusName: 'Done' })
      ],
      { measure: 'count', slice: 'assignee', segment: 'status' }
    )
    expect(bars[0].segments).toEqual([
      { key: 'Done', amount: 2 },
      { key: 'Shipped', amount: 1 }
    ])
  })

  it('folds segments past the fifth into Other', () => {
    const issues = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((sprint, n) => issue(sprint, { sprint, points: 10 - n }))
    const bars = insightBars(issues, { measure: 'points', slice: 'assignee', segment: 'sprint' })
    expect(bars[0].segments.map((segment) => segment.key)).toEqual(['a', 'b', 'c', 'd', 'e', OTHER_KEY])
    expect(bars[0].segments[5].amount).toBe(5 + 4)
  })

  it('shows the median cycle time in days with a p85 and no segments', () => {
    const bars = insightBars(
      [
        issue('a', { assignee: 'ann', startedOn: T0, completedOn: T0 + DAY }),
        issue('b', { assignee: 'ann', startedOn: T0, completedOn: T0 + 2 * DAY }),
        issue('c', { assignee: 'ann', startedOn: T0, completedOn: T0 + 4 * DAY }),
        issue('d', { assignee: 'ann', startedOn: T0, completedOn: T0 + 5 * DAY })
      ],
      { measure: 'cycleTime', slice: 'assignee', segment: 'status' }
    )
    expect(bars).toEqual([{ key: 'ann', amount: 3, p85: 5, segments: [] }])
  })
})

describe('summaryRows', () => {
  it('gives one row per slice bucket and segment', () => {
    const rows = summaryRows(
      [issue('a', { assignee: 'ann', sprint: 's1' }), issue('b', { assignee: 'ann' }), issue('c', { assignee: 'bob', sprint: 's1' })],
      'assignee',
      'sprint'
    )
    expect(rows.map((row) => [row.slice, row.segment, row.stats.issues])).toEqual([
      ['ann', 's1', 1],
      ['ann', '', 1],
      ['bob', 's1', 1]
    ])
  })

  it('does not fold small buckets into Other', () => {
    const issues = Array.from({ length: 14 }, (_, n) => issue(`i${n}`, { assignee: `p${n}` }))
    expect(summaryRows(issues, 'assignee', null)).toHaveLength(14)
  })
})

describe('statusTable', () => {
  const open = [
    issue('o1', { assignee: 'ann', status: 'st-todo', statusName: 'Todo', statusKind: 'todo', points: 2 }),
    issue('o2', { assignee: 'ann', status: 'st-prog', statusName: 'In Progress', statusKind: 'active', points: 3 }),
    issue('o3', { assignee: 'bob', status: 'st-back', statusName: 'Backlog', statusKind: 'unstarted', points: null }),
    issue('o4', { assignee: 'bob', status: 'st-todo-2', statusName: 'Todo', statusKind: 'todo', points: 1 })
  ]
  const completed = [issue('d1', { assignee: 'ann', points: 5 }), issue('x', { assignee: 'ann', statusKind: 'canceled' })]

  it('groups columns by status name, ordered by category', () => {
    const table = statusTable(open, completed)
    expect(table.columns).toEqual([
      { name: 'Backlog', kind: 'unstarted' },
      { name: 'Todo', kind: 'todo' },
      { name: 'In Progress', kind: 'active' },
      { name: 'Done', kind: 'done' }
    ])
  })

  it('shows open work as it is now next to the work completed in the range', () => {
    const table = statusTable(open, completed)
    expect(table.rows.map((row) => [row.assignee, row.cells, row.total])).toEqual([
      [
        'ann',
        [
          { count: 0, points: 0 },
          { count: 1, points: 2 },
          { count: 1, points: 3 },
          { count: 1, points: 5 }
        ],
        { count: 3, points: 10 }
      ],
      [
        'bob',
        [
          { count: 1, points: 0 },
          { count: 1, points: 1 },
          { count: 0, points: 0 },
          { count: 0, points: 0 }
        ],
        { count: 2, points: 1 }
      ]
    ])
    expect(table.totals).toEqual([
      { count: 1, points: 0 },
      { count: 2, points: 3 },
      { count: 1, points: 3 },
      { count: 1, points: 5 }
    ])
    expect(table.total).toEqual({ count: 5, points: 11 })
  })

  it('keeps a reopened issue out of the Done columns', () => {
    expect(panelIssues([], [issue('r', { statusKind: 'active', statusName: 'In Progress' })])).toEqual([])
  })
})
