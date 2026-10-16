import { cumulativeFlow, cycleTimes, percentile } from '../flow'
import type { IssueHistory } from '../report'
import { DAY, type Sprint } from '../types'

const d0 = new Date(2026, 9, 1).getTime()
const at = (days: number, hours = 12): number => d0 + days * DAY + hours * 3600 * 1000

function h (_id: string, over: Partial<IssueHistory>): IssueHistory {
  return {
    _id,
    isEpic: false,
    created: d0 - DAY,
    initial: { status: 'todo', sprint: 's', points: 2 },
    changes: [],
    ...over
  }
}

const sprint: Sprint = { _id: 's', label: 'S', state: 'active', startDate: d0, targetDate: d0 + 4 * DAY }

describe('cumulativeFlow', () => {
  const histories = [
    h('a', { changes: [{ at: at(0), status: 'active' }, { at: at(1), status: 'done' }] }),
    h('b', { changes: [{ at: at(1), status: 'active' }] }),
    h('c', { initial: { status: 'unstarted', sprint: null, points: 3 }, changes: [{ at: at(2), sprint: 's' }] }),
    h('e', { isEpic: true }),
    h('x', { changes: [{ at: at(0), status: 'canceled' }] })
  ]

  it('stacks the sprint by stage per day, up to now', () => {
    expect(cumulativeFlow(sprint, histories, true, at(2, 18))).toEqual([
      { day: d0, todo: 2, active: 2, done: 0 },
      { day: d0 + DAY, todo: 0, active: 2, done: 2 },
      { day: d0 + 2 * DAY, todo: 3, active: 2, done: 2 }
    ])
  })

  it('counts issues when points are off', () => {
    expect(cumulativeFlow(sprint, histories, false, at(0, 18))).toEqual([{ day: d0, todo: 1, active: 1, done: 0 }])
  })
})

describe('cycleTimes', () => {
  it('measures first start to last done, only for done work', () => {
    const list = cycleTimes(
      [
        h('a', { changes: [{ at: at(0), status: 'active' }, { at: at(1), status: 'done' }] }),
        h('b', { changes: [{ at: at(0), status: 'active' }, { at: at(1), status: 'done' }, { at: at(2), status: 'active' }] }),
        h('c', { created: at(0), changes: [{ at: at(3), status: 'done' }] }),
        h('d', {
          changes: [
            { at: at(0), status: 'active' },
            { at: at(1), status: 'done' },
            { at: at(2), status: 'active' },
            { at: at(4), status: 'done' }
          ]
        })
      ],
      ['a', 'b', 'c', 'd']
    )
    expect(list.map((c) => [c._id, c.days])).toEqual([
      ['a', 1],
      ['c', 3],
      ['d', 4]
    ])
  })
})

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 85)).toBe(5)
    expect(percentile([], 50)).toBeUndefined()
  })
})
