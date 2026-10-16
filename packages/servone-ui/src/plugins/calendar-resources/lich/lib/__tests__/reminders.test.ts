import { DEFAULT_TIMED_REMINDER, MAX_REMINDERS, NO_REMINDER, canAddReminder, defaultReminders } from '../reminders'

const MIN = 60 * 1000

describe('defaultReminders', () => {
  it('falls back to 10 minutes for timed and none for all-day', () => {
    expect(DEFAULT_TIMED_REMINDER).toBe(10 * MIN)
    expect(defaultReminders(undefined, false)).toEqual([10 * MIN])
    expect(defaultReminders({ _id: 'cal' }, true)).toEqual([])
  })
  it('uses the calendar defaults', () => {
    const cal = { _id: 'cal', servoneDefaultReminder: 30 * MIN, servoneDefaultAllDayReminder: 12 * 60 * MIN }
    expect(defaultReminders(cal, false)).toEqual([30 * MIN])
    expect(defaultReminders(cal, true)).toEqual([12 * 60 * MIN])
  })
  it('reads the stored "no reminder" value as none', () => {
    expect(defaultReminders({ _id: 'cal', servoneDefaultReminder: NO_REMINDER }, false)).toEqual([])
  })
})

describe('canAddReminder', () => {
  it('stops at five', () => {
    expect(MAX_REMINDERS).toBe(5)
    expect(canAddReminder([1, 2, 3, 4])).toBe(true)
    expect(canAddReminder([1, 2, 3, 4, 5])).toBe(false)
  })
})
