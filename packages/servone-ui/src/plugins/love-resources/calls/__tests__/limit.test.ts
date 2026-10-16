import { formatRemaining, isEnding, remainingMs } from '../limit'

describe('call limit clock', () => {
  it('counts down from connect and stops at zero', () => {
    expect(remainingMs(1000, 1000, 10)).toBe(600000)
    expect(remainingMs(1000, 999999999, 10)).toBe(0)
  })

  it('formats minutes and padded seconds', () => {
    expect(formatRemaining(600000)).toBe('10:00')
    expect(formatRemaining(61000)).toBe('1:01')
    expect(formatRemaining(0)).toBe('0:00')
  })

  it('flags the last two minutes', () => {
    expect(isEnding(120000)).toBe(true)
    expect(isEnding(120001)).toBe(false)
  })
})
