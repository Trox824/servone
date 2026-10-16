import { sprintReport, valuesAt, velocity, type IssueHistory } from '../report'
import { DAY, type Sprint } from '../types'

const T0 = new Date(2026, 9, 1).getTime() // Thu 1 Oct 2026, local midnight
const H = 3600_000

const sprint: Sprint = { _id: 's1', label: 'Sprint 1', state: 'active', startDate: T0 + 9 * H, targetDate: T0 + 4 * DAY }

function hist (_id: string, points: number, changes: IssueHistory['changes'] = [], created = T0 - DAY): IssueHistory {
  return { _id, isEpic: false, created, initial: { status: 'todo', sprint: 's1', points }, changes }
}

describe('valuesAt', () => {
  it('replays changes up to the given time', () => {
    const h = hist('a', 3, [
      { at: T0 + DAY, status: 'done' },
      { at: T0, points: 5 }
    ])
    expect(valuesAt(h, T0 - 2 * DAY)).toBeUndefined()
    expect(valuesAt(h, T0 - 1)).toEqual({ status: 'todo', sprint: 's1', points: 3 })
    expect(valuesAt(h, T0 + 2 * DAY)).toEqual({ status: 'done', sprint: 's1', points: 5 })
  })
})

describe('sprintReport', () => {
  it('burns down points per day with an ideal line from committed to zero', () => {
    const r = sprintReport(
      sprint,
      [hist('a', 3, [{ at: T0 + DAY + H, status: 'done' }]), hist('b', 5, [{ at: T0 + 3 * DAY + H, status: 'done' }])],
      true,
      T0 + 10 * DAY
    )
    expect(r.committed).toBe(8)
    expect(r.burndown.map((p) => p.remaining)).toEqual([8, 5, 5, 0, 0])
    expect(r.burndown[0].ideal).toBe(8)
    expect(r.burndown[4].ideal).toBe(0)
    expect(r.completed.sort()).toEqual(['a', 'b'])
  })

  it('shows scope added mid-sprint as a rise and lists it as added', () => {
    const late = hist('c', 2, [], T0 + 2 * DAY)
    const r = sprintReport(sprint, [hist('a', 3), late], true, T0 + 10 * DAY)
    expect(r.burndown.map((p) => p.remaining)).toEqual([3, 3, 5, 5, 5])
    expect(r.burndown[2].scope).toBe(5)
    expect(r.added).toEqual(['c'])
    expect(r.notCompleted.sort()).toEqual(['a', 'c'])
  })

  it('counts issues planned during the first day as committed, not added', () => {
    const planned = hist('p', 2, [{ at: T0 + 11 * H, sprint: 's1' }])
    planned.initial.sprint = null
    const r = sprintReport(sprint, [hist('a', 3), planned], true, T0 + 10 * DAY)
    expect(r.added).toEqual([])
    expect(r.committed).toBe(5)
    expect(r.burndown[0].remaining).toBe(5)
  })

  it('drops issues moved out mid-sprint and lists them as removed', () => {
    const moved = hist('b', 5, [{ at: T0 + DAY + H, sprint: null }])
    const r = sprintReport(sprint, [hist('a', 3), moved], true, T0 + 10 * DAY)
    expect(r.burndown.map((p) => p.remaining)).toEqual([8, 3, 3, 3, 3])
    expect(r.removed).toEqual(['b'])
  })

  it('counts issues when points are off, and leaves future days empty', () => {
    const r = sprintReport(sprint, [hist('a', 0), hist('b', 0, [{ at: T0 + H * 12, status: 'done' }])], false, T0 + DAY + H)
    expect(r.committed).toBe(2)
    expect(r.burndown.map((p) => p.remaining)).toEqual([1, 1, null, null, null])
  })

  it('reads a closed sprint just before completion, so rolled-over work is not completed', () => {
    const completedAt = T0 + 4 * DAY + 10 * H
    const closed: Sprint = { ...sprint, state: 'closed', completedAt, committedPoints: 8, rolledOver: ['b'] }
    const r = sprintReport(
      closed,
      [hist('a', 3, [{ at: T0 + DAY, status: 'done' }]), hist('b', 5, [{ at: completedAt + 50, sprint: 's2' }])],
      true,
      T0 + 30 * DAY
    )
    expect(r.completed).toEqual(['a'])
    expect(r.notCompleted).toEqual(['b'])
    expect(r.burndown[4].remaining).toBe(5)
    expect(r.removed).toEqual([])
  })
})

describe('velocity', () => {
  it('uses snapshots, falls back to history, keeps the last N closed sprints oldest first', () => {
    const closed = (id: string, at: number, over: Partial<Sprint> = {}): Sprint => ({
      _id: id,
      label: id,
      state: 'closed',
      startDate: at - 6 * DAY,
      targetDate: at,
      completedAt: at,
      ...over
    })
    const sprints = [
      closed('s3', T0 + 21 * DAY, { committedPoints: 10, completedPoints: 7 }),
      closed('s1', T0 + 7 * DAY),
      closed('s2', T0 + 14 * DAY, { committedPoints: 12, completedPoints: 12 }),
      { ...sprint, _id: 's4' }
    ]
    const v = velocity(sprints, 2, () => ({ committed: 1, completed: 1 }))
    expect(v).toEqual([
      { sprint: 's2', label: 's2', committed: 12, completed: 12 },
      { sprint: 's3', label: 's3', committed: 10, completed: 7 }
    ])
    expect(velocity(sprints, 7, () => ({ committed: 9, completed: 4 }))[0]).toMatchObject({ sprint: 's1', committed: 9, completed: 4 })
  })
})
