import { dateShort, dateWithWeekday, dayHeading, timeRange, titleOf, whenText } from '../format'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()
const thu = local(2026, 9, 24, 15)

describe('dateWithWeekday', () => {
  it('labels the date picker', () => {
    expect(dateWithWeekday(thu, 'vi')).toBe('T5, 24/09/2026')
    expect(dateWithWeekday(thu, 'en')).toBe('Thu, 24 Sep 2026')
  })
})

describe('titleOf', () => {
  it('names the day', () => {
    expect(titleOf('ngay', thu, 1, 'vi')).toBe('Thứ Năm, 24/09/2026')
    expect(titleOf('ngay', thu, 1, 'en')).toBe('Thursday, Sep 24, 2026')
  })
  it('names the week, within one month and across two', () => {
    expect(titleOf('tuan', thu, 1, 'vi')).toBe('21 – 27/09/2026')
    expect(titleOf('tuan', thu, 1, 'en')).toBe('Sep 21 – 27, 2026')
    expect(titleOf('tuan', local(2026, 10, 1), 1, 'vi')).toBe('28/09 – 04/10/2026')
    expect(titleOf('tuan', local(2026, 10, 1), 1, 'en')).toBe('Sep 28 – Oct 4, 2026')
  })
  it('names the month', () => {
    expect(titleOf('thang', thu, 1, 'vi')).toBe('Tháng 9, 2026')
    expect(titleOf('thang', thu, 1, 'en')).toBe('September 2026')
  })
  it('names the agenda start', () => {
    expect(titleOf('lich-bieu', thu, 1, 'vi')).toBe('Từ 24/09/2026')
    expect(titleOf('lich-bieu', thu, 1, 'en')).toBe('From Sep 24, 2026')
  })
})

describe('labels', () => {
  it('heads an agenda day', () => {
    expect(dayHeading(local(2026, 9, 24), 'vi')).toBe('T5, 24/09')
    expect(dayHeading(local(2026, 9, 27), 'en')).toBe('Sun, Sep 27')
  })
  it('prints a time range or all-day', () => {
    expect(timeRange({ date: local(2026, 9, 24, 9), dueDate: local(2026, 9, 24, 10, 30), allDay: false }, 'vi')).toBe('09:00–10:30')
    expect(timeRange({ date: Date.UTC(2026, 8, 24), dueDate: Date.UTC(2026, 8, 24, 23, 59), allDay: true }, 'vi')).toBe('Cả ngày')
    expect(timeRange({ date: Date.UTC(2026, 8, 24), dueDate: Date.UTC(2026, 8, 24, 23, 59), allDay: true }, 'en')).toBe('All day')
  })
  it('prints a short date', () => {
    expect(dateShort(local(2026, 12, 31), 'vi')).toBe('31/12/2026')
    expect(dateShort(local(2026, 12, 31), 'en')).toBe('Dec 31, 2026')
  })
})

describe('whenText', () => {
  const at = (d: number, h: number, m = 0): number => new Date(2026, 8, d, h, m).getTime()
  it('writes a timed slot like Google quick create', () => {
    expect(whenText({ start: at(24, 15), end: at(24, 16) }, false, 'vi')).toBe('Thứ Năm, 24 tháng 9 · 15:00 – 16:00')
    expect(whenText({ start: at(24, 15), end: at(24, 16) }, false, 'en')).toBe('Thursday, September 24 · 3:00 – 4:00pm')
  })
  it('repeats the meridiem only when it changes', () => {
    expect(whenText({ start: at(24, 11, 30), end: at(24, 12, 15) }, false, 'en')).toBe('Thursday, September 24 · 11:30am – 12:15pm')
    expect(whenText({ start: at(24, 0), end: at(24, 1) }, false, 'en')).toBe('Thursday, September 24 · 12:00 – 1:00am')
  })
  it('keeps a slot ending at midnight on one day', () => {
    expect(whenText({ start: at(24, 23), end: at(25, 0) }, false, 'vi')).toBe('Thứ Năm, 24 tháng 9 · 23:00 – 00:00')
  })
  it('names both days when a timed slot crosses days', () => {
    expect(whenText({ start: at(24, 22), end: at(25, 2) }, false, 'vi')).toBe('Thứ Năm, 24 tháng 9, 22:00 – Thứ Sáu, 25 tháng 9, 02:00')
    expect(whenText({ start: at(24, 22), end: at(25, 2) }, false, 'en')).toBe('Thursday, September 24, 10:00pm – Friday, September 25, 2:00am')
  })
  it('shows only dates for all-day slots', () => {
    const endOf = (d: number): number => new Date(2026, 8, d, 23, 59, 59, 999).getTime()
    expect(whenText({ start: at(24, 0), end: endOf(24) }, true, 'vi')).toBe('Thứ Năm, 24 tháng 9')
    expect(whenText({ start: at(24, 0), end: endOf(25) }, true, 'en')).toBe('Thursday, September 24 – Friday, September 25')
  })
})
