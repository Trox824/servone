import { atMinutes, daySlots, durationText, hm, minutesOfDay } from '../time-slots'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()

describe('time slots', () => {
  it('lists 96 quarter-hour slots', () => {
    const slots = daySlots(9 * 60)
    expect(slots).toHaveLength(96)
    expect(slots[0]).toBe(0)
    expect(slots[95]).toBe(23 * 60 + 45)
  })
  it('keeps an off-grid time in order', () => {
    const slots = daySlots(9 * 60 + 20)
    expect(slots).toHaveLength(97)
    expect(slots.slice(36, 40)).toEqual([540, 555, 560, 570])
  })
  it('converts between timestamps and minutes of the day', () => {
    const day = local(2026, 9, 24)
    expect(minutesOfDay(local(2026, 9, 24, 15, 30))).toBe(930)
    expect(atMinutes(day, 930)).toBe(local(2026, 9, 24, 15, 30))
  })
  it('formats hours and minutes', () => {
    expect(hm(0)).toBe('00:00')
    expect(hm(9 * 60 + 5)).toBe('09:05')
  })
})

describe('durationText', () => {
  const MIN = 60 * 1000
  it('names minutes, hours and days', () => {
    expect(durationText(45 * MIN, 'en')).toBe('45 min')
    expect(durationText(60 * MIN, 'en')).toBe('1 h')
    expect(durationText(90 * MIN, 'vi')).toBe('1 giờ 30 phút')
    expect(durationText(26 * 60 * MIN, 'vi')).toBe('1 ngày 2 giờ')
  })
  it('shows zero as minutes', () => {
    expect(durationText(0, 'en')).toBe('0 min')
  })
})
