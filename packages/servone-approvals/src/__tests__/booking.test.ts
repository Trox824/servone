import {
  BOOKING_WINDOW_DAYS,
  bookingIntervals,
  bookingWindow,
  busyIntervals,
  findClashes,
  holdsSlot,
  initialBookingState,
  isShrink,
  isSupportedRule,
  overlaps,
  suggestSlots,
  type BookingEvent
} from '../booking'

const TZ = 'Asia/Ho_Chi_Minh'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ROOM = 'room-big'
// Wall-clock time in Hanoi (UTC+7, no DST).
const hanoi = (day: number, hour: number, minute = 0): number => Date.UTC(2026, 9, day, hour - 7, minute)

function booking (fields: Partial<BookingEvent> & Pick<BookingEvent, '_id' | 'date' | 'dueDate'>): BookingEvent {
  return {
    eventId: fields._id,
    allDay: false,
    access: 'owner',
    timeZone: TZ,
    servoneResource: ROOM,
    servoneBookingState: 'confirmed',
    ...fields
  }
}

const window = { start: hanoi(1, 0), end: hanoi(1, 0) + BOOKING_WINDOW_DAYS * DAY }

describe('booking states', () => {
  it('holds the slot only while pending or confirmed', () => {
    expect(['pending', 'confirmed'].map(holdsSlot)).toEqual([true, true])
    expect(['rejected', 'expired', 'cancelled', undefined].map(holdsSlot)).toEqual([false, false, false, false])
  })

  it('starts pending only when the resource needs approval', () => {
    expect(initialBookingState({ needsApproval: true })).toBe('pending')
    expect(initialBookingState({ needsApproval: false })).toBe('confirmed')
  })
})

describe('overlaps', () => {
  it('treats intervals as half-open, so back-to-back bookings do not clash', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false)
    expect(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true)
    expect(overlaps({ start: 12, end: 13 }, { start: 10, end: 20 })).toBe(true)
  })
})

describe('isSupportedRule', () => {
  const START = hanoi(5, 9)
  const HANOI = 'Asia/Ho_Chi_Minh'

  it('accepts the month day and month the repeat picker copies from the start', () => {
    expect(isSupportedRule([{ freq: 'MONTHLY', interval: 1, byMonthDay: [5] }], START, HANOI)).toBe(true)
    expect(isSupportedRule([{ freq: 'YEARLY', interval: 1, byMonth: [9] }], START, HANOI)).toBe(true)
    // 06:30 Hanoi on the 5th is still the 4th in UTC.
    expect(isSupportedRule([{ freq: 'MONTHLY', byMonthDay: [5] }], hanoi(5, 6, 30), HANOI)).toBe(true)
  })

  it('refuses a month day or month that differs from the start', () => {
    expect(isSupportedRule([{ freq: 'MONTHLY', byMonthDay: [6] }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'MONTHLY', byMonthDay: [5, 20] }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'YEARLY', byMonth: [10] }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'WEEKLY', byMonthDay: [5] }], START, HANOI)).toBe(false)
  })

  it('accepts no rule and the rules Lịch writes', () => {
    expect(isSupportedRule(undefined, START, HANOI)).toBe(true)
    expect(isSupportedRule([], START, HANOI)).toBe(true)
    expect(isSupportedRule([{ freq: 'DAILY', count: 5 }], START, HANOI)).toBe(true)
    expect(isSupportedRule([{ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], endDate: hanoi(30, 0) }], START, HANOI)).toBe(true)
    expect(isSupportedRule([{ freq: 'MONTHLY' }, ], START, HANOI)).toBe(true)
  })

  it('refuses rules it cannot expand exactly', () => {
    expect(isSupportedRule([{ freq: 'HOURLY' }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'MONTHLY', bySetPos: [1] }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'MONTHLY', byDay: ['1MO'] }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'WEEKLY', byDay: [] }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'DAILY', interval: 0 }], START, HANOI)).toBe(false)
    expect(isSupportedRule([{ freq: 'DAILY' }, { freq: 'WEEKLY' }], START, HANOI)).toBe(false)
  })
})

