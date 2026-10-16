import { customFrom, customRule, presetLabel, presetOf, presetRules } from '../repeat'

const thu = new Date(2026, 8, 24, 15).getTime()
const endOfDay = new Date(2026, 8, 24, 23, 59, 59, 999).getTime()

describe('presetRules', () => {
  it('builds rules from the start date', () => {
    expect(presetRules('none', thu)).toEqual([])
    expect(presetRules('daily', thu)).toEqual([{ freq: 'DAILY', interval: 1 }])
    expect(presetRules('weekly', thu)).toEqual([{ freq: 'WEEKLY', interval: 1, byDay: ['TH'] }])
    expect(presetRules('weekdays', thu)).toEqual([{ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }])
    expect(presetRules('monthly', thu)).toEqual([{ freq: 'MONTHLY', interval: 1, byMonthDay: [24] }])
    expect(presetRules('yearly', thu)).toEqual([{ freq: 'YEARLY', interval: 1, byMonth: [8] }])
  })
})

describe('presetOf', () => {
  it('recognises each preset', () => {
    expect(presetOf([], thu)).toBe('none')
    expect(presetOf([{ freq: 'WEEKLY', byDay: ['TH'] }], thu)).toBe('weekly')
    expect(presetOf([{ freq: 'WEEKLY', interval: 1, byDay: ['FR', 'MO', 'TU', 'WE', 'TH'] }], thu)).toBe('weekdays')
    expect(presetOf([{ freq: 'MONTHLY', interval: 1, byMonthDay: [24] }], thu)).toBe('monthly')
  })
  it('falls back to custom', () => {
    expect(presetOf([{ freq: 'WEEKLY', interval: 2, byDay: ['TH'] }], thu)).toBe('custom')
    expect(presetOf([{ freq: 'DAILY', interval: 1, count: 5 }], thu)).toBe('custom')
    expect(presetOf([{ freq: 'WEEKLY', interval: 1, byDay: ['MO'] }], thu)).toBe('custom')
  })
})

describe('presetLabel', () => {
  it('names the weekday and day of month', () => {
    expect(presetLabel('weekly', thu, 'vi')).toBe('Hàng tuần vào Thứ Năm')
    expect(presetLabel('weekly', thu, 'en')).toBe('Weekly on Thursday')
    expect(presetLabel('monthly', thu, 'vi')).toBe('Hàng tháng vào ngày 24')
    expect(presetLabel('yearly', thu, 'en')).toBe('Annually on September 24')
  })
})

describe('custom repeat', () => {
  it('starts from the stored rule', () => {
    const form = customFrom({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], count: 6 }, thu, endOfDay)
    expect(form).toEqual({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], end: 'after', endDate: endOfDay, count: 6 })
  })
  it('defaults to weekly on the start weekday', () => {
    expect(customFrom(undefined, thu, endOfDay)).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['TH'], end: 'never', endDate: endOfDay, count: 10 })
  })
  it('writes the end rule and weekdays', () => {
    const form = { freq: 'WEEKLY' as const, interval: 2, byDay: ['MO'], end: 'on' as const, endDate: endOfDay, count: 3 }
    expect(customRule(form, undefined, thu)).toEqual({ freq: 'WEEKLY', interval: 2, byDay: ['MO'], endDate: endOfDay })
    expect(customRule({ ...form, end: 'after' }, undefined, thu)).toEqual({ freq: 'WEEKLY', interval: 2, byDay: ['MO'], count: 3 })
  })
  it('keeps a "second Tuesday" month rule while the frequency is unchanged', () => {
    const base = { freq: 'MONTHLY', bySetPos: [2], byDay: ['TU'] }
    const form = { freq: 'MONTHLY' as const, interval: 1, byDay: [], end: 'never' as const, endDate: endOfDay, count: 1 }
    expect(customRule(form, base, thu)).toEqual({ freq: 'MONTHLY', interval: 1, bySetPos: [2], byDay: ['TU'] })
    expect(customRule(form, undefined, thu)).toEqual({ freq: 'MONTHLY', interval: 1, byMonthDay: [24] })
  })
})
