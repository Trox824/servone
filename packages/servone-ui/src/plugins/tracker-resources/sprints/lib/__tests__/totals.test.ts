import { formatPoints, scaleValues } from '../scale'
import { epicProgress, isBacklogRow, totals } from '../totals'
import type { PlanIssue } from '../types'

function issue (_id: string, over: Partial<PlanIssue> = {}): PlanIssue {
  return { _id, parent: null, isEpic: false, status: 'todo', points: null, estimation: 0, sprint: null, ...over }
}

describe('totals', () => {
  it('sums points, hours and counts, and counts unpointed issues', () => {
    const t = totals([
      issue('a', { points: 3, estimation: 4 }),
      issue('b', { points: 5, estimation: 2, status: 'done' }),
      issue('c', { estimation: 1 })
    ])
    expect(t).toEqual({ count: 3, points: 8, hours: 7, unpointed: 1, doneCount: 1, donePoints: 5 })
  })

  it('leaves canceled issues and epics out', () => {
    const t = totals([
      issue('a', { points: 3 }),
      issue('b', { points: 5, status: 'canceled' }),
      issue('e', { points: 13, isEpic: true })
    ])
    expect(t.count).toBe(1)
    expect(t.points).toBe(3)
  })
})

describe('epicProgress', () => {
  const epic = issue('e', { isEpic: true })

  it('reports work in progress next to done work', () => {
    const p = epicProgress('e', [
      epic,
      issue('a', { parent: 'e', points: 3, status: 'done' }),
      issue('b', { parent: 'e', points: 5, status: 'active' }),
      issue('c', { parent: 'e', points: 2 })
    ])
    expect(p.activeCount).toBe(1)
    expect(p.activePoints).toBe(5)
    expect(p.activeRatio).toBe(0.5)
    expect(p.ratio).toBe(0.3)
  })

  it('measures by points when children are pointed', () => {
    const p = epicProgress('e', [
      epic,
      issue('a', { parent: 'e', points: 3, status: 'done' }),
      issue('b', { parent: 'e', points: 5 }),
      issue('c', { parent: 'e', points: 8, status: 'canceled' })
    ])
    expect(p.byPoints).toBe(true)
    expect(p.points).toBe(8)
    expect(p.ratio).toBeCloseTo(3 / 8)
  })

  it('falls back to issue count when no child has points', () => {
    const p = epicProgress('e', [
      epic,
      issue('a', { parent: 'e', status: 'done' }),
      issue('b', { parent: 'e' }),
      issue('c', { parent: 'e' }),
      issue('d', { parent: 'e', status: 'done' })
    ])
    expect(p.byPoints).toBe(false)
    expect(p.ratio).toBe(0.5)
  })

  it('counts direct children only, so sub-tasks roll into their parent', () => {
    const p = epicProgress('e', [
      epic,
      issue('a', { parent: 'e', points: 2 }),
      issue('a1', { parent: 'a', points: 40, status: 'done' })
    ])
    expect(p.points).toBe(2)
    expect(p.ratio).toBe(0)
  })

  it('is zero for an empty epic', () => {
    expect(epicProgress('e', [epic]).ratio).toBe(0)
  })
})

describe('isBacklogRow', () => {
  it('shows top-level work and epic children, hides epics and sub-tasks', () => {
    const epics = new Set(['e'])
    expect(isBacklogRow(issue('e', { isEpic: true }), epics)).toBe(false)
    expect(isBacklogRow(issue('a'), epics)).toBe(true)
    expect(isBacklogRow(issue('b', { parent: 'e' }), epics)).toBe(true)
    expect(isBacklogRow(issue('c', { parent: 'b' }), epics)).toBe(false)
  })
})

describe('scales', () => {
  it('maps T-shirt sizes to numbers and back', () => {
    expect(scaleValues('tshirt')).toEqual([1, 2, 3, 5, 8])
    expect(formatPoints(5, 'tshirt')).toBe('L')
    expect(formatPoints(4, 'tshirt')).toBe('4')
    expect(formatPoints(13, 'fibonacci')).toBe('13')
    expect(formatPoints(null, 'fibonacci')).toBe('–')
    expect(scaleValues('off')).toEqual([])
  })
})
