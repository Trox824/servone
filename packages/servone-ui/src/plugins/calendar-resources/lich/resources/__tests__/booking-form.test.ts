import { PlatformError, Severity, Status } from '@hcengineering/platform'
import type { Class, Doc, Ref } from '@hcengineering/core'
import { BOOKING_CLASH, findClashes, bookingWindow, type BookableResource, type BookingEvent } from '@servone/approvals/src/booking'
import {
  bookingCandidate,
  bookingChange,
  bookingProblem,
  clashText,
  datesText,
  heldResource,
  isRebook,
  pickerGroups,
  refusedStarts,
  sendsForApproval,
  type BookingDraft
} from '../booking-form'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()
const now = local(2026, 10, 2, 8)

function resource (name: string, over: Partial<BookableResource> = {}): BookableResource {
  return {
    _id: `res-${name}` as Ref<BookableResource>,
    _class: 'servone:class:BookableResource' as Ref<Class<Doc>>,
    space: 'core:space:Model' as BookableResource['space'],
    modifiedOn: 0,
    modifiedBy: 'core:account:System' as BookableResource['modifiedBy'],
    name,
    type: 'room',
    needsApproval: false,
    archived: false,
    ...over
  }
}

const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({
  start: local(2026, 10, 5, 9),
  end: local(2026, 10, 5, 10),
  allDay: false,
  rules: [],
  timeZone: 'Asia/Ho_Chi_Minh',
  ...over
})

describe('pickerGroups', () => {
  it('groups active resources by type in type order, sorted by name', () => {
    const groups = pickerGroups(
      [
        resource('Xe 7 chỗ', { type: 'car' }),
        resource('Phòng nhỏ'),
        resource('Phòng cũ', { archived: true }),
        resource('Máy chiếu', { type: 'equipment' }),
        resource('Phòng lớn')
      ],
      'vi'
    )
    expect(groups.map((g) => [g.type, g.resources.map((r) => r.name)])).toEqual([
      ['room', ['Phòng lớn', 'Phòng nhỏ']],
      ['car', ['Xe 7 chỗ']],
      ['equipment', ['Máy chiếu']]
    ])
  })
})

describe('heldResource', () => {
  it('counts only holding states', () => {
    expect(heldResource({ servoneResource: 'r', servoneBookingState: 'pending' })).toBe('r')
    expect(heldResource({ servoneResource: 'r', servoneBookingState: 'confirmed' })).toBe('r')
    expect(heldResource({ servoneResource: 'r', servoneBookingState: 'rejected' })).toBeUndefined()
    expect(heldResource(undefined)).toBeUndefined()
  })
})

describe('isRebook', () => {
  it('is a rebook when picking a new resource or moving a held one', () => {
    expect(isRebook(undefined, 'r', false)).toBe(true)
    expect(isRebook('a', 'b', false)).toBe(true)
    expect(isRebook('r', 'r', true)).toBe(true)
    expect(isRebook('r', 'r', false)).toBe(false)
    expect(isRebook('r', undefined, true)).toBe(false)
  })
})

describe('bookingProblem', () => {
  const room = resource('Phòng lớn')
  it('passes a timed, supported, near booking without clashes', () => {
    expect(bookingProblem(room, draft(), 0, now)).toBeUndefined()
  })
  it('names the first problem', () => {
    expect(bookingProblem(undefined, draft(), 0, now)).toBe('missing')
    expect(bookingProblem(resource('Cũ', { archived: true }), draft(), 0, now)).toBe('archived')
    expect(bookingProblem(room, draft({ allDay: true }), 0, now)).toBe('allDay')
    expect(bookingProblem(room, draft({ rules: [{ freq: 'MONTHLY', interval: 1, byMonthDay: [6] }] }), 0, now)).toBe('rule')
    expect(bookingProblem(room, draft({ start: local(2027, 1, 5, 9) }), 0, now)).toBe('tooFar')
    expect(bookingProblem(room, draft(), 2, now)).toBe('clash')
  })
  it('lets a monthly booking repeat on its start day', () => {
    expect(bookingProblem(room, draft({ rules: [{ freq: 'MONTHLY', interval: 1, byMonthDay: [5] }] }), 0, now)).toBeUndefined()
  })
  it('accepts weekly repeats', () => {
    expect(bookingProblem(room, draft({ rules: [{ freq: 'WEEKLY', interval: 1, byDay: ['MO'] }] }), 0, now)).toBeUndefined()
  })
})

