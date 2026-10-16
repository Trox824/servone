import { defaultSchedule, isWorkingTime, parseSchedule, parseStoredSchedule, type WorkingSchedule } from '../schedule'

const at = (iso: string): number => Date.parse(iso)
const WEEKDAYS = [1, 2, 3, 4, 5]
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

function setting (servoneSchedule: unknown): { enabled: boolean, servoneSchedule: unknown } {
  return { enabled: true, servoneSchedule }
}

const office: WorkingSchedule = { days: WEEKDAYS, start: '08:00', end: '17:30', timeZone: 'Asia/Ho_Chi_Minh' }
const night: WorkingSchedule = { days: WEEKDAYS, start: '22:00', end: '06:00', timeZone: 'Asia/Ho_Chi_Minh' }

describe('parseSchedule', () => {
  const valid = { isEnabled: true, days: [5, 1, 3, 1], start: '08:00', end: '17:30', timeZone: 'Asia/Ho_Chi_Minh' }

  it('reads a valid schedule, deduping and sorting days', () => {
    expect(parseSchedule(setting(valid))).toEqual({ days: [1, 3, 5], start: '08:00', end: '17:30', timeZone: 'Asia/Ho_Chi_Minh' })
  })
  it('is off when missing or switched off, but keeps the stored times', () => {
    expect(parseSchedule(undefined)).toBeUndefined()
    expect(parseSchedule({ enabled: true })).toBeUndefined()
    expect(parseSchedule(setting({ ...valid, isEnabled: false }))).toBeUndefined()
    expect(parseStoredSchedule(setting({ ...valid, isEnabled: false }))?.start).toBe('08:00')
  })
  it.each([
    ['null', null],
    ['string', 'Mon-Fri'],
    ['no isEnabled', { ...valid, isEnabled: undefined }],
    ['isEnabled not boolean', { ...valid, isEnabled: 'yes' }],
    ['no days', { ...valid, days: [] }],
    ['day out of range', { ...valid, days: [7] }],
    ['fractional day', { ...valid, days: [1.5] }],
    ['days not array', { ...valid, days: '1,2' }],
    ['short time', { ...valid, start: '8:00' }],
    ['24:00', { ...valid, end: '24:00' }],
    ['minutes 60', { ...valid, end: '17:60' }],
    ['same start and end', { ...valid, end: '08:00' }],
    ['unknown zone', { ...valid, timeZone: 'Mars/Base' }],
    ['zone not string', { ...valid, timeZone: 7 }]
  ])('rejects %s', (_name, stored) => {
    expect(parseStoredSchedule(setting(stored))).toBeUndefined()
  })
  it('defaults to Mon-Fri 08:00-17:30 in the given zone', () => {
    expect(parseSchedule(setting(defaultSchedule('Asia/Ho_Chi_Minh')))).toEqual(office)
  })
})

describe('isWorkingTime', () => {
  // 2026-09-25 is a Friday. Ho Chi Minh City is UTC+7 all year.
  it('is inside the day range, start inclusive, end exclusive', () => {
    expect(isWorkingTime(office, at('2026-09-25T00:59Z'))).toBe(false)
    expect(isWorkingTime(office, at('2026-09-25T01:00Z'))).toBe(true)
    expect(isWorkingTime(office, at('2026-09-25T10:29Z'))).toBe(true)
    expect(isWorkingTime(office, at('2026-09-25T10:30Z'))).toBe(false)
  })
  it('is off on days not listed', () => {
    expect(isWorkingTime(office, at('2026-09-26T03:00Z'))).toBe(false)
    expect(isWorkingTime(office, at('2026-09-27T03:00Z'))).toBe(false)
  })
  it('uses the local day, not the UTC day', () => {
    // Monday 06:00 local is still Sunday in UTC.
    const early = { ...office, start: '06:00' }
    expect(isWorkingTime(early, at('2026-09-27T23:00Z'))).toBe(true)
  })
  it('handles an overnight range owned by the day it starts on', () => {
    expect(isWorkingTime(night, at('2026-09-25T16:00Z'))).toBe(true) // Fri 23:00
    expect(isWorkingTime(night, at('2026-09-25T22:00Z'))).toBe(true) // Sat 05:00
    expect(isWorkingTime(night, at('2026-09-25T23:00Z'))).toBe(false) // Sat 06:00
    expect(isWorkingTime(night, at('2026-09-26T16:00Z'))).toBe(false) // Sat 23:00
    expect(isWorkingTime(night, at('2026-09-27T22:00Z'))).toBe(false) // Mon 05:00, Sunday not listed
    expect(isWorkingTime(night, at('2026-09-28T15:30Z'))).toBe(true) // Mon 22:30
  })
  it('reads the same instant differently per zone', () => {
    const saoPaulo = { ...office, start: '09:00', end: '18:00', timeZone: 'America/Sao_Paulo' }
    // 12:00Z is 09:00 in Sao Paulo (UTC-3) and 19:00 in Ho Chi Minh City.
    expect(isWorkingTime(saoPaulo, at('2026-09-25T12:00Z'))).toBe(true)
    expect(isWorkingTime(saoPaulo, at('2026-09-25T11:59Z'))).toBe(false)
    expect(isWorkingTime(office, at('2026-09-25T12:00Z'))).toBe(false)
  })
})

describe('isWorkingTime across a DST gap', () => {
  it('starts a range whose start falls in the gap at the jump', () => {
    // New York skips 02:00-03:00 on 2026-03-08 (07:00Z).
    const gap = { days: EVERY_DAY, start: '02:30', end: '09:00', timeZone: 'America/New_York' }
    expect(isWorkingTime(gap, at('2026-03-08T06:59Z'))).toBe(false)
    expect(isWorkingTime(gap, at('2026-03-08T07:00Z'))).toBe(true)
  })
})
