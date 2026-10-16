import { monthCells } from '../month'

const local = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime()
const at = (d: number, h: number): { date: number, dueDate: number, allDay: boolean } =>
  ({ date: local(2026, 9, d, h), dueDate: local(2026, 9, d, h + 1), allDay: false })

describe('monthCells', () => {
  const now = local(2026, 9, 24, 10)
  const cells = monthCells(local(2026, 9, 24), [at(24, 8), at(24, 9), at(24, 10), at(24, 11), at(2, 9)], 1, now)

  it('returns six full weeks starting on the first day of week', () => {
    expect(cells).toHaveLength(42)
    expect(cells[0].day).toBe(local(2026, 8, 31))
    expect(cells[0].inMonth).toBe(false)
    expect(cells[1].inMonth).toBe(true)
  })
  it('shows three events and counts the rest', () => {
    const today = cells.find((c) => c.isToday)
    expect(today?.day).toBe(local(2026, 9, 24))
    expect(today?.shown).toHaveLength(3)
    expect(today?.more).toBe(1)
  })
  it('lists an all-day event first on its local day', () => {
    const holiday = { date: Date.UTC(2026, 8, 2), dueDate: Date.UTC(2026, 8, 2, 23, 59, 59, 999), allDay: true }
    const withHoliday = monthCells(local(2026, 9, 24), [at(2, 9), holiday], 1, now)
    expect(withHoliday.find((c) => c.day === local(2026, 9, 2))?.shown).toEqual([holiday, at(2, 9)])
    expect(withHoliday.find((c) => c.day === local(2026, 9, 1))?.shown).toEqual([])
    expect(withHoliday.find((c) => c.day === local(2026, 9, 3))?.shown).toEqual([])
  })
  it('marks weekends', () => {
    expect(cells.find((c) => c.day === local(2026, 9, 26))?.isWeekend).toBe(true)
    expect(cells.find((c) => c.day === local(2026, 9, 25))?.isWeekend).toBe(false)
  })
})