describe('sendsForApproval', () => {
  it('only when a rebook goes to an approval resource', () => {
    expect(sendsForApproval(resource('A', { needsApproval: true }), true)).toBe(true)
    expect(sendsForApproval(resource('A', { needsApproval: true }), false)).toBe(false)
    expect(sendsForApproval(resource('B'), true)).toBe(false)
    expect(sendsForApproval(undefined, true)).toBe(false)
  })
})

describe('bookingChange', () => {
  const approval = resource('Phòng giám đốc', { needsApproval: true })
  it('writes the resource with its starting state on a new pick', () => {
    expect(bookingChange(undefined, approval._id, approval, false)).toEqual({ servoneResource: approval._id, servoneBookingState: 'pending' })
    const room = resource('Phòng lớn')
    expect(bookingChange(undefined, room._id, room, false)).toEqual({ servoneResource: room._id, servoneBookingState: 'confirmed' })
  })
  it('resets the state when a held booking moves', () => {
    expect(bookingChange(approval._id, approval._id, approval, true)).toEqual({ servoneResource: approval._id, servoneBookingState: 'pending' })
  })
  it('leaves an unmoved booking alone, even before resources load', () => {
    expect(bookingChange(approval._id, approval._id, approval, false)).toEqual({})
    expect(bookingChange(approval._id, approval._id, undefined, false)).toEqual({})
  })
  it('cancels a dropped booking', () => {
    expect(bookingChange(approval._id, undefined, undefined, true)).toEqual({ servoneBookingState: 'cancelled' })
    expect(bookingChange(undefined, undefined, undefined, true)).toEqual({})
  })
  it('refuses to rebook an unresolved resource', () => {
    expect(() => bookingChange(undefined, 'gone', undefined, false)).toThrow()
  })
})

describe('bookingCandidate', () => {
  it('finds a clash on one date of a weekly series', () => {
    const other: BookingEvent = {
      _id: 'other',
      eventId: 'other',
      date: local(2026, 10, 19, 9, 30),
      dueDate: local(2026, 10, 19, 10, 30),
      allDay: false,
      access: 'owner',
      servoneResource: 'r',
      servoneBookingState: 'confirmed'
    }
    const weekly = draft({ rules: [{ freq: 'WEEKLY', interval: 1, byDay: ['MO'] }] })
    const candidate = bookingCandidate(undefined, weekly, 'r')
    const clashes = findClashes(candidate, [other], bookingWindow(candidate, now))
    expect(clashes.map((c) => c.start)).toEqual([local(2026, 10, 19, 9)])
  })
})

describe('datesText', () => {
  it('lists dates in each language', () => {
    expect(datesText([local(2026, 10, 12, 9)], 'vi')).toBe('12/10')
    expect(datesText([local(2026, 10, 12, 9), local(2026, 10, 19, 9)], 'en')).toBe('Oct 12 and Oct 19')
    expect(datesText([local(2026, 10, 12), local(2026, 10, 19), local(2026, 10, 26)], 'vi')).toBe('12/10, 19/10 và 26/10')
  })
  it('caps the list', () => {
    const starts = [5, 12, 19, 26, 2, 9, 16].map((d, i) => local(2026, i < 4 ? 10 : 11, d))
    expect(datesText(starts, 'en')).toBe('Oct 5, Oct 12, Oct 19, Oct 26, Nov 2 and 2 more days')
  })
})

describe('clashText', () => {
  it('names dates only for a repeating booking', () => {
    expect(clashText('Phòng lớn', [local(2026, 10, 12, 9)], false, 'vi')).toBe('Phòng lớn đã có người đặt trong giờ này.')
    expect(clashText('Big room', [local(2026, 10, 12, 9)], true, 'en')).toBe('Big room is already booked on Oct 12.')
  })
})

describe('refusedStarts', () => {
  it('reads the clash dates from a guard refusal', () => {
    const refusal = new PlatformError(new Status(Severity.ERROR, BOOKING_CLASH, { starts: [1, 2] }))
    expect(refusedStarts(refusal)).toEqual([1, 2])
  })
  it('ignores other errors', () => {
    expect(refusedStarts(new Error('offline'))).toBeUndefined()
    expect(refusedStarts(new PlatformError(new Status(Severity.ERROR, 'platform:status:Forbidden', {})))).toBeUndefined()
  })
})
