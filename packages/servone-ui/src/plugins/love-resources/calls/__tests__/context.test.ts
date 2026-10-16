import type { Ref } from '@hcengineering/core'
import type { Person } from '@hcengineering/contact'
import type { Room } from '@hcengineering/love'
import { canJoin, contextRoomId, guestLinkExpiry, isContextRoom, meetingGroup, MEETINGS_FLOOR, peopleInCall } from '../context'

const now = new Date(2026, 9, 1, 9, 0).getTime()
const at = (day: number, hour: number): number => new Date(2026, 9, day, hour).getTime()
const room = (id: string): Ref<Room> => id as Ref<Room>
const person = (id: string): Ref<Person> => id as Ref<Person>

describe('contextRoomId', () => {
  it('gives the same room for the same context', () => {
    expect(contextRoomId('ch1')).toBe(contextRoomId('ch1'))
  })

  it('gives different rooms for different contexts', () => {
    expect(contextRoomId('ch1')).not.toBe(contextRoomId('ch2'))
  })
})

describe('isContextRoom', () => {
  it('keeps meeting rooms off every real floor', () => {
    expect(isContextRoom({ floor: MEETINGS_FLOOR })).toBe(true)
    expect(isContextRoom({ floor: 'love:ids:MainFloor' as Room['floor'] })).toBe(false)
  })
})

describe('peopleInCall', () => {
  it('lists only the people in that room', () => {
    const infos = [
      { room: room('a'), person: person('p1') },
      { room: room('b'), person: person('p2') },
      { room: room('a'), person: person('p3') }
    ]
    expect(peopleInCall(infos, room('a'))).toEqual(['p1', 'p3'])
  })
})

describe('meetingGroup', () => {
  it('puts a meeting with people in the call on top, even before its time', () => {
    expect(meetingGroup(at(1, 14), at(1, 15), 2, now)).toBe('live')
  })

  it('sorts by day otherwise', () => {
    expect(meetingGroup(at(1, 14), at(1, 15), 0, now)).toBe('today')
    expect(meetingGroup(at(3, 9), at(3, 10), 0, now)).toBe('week')
    expect(meetingGroup(at(12, 9), at(12, 10), 0, now)).toBe('later')
    expect(meetingGroup(at(1, 7), at(1, 8), 0, now)).toBe('past')
  })
})

describe('canJoin', () => {
  it('opens 10 minutes before the start', () => {
    expect(canJoin(at(1, 9) + 10 * 60 * 1000, at(1, 10), 0, now)).toBe(true)
    expect(canJoin(at(1, 9) + 11 * 60 * 1000, at(1, 10), 0, now)).toBe(false)
  })

  it('stays open after the end while people are still in the call', () => {
    expect(canJoin(at(1, 7), at(1, 8), 0, now)).toBe(false)
    expect(canJoin(at(1, 7), at(1, 8), 1, now)).toBe(true)
  })
})

describe('guestLinkExpiry', () => {
  const DAY_S = 24 * 60 * 60

  it('lasts a day past the meeting end, in seconds', () => {
    expect(guestLinkExpiry(at(2, 10), now)).toBe(at(2, 10) / 1000 + DAY_S)
  })

  it('counts from now for a meeting that already ended', () => {
    expect(guestLinkExpiry(at(1, 8) - 3 * DAY_S * 1000, now)).toBe(now / 1000 + DAY_S)
  })
})
