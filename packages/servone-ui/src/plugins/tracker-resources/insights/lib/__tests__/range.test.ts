import { rangeBounds } from '../range'

const at = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime()

describe('rangeBounds', () => {
  it('starts this week on Monday, also when today is Sunday', () => {
    expect(rangeBounds({ preset: 'thisWeek' }, at(2026, 9, 27, 15))).toEqual({ from: at(2026, 9, 21), to: at(2026, 9, 28) })
    expect(rangeBounds({ preset: 'thisWeek' }, at(2026, 9, 21, 9))).toEqual({ from: at(2026, 9, 21), to: at(2026, 9, 22) })
  })

  it('covers this week and the one before for last 2 weeks', () => {
    expect(rangeBounds({ preset: 'last2Weeks' }, at(2026, 9, 23, 9))).toEqual({ from: at(2026, 9, 14), to: at(2026, 9, 24) })
  })

  it('starts this month on the 1st, across a year edge', () => {
    expect(rangeBounds({ preset: 'thisMonth' }, at(2026, 10, 1, 8))).toEqual({ from: at(2026, 10, 1), to: at(2026, 10, 2) })
    expect(rangeBounds({ preset: 'thisMonth' }, at(2027, 1, 31, 23))).toEqual({ from: at(2027, 1, 1), to: at(2027, 2, 1) })
  })

  it('includes today in the last 30 days', () => {
    expect(rangeBounds({ preset: 'last30Days' }, at(2026, 9, 27, 15))).toEqual({ from: at(2026, 8, 29), to: at(2026, 9, 28) })
  })

  it('keeps a custom range as given, end exclusive', () => {
    expect(rangeBounds({ preset: 'custom', from: at(2026, 9, 1), to: at(2026, 9, 11) }, at(2026, 9, 27))).toEqual({
      from: at(2026, 9, 1),
      to: at(2026, 9, 11)
    })
  })
})
