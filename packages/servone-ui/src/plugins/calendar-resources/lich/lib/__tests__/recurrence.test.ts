import { recurrenceText, seriesEndBefore } from '../recurrence'

describe('recurrenceText', () => {
  it('is empty without rules', () => {
    expect(recurrenceText([], 'vi')).toBe('')
  })
  it('names daily, weekly, monthly, yearly', () => {
    expect(recurrenceText([{ freq: 'DAILY' }], 'vi')).toBe('Hàng ngày')
    expect(recurrenceText([{ freq: 'MONTHLY' }], 'en')).toBe('Monthly')
    expect(recurrenceText([{ freq: 'YEARLY' }], 'vi')).toBe('Hàng năm')
  })
  it('lists weekdays for weekly rules', () => {
    expect(recurrenceText([{ freq: 'WEEKLY', byDay: ['MO', 'WE'] }], 'vi')).toBe('Hàng tuần vào T2, T4')
    expect(recurrenceText([{ freq: 'WEEKLY', byDay: ['MO', 'WE'] }], 'en')).toBe('Weekly on Mon, Wed')
  })
  it('handles intervals', () => {
    expect(recurrenceText([{ freq: 'WEEKLY', interval: 2 }], 'vi')).toBe('Mỗi 2 tuần')
    expect(recurrenceText([{ freq: 'DAILY', interval: 3 }], 'en')).toBe('Every 3 days')
  })
  it('adds the end rule', () => {
    expect(recurrenceText([{ freq: 'DAILY', count: 10 }], 'vi')).toBe('Hàng ngày · 10 lần')
    expect(recurrenceText([{ freq: 'DAILY', count: 10 }], 'en')).toBe('Daily · 10 times')
    const end = new Date(2026, 11, 31).getTime()
    expect(recurrenceText([{ freq: 'DAILY', endDate: end }], 'vi')).toBe('Hàng ngày · đến 31/12/2026')
    expect(recurrenceText([{ freq: 'DAILY', endDate: end }], 'en')).toBe('Daily · until Dec 31, 2026')
  })
  it('falls back for frequencies the dialog never creates', () => {
    expect(recurrenceText([{ freq: 'HOURLY' }], 'vi')).toBe('Lặp lại')
    expect(recurrenceText([{ freq: 'HOURLY' }], 'en')).toBe('Repeats')
  })
})

describe('seriesEndBefore', () => {
  it('ends a daily series on the day before the cut, so the label names it', () => {
    const lastKept = new Date(2026, 8, 29, 10).getTime()
    const cut = new Date(2026, 8, 30, 10).getTime()
    const end = seriesEndBefore(lastKept, cut)
    expect(end).toBe(new Date(2026, 8, 29, 23, 59, 59, 999).getTime())
    expect(recurrenceText([{ freq: 'DAILY', endDate: end }], 'en')).toBe('Daily · until Sep 29, 2026')
  })
  it('names the last kept week, not the day before the cut', () => {
    const end = seriesEndBefore(new Date(2026, 8, 23, 9).getTime(), new Date(2026, 8, 30, 9).getTime())
    expect(recurrenceText([{ freq: 'WEEKLY', endDate: end }], 'vi')).toBe('Hàng tuần · đến 23/09/2026')
  })
  it('stays before the cut when both fall on one day', () => {
    const cut = new Date(2026, 8, 29, 15).getTime()
    expect(seriesEndBefore(new Date(2026, 8, 29, 9).getTime(), cut)).toBe(cut - 1)
  })
})