describe('bookingIntervals', () => {
  it('returns a single booking as is', () => {
    const one = booking({ _id: 'a', date: hanoi(5, 9), dueDate: hanoi(5, 10) })
    expect(bookingIntervals([one], ROOM, window)).toEqual([{ _id: 'a', start: hanoi(5, 9), end: hanoi(5, 10) }])
  })

  it('skips other resources, guest copies, cancelled instances and states that free the slot', () => {
    const events = [
      booking({ _id: 'other', date: hanoi(5, 9), dueDate: hanoi(5, 10), servoneResource: 'car' }),
      booking({ _id: 'copy', date: hanoi(5, 9), dueDate: hanoi(5, 10), access: 'reader' }),
      booking({ _id: 'rejected', date: hanoi(5, 9), dueDate: hanoi(5, 10), servoneBookingState: 'rejected' }),
      booking({ _id: 'gone', date: hanoi(5, 9), dueDate: hanoi(5, 10), isCancelled: true })
    ]
    expect(bookingIntervals(events, ROOM, window)).toEqual([])
  })

  it('expands a weekly rule on the wall clock of its time zone', () => {
    // 06:30 Monday in Hanoi is still Sunday in UTC; the rule must stay on Mondays.
    const series = booking({ _id: 's', date: hanoi(5, 6, 30), dueDate: hanoi(5, 7, 30), rules: [{ freq: 'WEEKLY', byDay: ['MO'], count: 3 }] })
    expect(bookingIntervals([series], ROOM, window).map((it) => it.start)).toEqual([
      hanoi(5, 6, 30),
      hanoi(12, 6, 30),
      hanoi(19, 6, 30)
    ])
  })

  it('expands several weekdays within each period', () => {
    // Thursday 1 Oct 2026, every Mon and Thu until 8 Oct.
    const series = booking({ _id: 's', date: hanoi(1, 9), dueDate: hanoi(1, 10), rules: [{ freq: 'WEEKLY', byDay: ['MO', 'TH'], endDate: hanoi(8, 23) }] })
    expect(bookingIntervals([series], ROOM, window).map((it) => it.start)).toEqual([hanoi(1, 9), hanoi(5, 9), hanoi(8, 9)])
  })

  it('stops a daily rule at the window end and honours interval, exdate and rdate', () => {
    const series = booking({
      _id: 's',
      date: hanoi(1, 9),
      dueDate: hanoi(1, 10),
      rules: [{ freq: 'DAILY', interval: 2 }],
      exdate: [hanoi(3, 9)],
      rdate: [hanoi(4, 15)]
    })
    const short = { start: window.start, end: hanoi(8, 0) }
    expect(bookingIntervals([series], ROOM, short).map((it) => it.start)).toEqual([hanoi(1, 9), hanoi(4, 15), hanoi(5, 9), hanoi(7, 9)])
  })

  it('skips months without the start day', () => {
    const series = booking({ _id: 's', date: Date.UTC(2026, 0, 31, 2), dueDate: Date.UTC(2026, 0, 31, 3), rules: [{ freq: 'MONTHLY', count: 3 }] })
    const year = { start: Date.UTC(2026, 0, 1), end: Date.UTC(2027, 0, 1) }
    expect(bookingIntervals([series], ROOM, year).map((it) => it.start)).toEqual([
      Date.UTC(2026, 0, 31, 2),
      Date.UTC(2026, 2, 31, 2),
      Date.UTC(2026, 4, 31, 2)
    ])
  })

  it('lets an instance replace its occurrence, moved or cancelled', () => {
    const series = booking({ _id: 's', eventId: 'series', date: hanoi(1, 9), dueDate: hanoi(1, 10), rules: [{ freq: 'DAILY', count: 3 }] })
    const moved = booking({ _id: 'm', eventId: 'm', recurringEventId: 'series', originalStartTime: hanoi(2, 9), date: hanoi(2, 14), dueDate: hanoi(2, 15) })
    // Lịch writes a cancelled occurrence without the booking fields.
    const cancelled: BookingEvent = { _id: 'c', eventId: 'c', recurringEventId: 'series', originalStartTime: hanoi(3, 9), date: hanoi(3, 9), dueDate: hanoi(3, 10), allDay: false, access: 'owner', isCancelled: true }
    expect(bookingIntervals([series, moved, cancelled], ROOM, window).map((it) => it.start).sort()).toEqual([hanoi(1, 9), hanoi(2, 14)])
  })
})

describe('bookingWindow', () => {
  it('runs 90 days from now, or from a later start', () => {
    const now = hanoi(1, 8)
    expect(bookingWindow({ date: hanoi(5, 9) }, now)).toEqual({ start: now, end: hanoi(5, 9) + BOOKING_WINDOW_DAYS * DAY })
    expect(bookingWindow({ date: hanoi(1, 6) }, now)).toEqual({ start: hanoi(1, 6), end: now + BOOKING_WINDOW_DAYS * DAY })
  })
})

