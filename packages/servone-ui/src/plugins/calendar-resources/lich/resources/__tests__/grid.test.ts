import type { BookingEvent } from '@servone/approvals/src/booking'
import { blocksOf, columnsOf, draftSlotOf, dragSlot, packLanes } from '../grid'

const at = (h: number, m = 0): number => new Date(2026, 9, 2, h, m).getTime()
const day = at(0)
const MIN = 60 * 1000

describe('columnsOf', () => {
  const resources = [
    { _id: 'b', name: 'Phòng nhỏ', type: 'room' as const, archived: false },
    { _id: 'v', name: 'Xe 7 chỗ', type: 'car' as const, archived: false },
    { _id: 'a', name: 'Phòng lớn', type: 'room' as const, archived: false },
    { _id: 'p', name: 'Máy chiếu', type: 'equipment' as const, archived: false },
    { _id: 'o', name: 'Loa', type: 'other' as const, archived: false },
    { _id: 'x', name: 'Phòng cũ', type: 'room' as const, archived: true }
  ]
  it('drops archived and orders rooms, cars, equipment, other, then by name', () => {
    expect(columnsOf(resources, 'all', 'vi').map((r) => r._id)).toEqual(['a', 'b', 'v', 'p', 'o'])
  })
  it('keeps only the picked type', () => {
    expect(columnsOf(resources, 'room', 'vi').map((r) => r._id)).toEqual(['a', 'b'])
    expect(columnsOf(resources, 'car', 'vi').map((r) => r._id)).toEqual(['v'])
  })
})

describe('draftSlotOf', () => {
  it('books an hour from the slot', () => {
    expect(draftSlotOf({ start: at(9), end: at(9, 30) }, [])).toEqual({ start: at(9), end: at(10) })
  })
  it('stops at the next booking of the resource', () => {
    expect(draftSlotOf({ start: at(9), end: at(9, 30) }, [{ start: at(8), end: at(9) }, { start: at(9, 30), end: at(11) }])).toEqual({ start: at(9), end: at(9, 30) })
  })
})

describe('dragSlot', () => {
  const blocks = [{ start: at(10), end: at(11) }, { start: at(13), end: at(14) }]
  it('spans the pressed step to the pointer step, snapped to 15 minutes', () => {
    expect(dragSlot(at(11, 20), at(12, 5), blocks, at(0))).toEqual({ start: at(11, 15), end: at(12, 15) })
  })
  it('works upward from the pressed step', () => {
    expect(dragSlot(at(12, 40), at(11, 50), blocks, at(0))).toEqual({ start: at(11, 45), end: at(12, 45) })
  })
  it('stops at the neighbouring booking', () => {
    expect(dragSlot(at(11, 30), at(15), blocks, at(0))).toEqual({ start: at(11, 30), end: at(13) })
    expect(dragSlot(at(12), at(8), blocks, at(0))).toEqual({ start: at(11), end: at(12, 15) })
  })
  it('refuses a press inside a booking or before the bookable start', () => {
    expect(dragSlot(at(10, 30), at(12), blocks, at(0))).toBeUndefined()
    expect(dragSlot(at(8), at(9), blocks, at(8, 30))).toBeUndefined()
  })
  it('does not reach above the bookable start', () => {
    expect(dragSlot(at(9), at(7), blocks, at(8, 30))).toEqual({ start: at(8, 30), end: at(9, 15) })
  })
})

describe('packLanes', () => {
  it('gives overlapping blocks side-by-side lanes and lone blocks the full width', () => {
    const packed = packLanes([
      { id: 'a', start: at(9), end: at(10) },
      { id: 'b', start: at(9, 30), end: at(11) },
      { id: 'c', start: at(10), end: at(10, 30) },
      { id: 'd', start: at(12), end: at(13) }
    ])
    expect(packed.map(({ id, lane, lanes }) => [id, lane, lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
      ['d', 0, 1]
    ])
  })
})

describe('blocksOf', () => {
  const booking = (over: Partial<BookingEvent>): BookingEvent => ({
    _id: 'e1',
    eventId: 'e1',
    date: at(9),
    dueDate: at(10),
    allDay: false,
    access: 'owner',
    servoneResource: 'room1',
    servoneBookingState: 'confirmed',
    ...over
  })
  const window = { start: day, end: at(24) }
  it('keeps holding organizer copies of the resource, joined to their event', () => {
    const events = [
      booking({}),
      booking({ _id: 'e2', eventId: 'e2', date: at(11), dueDate: at(12), servoneBookingState: 'pending' }),
      booking({ _id: 'g', access: 'reader' }),
      booking({ _id: 'r', eventId: 'r', servoneBookingState: 'rejected' }),
      booking({ _id: 'o', eventId: 'o', servoneResource: 'room2' })
    ]
    expect(blocksOf(events, 'room1', window).map((b) => [b.event._id, b.start])).toEqual([['e1', at(9)], ['e2', at(11)]])
  })
  it('expands a daily series into the day', () => {
    const series = booking({ _id: 's', eventId: 's', date: at(-24 * 2 + 9), dueDate: at(-24 * 2 + 10), rules: [{ freq: 'DAILY' }], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    expect(blocksOf([series], 'room1', window).map((b) => [b.event._id, b.start, b.end - b.start])).toEqual([['s', at(9), 60 * MIN]])
  })
})
