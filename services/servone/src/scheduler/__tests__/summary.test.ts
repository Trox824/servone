import { planSummary, summaryBody, SUMMARY_LOOKBACK_MS } from '../summary'
import type { UserPrefs } from '../settings'
import { ict, officeHours } from './fixtures'

function prefs (overrides: Partial<UserPrefs> = {}): UserPrefs {
  return { schedule: officeHours, locale: 'en', ...overrides }
}

describe('planSummary', () => {
  it('does nothing without working hours', () => {
    expect(planSummary(prefs({ schedule: undefined }), ict(0, 20), undefined)).toEqual({ kind: 'wait' })
  })

  it('holds when off hours begin', () => {
    expect(planSummary(prefs(), ict(0, 17, 30), undefined)).toEqual({ kind: 'hold' })
  })

  it('keeps an open hold through the night and the weekend', () => {
    const held = prefs({ heldSince: ict(-3, 17, 30) })
    expect(planSummary(held, ict(0, 7, 59), undefined)).toEqual({ kind: 'wait' })
  })

  it('opens a new hold once the last one was summarised', () => {
    const summarised = prefs({ heldSince: ict(-1, 17, 30), summarySentAt: ict(0, 8) })
    expect(planSummary(summarised, ict(0, 17, 31), undefined)).toEqual({ kind: 'hold' })
  })

  it('sends at the start of the day, counting from when off hours began', () => {
    const held = prefs({ heldSince: ict(-3, 17, 30) })
    expect(planSummary(held, ict(0, 8), undefined)).toEqual({ kind: 'send', since: ict(-3, 17, 30) })
  })

  it('sends only once per morning', () => {
    const sent = prefs({ heldSince: ict(-3, 17, 30), summarySentAt: ict(0, 8) })
    expect(planSummary(sent, ict(0, 8, 1), undefined)).toEqual({ kind: 'wait' })
  })

  it('waits for a pause to end, then sends', () => {
    const held = prefs({ heldSince: ict(-1, 17, 30) })
    expect(planSummary(held, ict(0, 8), ict(0, 9))).toEqual({ kind: 'wait' })
    expect(planSummary(held, ict(0, 9), ict(0, 9))).toEqual({ kind: 'send', since: ict(-1, 17, 30) })
  })

  it('never sends when the service first sees the user during working hours', () => {
    expect(planSummary(prefs(), ict(0, 10), undefined)).toEqual({ kind: 'wait' })
  })

  it('covers at most the last week after a long leave', () => {
    const now = ict(0, 8)
    const held = prefs({ heldSince: now - 30 * 24 * 60 * 60_000 })
    expect(planSummary(held, now, undefined)).toEqual({ kind: 'send', since: now - SUMMARY_LOOKBACK_MS })
  })
})

describe('summaryBody', () => {
  it('writes English with plurals', () => {
    expect(summaryBody({ mentions: 1, directs: 3 }, 'en')).toBe('While you were away: 1 mention, 3 direct messages')
    expect(summaryBody({ mentions: 2, directs: 1 }, 'en')).toBe('While you were away: 2 mentions, 1 direct message')
  })

  it('writes Vietnamese', () => {
    expect(summaryBody({ mentions: 2, directs: 5 }, 'vi')).toBe('Trong lúc bạn vắng mặt: 2 lượt nhắc, 5 tin nhắn riêng')
  })
})
