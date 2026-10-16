import { formatRemindTime, isMorningToday, isValidRemindAt, remindAt } from '../remind-time'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()
const now = local(2026, 9, 25, 14, 10)

describe('remindAt', () => {
  it('adds fixed durations', () => {
    expect(remindAt('in20m', now)).toBe(local(2026, 9, 25, 14, 30))
    expect(remindAt('in1h', now)).toBe(local(2026, 9, 25, 15, 10))
  })
  it('lands on 09:00 local the next day during the day', () => {
    expect(remindAt('morning', now)).toBe(local(2026, 9, 26, 9))
    expect(remindAt('morning', local(2026, 9, 25, 6))).toBe(local(2026, 9, 26, 9))
  })
  it('crosses month and year ends', () => {
    expect(remindAt('morning', local(2026, 9, 30, 21))).toBe(local(2026, 10, 1, 9))
    expect(remindAt('morning', local(2026, 12, 31, 23, 59))).toBe(local(2027, 1, 1, 9))
  })
  it('means this morning before 06:00', () => {
    expect(remindAt('morning', local(2026, 9, 26, 0, 30))).toBe(local(2026, 9, 26, 9))
    expect(remindAt('morning', local(2026, 9, 26, 5, 59))).toBe(local(2026, 9, 26, 9))
  })
})

describe('isMorningToday', () => {
  it('switches at 06:00', () => {
    expect(isMorningToday(local(2026, 9, 26, 5, 59))).toBe(true)
    expect(isMorningToday(local(2026, 9, 26, 6))).toBe(false)
  })
})

describe('isValidRemindAt', () => {
  it('accepts only future finite times', () => {
    expect(isValidRemindAt(now + 1, now)).toBe(true)
    expect(isValidRemindAt(now, now)).toBe(false)
    expect(isValidRemindAt(Number.NaN, now)).toBe(false)
  })
})

describe('formatRemindTime', () => {
  it('shows only the time on the same day', () => {
    expect(formatRemindTime(local(2026, 9, 25, 15, 5), now, 'en-GB')).toBe('15:05')
  })
  it('adds the date on another day', () => {
    expect(formatRemindTime(local(2026, 9, 26, 9), now, 'en-GB')).toContain('26')
  })
})
