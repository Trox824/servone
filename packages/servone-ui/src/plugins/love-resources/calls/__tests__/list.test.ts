import type { Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import type { Room } from '@hcengineering/love'
import { contextRoomId, MEETINGS_FLOOR } from '../context'
import { listMeetings, type MeetingEvent } from '../list'

const now = new Date(2026, 9, 1, 9, 10).getTime()
const at = (day: number, hour: number): number => new Date(2026, 9, day, hour).getTime()
const person = (id: string): Ref<Person> => id as Ref<Person>
const standup = contextRoomId('standup')
const chatRoom = contextRoomId('chat-1')

const weekly = (day: number): MeetingEvent => ({
  eventId: `standup-${day}`,
  recurringEventId: 'standup',
  originalStartTime: at(day, 9),
  title: 'Stand-up',
  date: at(day, 9),
  dueDate: at(day, 9) + 30 * 60 * 1000
})

describe('listMeetings', () => {
  const scheduled = [
    { event: weekly(-6), room: standup },
    { event: weekly(1), room: standup },
    { event: weekly(8), room: standup },
    { event: { ...weekly(1), title: 'Google copy' }, room: standup },
    { event: { eventId: 'old', title: 'Old', date: at(1, 9) - 40 * 24 * 3600 * 1000, dueDate: at(1, 10) - 40 * 24 * 3600 * 1000 }, room: contextRoomId('old') }
  ]
  const rooms: Array<Pick<Room, '_id' | 'name' | 'floor'>> = [
    { _id: standup, name: 'Stand-up', floor: MEETINGS_FLOOR },
    { _id: chatRoom, name: 'du-an-website', floor: MEETINGS_FLOOR },
    { _id: 'office' as Ref<Room>, name: 'Office', floor: 'main' as Room['floor'] }
  ]
  const infos = [
    { room: standup, person: person('lan') },
    { room: chatRoom, person: person('huy') },
    { room: 'office' as Ref<Room>, person: person('tu') }
  ]
  const sections = listMeetings(scheduled, rooms, infos, new Map([[chatRoom, at(1, 9)]]), now)
  const byGroup = new Map(sections.map((s) => [s.group, s.rows]))

  it('puts only the occurrence nearest now in the live call, plus chat calls without an event', () => {
    expect(byGroup.get('live')?.map((row) => [row.title, row.inCall])).toEqual([
      ['Google copy', [person('lan')]],
      ['du-an-website', [person('huy')]]
    ])
  })

  it('keeps other occurrences in their own groups and drops meetings older than 30 days', () => {
    expect(sections.map((s) => [s.group, s.rows.length])).toEqual([
      ['live', 2],
      ['later', 1],
      ['past', 1]
    ])
  })
})
