import { isValidCustomUntil, presetUntil, readPause } from '../pause'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()
const now = local(2026, 9, 25, 14, 10)

describe('presetUntil', () => {
  it('adds fixed durations', () => {
    expect(presetUntil('for30m', now)).toBe(local(2026, 9, 25, 14, 40))
    expect(presetUntil('for1h', now)).toBe(local(2026, 9, 25, 15, 10))
    expect(presetUntil('for2h', now)).toBe(local(2026, 9, 25, 16, 10))
  })
  it('lands on 08:00 local the next day', () => {
    expect(presetUntil('untilTomorrow', now)).toBe(local(2026, 9, 26, 8))
  })
  it('crosses midnight and month and year ends', () => {
    expect(presetUntil('untilTomorrow', local(2026, 9, 25, 23, 50))).toBe(local(2026, 9, 26, 8))
    expect(presetUntil('untilTomorrow', local(2026, 9, 30, 21))).toBe(local(2026, 10, 1, 8))
    expect(presetUntil('untilTomorrow', local(2026, 12, 31, 23, 59))).toBe(local(2027, 1, 1, 8))
  })
  it('after midnight means the next calendar day, not this morning', () => {
    expect(presetUntil('untilTomorrow', local(2026, 9, 26, 0, 30))).toBe(local(2026, 9, 27, 8))
  })
})

describe('readPause', () => {
  it('reads a stored until', () => {
    expect(readPause({ message: '', servonePausedUntil: now })).toEqual({ until: now })
  })
  it('ignores a missing, non-numeric or non-finite until', () => {
    expect(readPause(undefined)).toBeUndefined()
    expect(readPause({ message: 'x' })).toBeUndefined()
    expect(readPause({ message: '', servonePausedUntil: String(now) })).toBeUndefined()
    expect(readPause({ message: '', servonePausedUntil: Number.NaN })).toBeUndefined()
    expect(readPause({ message: '', servonePausedUntil: Infinity })).toBeUndefined()
    expect(readPause({ message: '', servonePausedUntil: -5 })).toBeUndefined()
    expect(readPause({ message: '', servonePausedUntil: null })).toBeUndefined()
  })
})

describe('isValidCustomUntil', () => {
  it('rejects the past and now', () => {
    expect(isValidCustomUntil(now - 1, now)).toBe(false)
    expect(isValidCustomUntil(now, now)).toBe(false)
    expect(isValidCustomUntil(Number.NaN, now)).toBe(false)
    expect(isValidCustomUntil(now + 60_000, now)).toBe(true)
  })
})
