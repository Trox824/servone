import { isPushOn, parseLocalDateTime, toLocalDateTime } from '../pause-time'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()

describe('isPushOn', () => {
  it('uses the provider default when the user has no setting', () => {
    expect(isPushOn([], true)).toBe(true)
    expect(isPushOn([], false)).toBe(false)
  })
  it('is off only when every setting is off', () => {
    expect(isPushOn([{ enabled: false }], true)).toBe(false)
    expect(isPushOn([{ enabled: false }, { enabled: true }], true)).toBe(true)
  })
})

describe('datetime-local', () => {
  it('round-trips a datetime-local value in local time', () => {
    expect(toLocalDateTime(local(2026, 1, 5, 7, 3))).toBe('2026-01-05T07:03')
    expect(parseLocalDateTime('2026-01-05T07:03')).toBe(local(2026, 1, 5, 7, 3))
  })
  it('rejects malformed or impossible values', () => {
    expect(parseLocalDateTime('')).toBeUndefined()
    expect(parseLocalDateTime('2026-02-30T10:00')).toBeUndefined()
    expect(parseLocalDateTime('tomorrow')).toBeUndefined()
  })
})
