import type { Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import type { ParticipantInfo, Room } from '@hcengineering/love'
import { DAY_MS } from '../../calendar-resources/lich/lib/time'
import { isContextRoom, meetingGroup, peopleInCall, type MeetingGroup } from './context'

export const GROUP_ORDER: readonly MeetingGroup[] = ['live', 'today', 'week', 'later', 'past']

export const PAST_WINDOW_MS = 30 * DAY_MS

export interface MeetingEvent {
  eventId: string
  recurringEventId?: string
  originalStartTime?: number
  title: string
  date: number
  dueDate: number
}

export interface Scheduled<E extends MeetingEvent> {
  event: E
  room: Ref<Room>
}

export interface MeetingRow<E extends MeetingEvent> {
  key: string
  room: Ref<Room>
  title: string
  start: number
  end: number
  event: E | undefined
  inCall: Array<Ref<Person>>
  group: MeetingGroup
}

export interface MeetingSection<E extends MeetingEvent> {
  group: MeetingGroup
  rows: Array<MeetingRow<E>>
}

export function meetingKey (event: MeetingEvent): string {
  return `${event.recurringEventId ?? event.eventId}:${event.originalStartTime ?? event.date}`
}

const distanceFromNow = (start: number, end: number, now: number): number => (now < start ? start - now : now > end ? now - end : 0)

export function listMeetings<E extends MeetingEvent> (
  scheduled: Array<Scheduled<E>>,
  rooms: Array<Pick<Room, '_id' | 'name' | 'floor'>>,
  infos: Array<Pick<ParticipantInfo, 'room' | 'person'>>,
  startedAt: ReadonlyMap<string, number>,
  now: number
): Array<MeetingSection<E>> {
  const byKey = new Map<string, Scheduled<E>>()
  for (const entry of scheduled) {
    if (entry.event.dueDate < now - PAST_WINDOW_MS) continue
    byKey.set(meetingKey(entry.event), entry)
  }
  const entries = [...byKey.entries()]

  const liveOwner = new Map<Ref<Room>, string>()
  for (const [key, { event, room }] of entries) {
    const owner = liveOwner.get(room)
    const ownerEvent = owner === undefined ? undefined : byKey.get(owner)?.event
    if (ownerEvent === undefined || distanceFromNow(event.date, event.dueDate, now) < distanceFromNow(ownerEvent.date, ownerEvent.dueDate, now)) {
      liveOwner.set(room, key)
    }
  }

  const rows: Array<MeetingRow<E>> = entries.map(([key, { event, room }]) => {
    const inCall = liveOwner.get(room) === key ? peopleInCall(infos, room) : []
    return { key, room, title: event.title, start: event.date, end: event.dueDate, event, inCall, group: meetingGroup(event.date, event.dueDate, inCall.length, now) }
  })

  for (const room of rooms) {
    if (!isContextRoom(room) || liveOwner.has(room._id)) continue
    const inCall = peopleInCall(infos, room._id)
    if (inCall.length === 0) continue
    const start = startedAt.get(room._id) ?? now
    rows.push({ key: room._id, room: room._id, title: room.name, start, end: now, event: undefined, inCall, group: 'live' })
  }

  return GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((row) => row.group === group).sort((a, b) => (group === 'past' ? b.start - a.start : a.start - b.start))
  })).filter((section) => section.rows.length > 0)
}