describe('findClashes', () => {
  const taken = booking({ _id: 't', date: hanoi(5, 9), dueDate: hanoi(5, 10) })

  it('returns the candidate occurrences that overlap a holding booking', () => {
    const candidate = booking({ _id: 'c', date: hanoi(5, 9, 30), dueDate: hanoi(5, 10, 30), servoneBookingState: 'pending' })
    expect(findClashes(candidate, [taken], window)).toEqual([{ start: hanoi(5, 9, 30), end: hanoi(5, 10, 30) }])
  })

  it('names each clashing date of a series', () => {
    const series = booking({ _id: 'c', date: hanoi(1, 9), dueDate: hanoi(1, 10), rules: [{ freq: 'DAILY', count: 10 }] })
    expect(findClashes(series, [taken], window)).toEqual([{ start: hanoi(5, 9), end: hanoi(5, 10) }])
  })

  it('ignores the candidate itself, its stored version and its own series', () => {
    const stored = { ...taken }
    const moved = { ...taken, date: hanoi(5, 9, 30), dueDate: hanoi(5, 10, 30) }
    expect(findClashes(moved, [stored], window)).toEqual([])
    const instance = booking({ _id: 'i', eventId: 'i', recurringEventId: 't', originalStartTime: hanoi(5, 9), date: hanoi(5, 9), dueDate: hanoi(5, 11) })
    expect(findClashes(instance, [taken], window)).toEqual([])
  })

  it('does not count bookings that free the slot', () => {
    const rejected = { ...taken, servoneBookingState: 'rejected' }
    const candidate = booking({ _id: 'c', date: hanoi(5, 9), dueDate: hanoi(5, 10) })
    expect(findClashes(candidate, [rejected], window)).toEqual([])
  })

  it('finds nothing when the candidate itself frees the slot', () => {
    const cancelled = booking({ _id: 'c', date: hanoi(5, 9), dueDate: hanoi(5, 10), servoneBookingState: 'cancelled' })
    expect(findClashes(cancelled, [taken], window)).toEqual([])
  })
})

describe('busyIntervals', () => {
  it('lists other bookings of the resource, never the candidate own series', () => {
    const own = booking({ _id: 'c', date: hanoi(5, 14), dueDate: hanoi(5, 15) })
    const other = booking({ _id: 'o', date: hanoi(5, 9), dueDate: hanoi(5, 10) })
    expect(busyIntervals(own, [own, other], window)).toEqual([{ start: hanoi(5, 9), end: hanoi(5, 10) }])
  })
})

describe('isShrink', () => {
  const series = booking({ _id: 's', date: hanoi(1, 9), dueDate: hanoi(1, 10), rules: [{ freq: 'DAILY', count: 5 }] })

  it('is true when the change only frees time', () => {
    expect(isShrink(series, { ...series, rules: [{ freq: 'DAILY', count: 3 }] }, window)).toBe(true)
    expect(isShrink(series, { ...series, exdate: [hanoi(2, 9)] }, window)).toBe(true)
    expect(isShrink(series, { ...series, servoneBookingState: 'cancelled' }, window)).toBe(true)
  })

  it('is false when the change takes any new time or another resource', () => {
    expect(isShrink(series, { ...series, rules: [{ freq: 'DAILY', count: 6 }] }, window)).toBe(false)
    expect(isShrink(series, { ...series, date: hanoi(1, 8), dueDate: hanoi(1, 9) }, window)).toBe(false)
    expect(isShrink(series, { ...series, servoneResource: 'car' }, window)).toBe(false)
  })
})

describe('suggestSlots', () => {
  const day = { start: hanoi(5, 0), end: hanoi(6, 0) }
  const want = { start: hanoi(5, 9), end: hanoi(5, 10) }

  it('offers the nearest free slots of the same length on 30-minute steps', () => {
    const busy = [{ start: hanoi(5, 8), end: hanoi(5, 10, 30) }]
    expect(suggestSlots(want, busy, hanoi(1, 0), day)).toEqual([
      { start: hanoi(5, 10, 30), end: hanoi(5, 11, 30) },
      { start: hanoi(5, 7), end: hanoi(5, 8) },
      { start: hanoi(5, 11), end: hanoi(5, 12) }
    ])
  })

  it('never offers a slot that has started', () => {
    const busy = [{ start: hanoi(5, 9), end: hanoi(5, 10) }]
    const slots = suggestSlots(want, busy, hanoi(5, 8, 10), day)
    expect(slots).toEqual([
      { start: hanoi(5, 10), end: hanoi(5, 11) },
      { start: hanoi(5, 10, 30), end: hanoi(5, 11, 30) },
      { start: hanoi(5, 11), end: hanoi(5, 12) }
    ])
  })

  it('returns nothing when the day is full', () => {
    expect(suggestSlots(want, [day], hanoi(1, 0), day)).toEqual([])
  })
})
