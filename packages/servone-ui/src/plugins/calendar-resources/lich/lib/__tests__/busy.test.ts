import { blocksTime, busyBlocks, overlaps } from '../busy'
import { stampRsvp } from '../rsvp'

const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime()
const ev = (h1: number, h2: number, over: Partial<{ allDay: boolean, blockTime: boolean }> = {}): { date: number, dueDate: number, allDay: boolean, blockTime: boolean } =>
  ({ date: local(2026, 9, 24, h1), dueDate: local(2026, 9, 24, h2), allDay: false, blockTime: true, ...over })
const day = local(2026, 9, 24)

describe('busyBlocks', () => {
  it('merges overlapping and touching events', () => {
    expect(busyBlocks([ev(9, 10), ev(9, 11), ev(11, 12), ev(14, 15)], day)).toEqual([
      { start: local(2026, 9, 24, 9), end: local(2026, 9, 24, 12) },
      { start: local(2026, 9, 24, 14), end: local(2026, 9, 24, 15) }
    ])
  })
  it('skips all-day and non-blocking events', () => {
    expect(busyBlocks([ev(0, 23, { allDay: true }), ev(9, 10, { blockTime: false })], day)).toEqual([])
  })
  it('clips events that cross midnight to the day', () => {
    const late = { date: local(2026, 9, 23, 22), dueDate: local(2026, 9, 24, 2), allDay: false, blockTime: true }
    expect(busyBlocks([late], day)).toEqual([{ start: day, end: local(2026, 9, 24, 2) }])
  })
})

describe('overlaps', () => {
  const blocks = [{ start: local(2026, 9, 24, 9), end: local(2026, 9, 24, 10) }]
  it('flags a slot that intersects a block', () => {
    expect(overlaps({ start: local(2026, 9, 24, 9, 30), end: local(2026, 9, 24, 11) }, blocks)).toBe(true)
  })
  it('allows a slot that starts when a block ends', () => {
    expect(overlaps({ start: local(2026, 9, 24, 10), end: local(2026, 9, 24, 11) }, blocks)).toBe(false)
  })
})

describe('blocksTime', () => {
  const HOUR = 60 * 60 * 1000
  const base = {
    _id: 'x', eventId: 'ev', title: 'Họp', user: 's-binh', calendar: 'cal', access: 'reader',
    participants: [], blockTime: true, date: 9 * HOUR, dueDate: 10 * HOUR, allDay: false
  }
  it('counts an unanswered or accepted copy as busy', () => {
    expect(blocksTime(base, [base])).toBe(true)
    const yes = { ...base, servoneRsvp: stampRsvp('accepted', base) }
    expect(blocksTime(yes, [yes])).toBe(true)
  })
  it('skips a copy whose owner declined and a free event', () => {
    const no = { ...base, servoneRsvp: stampRsvp('declined', base) }
    expect(blocksTime(no, [no])).toBe(false)
    expect(blocksTime({ ...base, blockTime: false }, [])).toBe(false)
  })
  it('reads the decline from the stored copy when the view clipped the event', () => {
    const no = { ...base, servoneRsvp: stampRsvp('declined', base) }
    expect(blocksTime({ ...no, date: 9.5 * HOUR }, [no])).toBe(false)
  })
})
