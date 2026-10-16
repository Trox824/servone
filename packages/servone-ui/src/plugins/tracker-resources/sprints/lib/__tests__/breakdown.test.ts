import { breakdown, byShare, weigh } from '../breakdown'
import type { PlanIssue } from '../types'

function issue (_id: string, over: Partial<PlanIssue> = {}): PlanIssue {
  return { _id, parent: null, isEpic: false, status: 'todo', points: 3, estimation: 0, sprint: 's1', assignee: null, ...over }
}

describe('breakdown', () => {
  const issues = [
    issue('a', { assignee: 'ann', parent: 'e1', status: 'done', points: 5 }),
    issue('b', { assignee: 'ann', parent: 'e1', points: 3 }),
    issue('c', { assignee: 'bob', parent: 'e2', status: 'done', points: 2 }),
    issue('d', { parent: 'e2', points: 8 }),
    issue('x', { assignee: 'bob', status: 'canceled', points: 13 }),
    issue('e1', { isEpic: true, assignee: 'ann' })
  ]

  it('groups by assignee with done and total points, unassigned last', () => {
    expect(breakdown(issues, 'assignee', true)).toEqual([
      { key: 'ann', count: 2, total: 8, done: 5 },
      { key: 'bob', count: 1, total: 2, done: 2 },
      { key: '', count: 1, total: 8, done: 0 }
    ])
  })

  it('groups by epic and counts issues when points are off', () => {
    expect(breakdown(issues, 'epic', false)).toEqual([
      { key: 'e1', count: 2, total: 2, done: 1 },
      { key: 'e2', count: 2, total: 2, done: 1 }
    ])
  })
})

describe('weigh', () => {
  it('sums points, or counts issues, of the given ids', () => {
    const byId = new Map([issue('a', { points: 5 }), issue('b', { points: null })].map((it) => [it._id, it]))
    expect(weigh(['a', 'b', 'missing'], byId, true)).toBe(5)
    expect(weigh(['a', 'b', 'missing'], byId, false)).toBe(2)
  })
})

describe('byShare', () => {
  it('puts the none bucket last, then the biggest total, then the most issues', () => {
    const rows = [
      { key: '', total: 9, count: 9 },
      { key: 'b', total: 3, count: 1 },
      { key: 'c', total: 3, count: 2 },
      { key: 'a', total: 5, count: 1 }
    ]
    expect([...rows].sort(byShare).map((row) => row.key)).toEqual(['a', 'c', 'b', ''])
  })
})
