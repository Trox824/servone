import { capacity, statusSplit } from '../capacity'
import type { PlanIssue, Sprint } from '../types'

function issue (over: Partial<PlanIssue>): PlanIssue {
  return { _id: 'i', parent: null, isEpic: false, status: 'todo', points: 3, estimation: 0, sprint: 's', ...over }
}

function sprint (over: Partial<Sprint>): Sprint {
  return { _id: 's', label: 'S', state: 'closed', startDate: 0, targetDate: 0, ...over }
}

describe('statusSplit', () => {
  const list = [
    issue({ status: 'unstarted', points: 1 }),
    issue({ status: 'todo', points: 2 }),
    issue({ status: 'active', points: 5 }),
    issue({ status: 'done', points: 8 }),
    issue({ status: 'canceled', points: 13 }),
    issue({ isEpic: true, points: 21 }),
    issue({ status: 'todo', points: null })
  ]
  it('splits points by stage, without epics and canceled work', () => {
    expect(statusSplit(list, true)).toEqual({ todo: 3, active: 5, done: 8 })
  })
  it('counts issues when points are off', () => {
    expect(statusSplit(list, false)).toEqual({ todo: 3, active: 1, done: 1 })
  })
})

describe('capacity', () => {
  it('averages the last three closed sprints by completion', () => {
    const list = [
      sprint({ completedAt: 1, completedPoints: 100 }),
      sprint({ completedAt: 2, completedPoints: 10 }),
      sprint({ completedAt: 3, completedPoints: 20 }),
      sprint({ completedAt: 4, completedPoints: 31 }),
      sprint({ state: 'active', completedPoints: 999 })
    ]
    expect(capacity(list, true)).toBe(20)
  })
  it('uses issue counts when points are off, and is undefined before any sprint closes', () => {
    expect(capacity([sprint({ completedAt: 1, completedCount: 7 })], false)).toBe(7)
    expect(capacity([sprint({ state: 'future' })], true)).toBeUndefined()
    expect(capacity([sprint({})], true)).toBeUndefined()
  })
})
