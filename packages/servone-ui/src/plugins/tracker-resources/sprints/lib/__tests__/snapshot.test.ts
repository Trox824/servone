import { parseSprintSnapshot, snapshotCycleTimes, snapshotPlanIssues, sprintIssuesSnapshot } from '../snapshot'
import { DAY, type PlanIssue } from '../types'

const T0 = new Date(2026, 9, 1).getTime()

function issue (_id: string, over: Partial<PlanIssue> = {}): PlanIssue {
  return { _id, parent: null, isEpic: false, status: 'todo', points: 3, estimation: 0, sprint: 's1', assignee: null, ...over }
}

describe('sprintIssuesSnapshot', () => {
  it('keeps done and open work with its dates, leaving out epics and canceled work', () => {
    const snapshot = sprintIssuesSnapshot([
      issue('a', { status: 'done', assignee: 'ann', parent: 'e1', points: 5, startedOn: T0, completedOn: T0 + DAY }),
      issue('b', { status: 'active', points: null, startedOn: T0 }),
      issue('x', { status: 'canceled' }),
      issue('e1', { isEpic: true })
    ])
    expect(snapshot).toEqual({
      v: 1,
      issues: [
        { id: 'a', assignee: 'ann', epic: 'e1', points: 5, done: true, startedOn: T0, completedOn: T0 + DAY },
        { id: 'b', assignee: null, epic: null, points: null, done: false, startedOn: T0, completedOn: null }
      ]
    })
  })
})

describe('parseSprintSnapshot', () => {
  it('round-trips a stored snapshot', () => {
    const snapshot = sprintIssuesSnapshot([issue('a', { status: 'done', completedOn: T0 })])
    expect(parseSprintSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('drops malformed rows and rejects anything that is not a v1 snapshot', () => {
    const raw = JSON.stringify({
      v: 1,
      issues: [{ id: 'a', assignee: null, epic: null, points: 2, done: true, startedOn: null, completedOn: T0 }, { id: 3 }, null]
    })
    expect(parseSprintSnapshot(raw)?.issues.map((row) => row.id)).toEqual(['a'])
    expect(parseSprintSnapshot(JSON.stringify({ v: 2, issues: [] }))).toBeUndefined()
    expect(parseSprintSnapshot('not json')).toBeUndefined()
    expect(parseSprintSnapshot(undefined)).toBeUndefined()
  })
})

describe('snapshotPlanIssues', () => {
  it('turns rows back into plan issues for the breakdown', () => {
    const snapshot = sprintIssuesSnapshot([issue('a', { status: 'done', assignee: 'ann', parent: 'e1', points: 5 })])
    expect(snapshotPlanIssues(snapshot, 's1')).toEqual([
      { _id: 'a', parent: 'e1', isEpic: false, status: 'done', points: 5, estimation: 0, sprint: 's1', assignee: 'ann' }
    ])
  })
})

describe('snapshotCycleTimes', () => {
  it('measures started done work and leaves out work that never started', () => {
    const snapshot = sprintIssuesSnapshot([
      issue('b', { status: 'done', startedOn: T0 + DAY, completedOn: T0 + 4 * DAY }),
      issue('a', { status: 'done', startedOn: T0, completedOn: T0 + 2 * DAY }),
      issue('c', { status: 'done', startedOn: null, completedOn: T0 + DAY }),
      issue('d', { status: 'active', startedOn: T0 })
    ])
    expect(snapshotCycleTimes(snapshot)).toEqual([
      { _id: 'a', startedAt: T0, doneAt: T0 + 2 * DAY, days: 2 },
      { _id: 'b', startedAt: T0 + DAY, doneAt: T0 + 4 * DAY, days: 3 }
    ])
  })
})
