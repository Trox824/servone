import { addDays, allDaySlot, HOUR_MS, daysCovered, groupByDay, nextHourSlot, spanOf, startOfDay, startOfWeek, workingSlot } from '../time'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()

describe('day math', () => {
  it('starts the day at local midnight', () => {
    expect(startOfDay(local(2026, 9, 24, 15, 30))).toBe(local(2026, 9, 24))
  })
  it('adds calendar days', () => {
    expect(addDays(local(2026, 9, 30), 1)).toBe(local(2026, 10, 1))
  })
  it('starts the week on Monday when firstDayOfWeek is 1', () => {
    expect(startOfWeek(local(2026, 9, 24, 9), 1)).toBe(local(2026, 9, 21))
    expect(startOfWeek(local(2026, 9, 27, 9), 1)).toBe(local(2026, 9, 21))
  })
  it('starts the week on Sunday when firstDayOfWeek is 0', () => {
    expect(startOfWeek(local(2026, 9, 24), 0)).toBe(local(2026, 9, 20))
  })
})

describe('spanOf and daysCovered', () => {
  it('keeps timed events as stored', () => {
    const e = { date: local(2026, 9, 24, 9), dueDate: local(2026, 9, 24, 10), allDay: false }
    expect(spanOf(e)).toEqual({ start: e.date, end: e.dueDate })
    expect(daysCovered(e)).toEqual([local(2026, 9, 24)])
  })
  it('moves an all-day event from UTC midnight to local midnight', () => {
    const e = { date: Date.UTC(2026, 8, 24), dueDate: Date.UTC(2026, 8, 24, 23, 59, 59, 999), allDay: true }
    expect(daysCovered(e)).toEqual([local(2026, 9, 24)])
  })
  it('keeps an all-day event on its days when a DST change falls inside it', () => {
    const e = { date: Date.UTC(2026, 2, 7), dueDate: Date.UTC(2026, 2, 8, 23, 59, 59, 999), allDay: true }
    expect(daysCovered(e)).toEqual([local(2026, 3, 7), local(2026, 3, 8)])
  })
  it('lists every day of a multi-day event', () => {
    const e = { date: local(2026, 9, 24, 20), dueDate: local(2026, 9, 26, 8), allDay: false }
    expect(daysCovered(e)).toEqual([local(2026, 9, 24), local(2026, 9, 25), local(2026, 9, 26)])
  })
  it('does not spill into the next day when ending exactly at midnight', () => {
    const e = { date: local(2026, 9, 24, 22), dueDate: local(2026, 9, 25), allDay: false }
    expect(daysCovered(e)).toEqual([local(2026, 9, 24)])
  })
})

describe('groupByDay', () => {
  it('puts all-day events first, then by start time', () => {
    const late = { date: local(2026, 9, 24, 15), dueDate: local(2026, 9, 24, 16), allDay: false }
    const early = { date: local(2026, 9, 24, 8), dueDate: local(2026, 9, 24, 9), allDay: false }
    const whole = { date: Date.UTC(2026, 8, 24), dueDate: Date.UTC(2026, 8, 24, 23, 59, 59, 999), allDay: true }
    expect(groupByDay([late, early, whole]).get(local(2026, 9, 24))).toEqual([whole, early, late])
  })
})

describe('draft slots', () => {
  const at = (d: number, h: number, m = 0): number => new Date(2026, 8, d, h, m).getTime()
  it('starts at the next full hour on the given day and lasts the given duration', () => {
    expect(nextHourSlot(at(24, 0), at(20, 14, 20), HOUR_MS)).toEqual({ start: at(24, 15), end: at(24, 16) })
    expect(nextHourSlot(at(20, 9, 30), at(20, 15), 30 * 60 * 1000)).toEqual({ start: at(20, 16), end: at(20, 16, 30) })
  })
  it('spans the whole day for all-day drafts, ending like upstream at 23:59:59.999', () => {
    expect(allDaySlot(at(24, 13))).toEqual({ start: at(24, 0), end: new Date(2026, 8, 24, 23, 59, 59, 999).getTime() })
  })
})

describe('workingSlot', () => {
  const HALF_HOUR = 30 * 60 * 1000
  it('starts at the next full hour during the working day', () => {
    expect(workingSlot(local(2026, 10, 1, 10, 20), HALF_HOUR)).toEqual({ start: local(2026, 10, 1, 11), end: local(2026, 10, 1, 11, 30) })
  })
  it('keeps an evening slot on the current date', () => {
    expect(workingSlot(local(2026, 10, 1, 19, 40), HALF_HOUR).start).toBe(local(2026, 10, 1, 20))
  })
  it('caps a late-night slot at 23:00 of the current date', () => {
    expect(workingSlot(local(2026, 10, 1, 23, 30), HALF_HOUR).start).toBe(local(2026, 10, 1, 23))
  })
})
