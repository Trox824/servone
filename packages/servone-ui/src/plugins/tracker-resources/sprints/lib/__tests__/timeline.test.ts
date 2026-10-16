import { rangeOf, spanOf, ticksOf, unionOf } from '../timeline'

const d = (y: number, m: number, day: number): number => new Date(y, m - 1, day).getTime()

describe('timeline', () => {
  const sprints = new Map([['s1', { startDate: d(2026, 10, 1), targetDate: d(2026, 10, 14) }]])

  it('uses the issue dates first', () => {
    expect(spanOf({ startDate: d(2026, 10, 3), dueDate: d(2026, 10, 5), milestone: 's1' }, sprints)).toEqual({ start: d(2026, 10, 3), end: d(2026, 10, 5) })
  })

  it('spans the sprint when there is no start date, stretched to a later due date', () => {
    expect(spanOf({ dueDate: d(2026, 10, 9), milestone: 's1' }, sprints)).toEqual({ start: d(2026, 10, 1), end: d(2026, 10, 14) })
    expect(spanOf({ dueDate: d(2026, 10, 20), milestone: 's1' }, sprints)).toEqual({ start: d(2026, 10, 1), end: d(2026, 10, 20) })
    expect(spanOf({ milestone: 's1' }, sprints)).toEqual({ start: d(2026, 10, 1), end: d(2026, 10, 14) })
  })

  it('is one day wide with only a due date and no sprint, and absent with nothing', () => {
    expect(spanOf({ dueDate: d(2026, 10, 9) }, sprints)).toEqual({ start: d(2026, 10, 9), end: d(2026, 10, 9) })
    expect(spanOf({}, sprints)).toBeUndefined()
  })

  it('unions spans', () => {
    expect(unionOf([undefined, { start: 5, end: 9 }, { start: 2, end: 6 }])).toEqual({ start: 2, end: 9 })
    expect(unionOf([undefined])).toBeUndefined()
  })

  it('pads the range to whole months, and quarters at the quarters zoom', () => {
    const r = rangeOf([{ start: d(2026, 10, 3), end: d(2026, 11, 20) }], d(2026, 9, 24), 'months')
    expect(r).toEqual({ start: d(2026, 8, 1), end: d(2027, 1, 1) })
    const q = rangeOf([{ start: d(2026, 10, 3), end: d(2026, 11, 20) }], d(2026, 9, 24), 'quarters')
    expect(new Date(q.start).getMonth() % 3).toBe(0)
    expect(new Date(q.end).getMonth() % 3).toBe(0)
  })

  it('builds month and week ticks covering the range', () => {
    const range = { start: d(2026, 9, 1), end: d(2026, 11, 1) }
    const m = ticksOf(range, 'months', 'en')
    expect(m.upper.map((t) => t.days)).toEqual([30, 31])
    const w = ticksOf(range, 'weeks', 'en')
    expect(w.lower[0].offset).toBe(0)
    const last = w.lower[w.lower.length - 1]
    expect(last.offset + last.days).toBe(61)
  })
})
