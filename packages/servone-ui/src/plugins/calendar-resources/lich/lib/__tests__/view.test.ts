import { isView, parsePage, rangeOf, shift } from '../view'

const local = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime()
const thu = local(2026, 9, 24, 15)

describe('parsePage', () => {
  it('accepts known pages', () => {
    expect(parsePage('thang', 'ngay')).toBe('thang')
    expect(parsePage('chia-se', 'ngay')).toBe('chia-se')
    expect(parsePage('tim-kiem', 'tuan')).toBe('tim-kiem')
    expect(parsePage('tai-nguyen', 'tuan')).toBe('tai-nguyen')
  })
  it('falls back for missing or unknown segments', () => {
    expect(parsePage(undefined, 'tuan')).toBe('tuan')
    expect(parsePage('planner', 'ngay')).toBe('ngay')
  })
  it('isView rejects non-view pages', () => {
    expect(isView('chia-se')).toBe(false)
    expect(isView('lich-bieu')).toBe(true)
  })
})

describe('rangeOf', () => {
  it('covers one day', () => {
    expect(rangeOf('ngay', thu, 1)).toEqual({ start: local(2026, 9, 24), end: local(2026, 9, 25) })
  })
  it('covers the week from its first day', () => {
    expect(rangeOf('tuan', thu, 1)).toEqual({ start: local(2026, 9, 21), end: local(2026, 9, 28) })
  })
  it('covers six weeks from the week holding the 1st', () => {
    expect(rangeOf('thang', thu, 1)).toEqual({ start: local(2026, 8, 31), end: local(2026, 10, 12) })
  })
  it('covers the agenda window from the anchor day', () => {
    expect(rangeOf('lich-bieu', thu, 1)).toEqual({ start: local(2026, 9, 24), end: local(2026, 10, 24) })
    expect(rangeOf('lich-bieu', thu, 1, 60).end).toBe(local(2026, 11, 23))
  })
})

describe('shift', () => {
  it('moves by the view unit', () => {
    expect(shift('ngay', thu, 1)).toBe(local(2026, 9, 25, 15))
    expect(shift('tuan', thu, -1)).toBe(local(2026, 9, 17, 15))
    expect(shift('thang', local(2026, 1, 31), 1)).toBe(local(2026, 2, 1))
    expect(shift('lich-bieu', thu, 1)).toBe(local(2026, 10, 24, 15))
  })
})
