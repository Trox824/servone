import type { Ref } from '@hcengineering/core'
import type { Floor, ParticipantInfo, Room } from '@hcengineering/love'
import { DAY_MS, startOfDay } from '../../calendar-resources/lich/lib/time'

export const MEETINGS_FLOOR = 'servone:floor:Meetings' as Ref<Floor>

export function contextRoomId (contextId: string): Ref<Room> {
  return `servone-call-${contextId}` as Ref<Room>
}

export function isContextRoom (room: Pick<Room, 'floor'>): boolean {
  return room.floor === MEETINGS_FLOOR
}

export function peopleInCall (infos: Array<Pick<ParticipantInfo, 'room' | 'person'>>, room: Ref<Room>): ParticipantInfo['person'][] {
  return infos.filter((info) => info.room === room).map((info) => info.person)
}

export type MeetingGroup = 'live' | 'today' | 'week' | 'later' | 'past'

const WEEK_DAYS = 7

export function meetingGroup (start: number, end: number, inCall: number, now: number): MeetingGroup {
  if (inCall > 0) return 'live'
  if (end < now) return 'past'
  const startOfToday = startOfDay(now)
  if (start < startOfToday + DAY_MS) return 'today'
  if (start < startOfToday + WEEK_DAYS * DAY_MS) return 'week'
  return 'later'
}

const JOIN_EARLY_MS = 10 * 60 * 1000

export function canJoin (start: number, end: number, inCall: number, now: number): boolean {
  return inCall > 0 || (now >= start - JOIN_EARLY_MS && now <= end)
}

// LiveKit Build plan quota
export const MAX_CALL_MINUTES = 10

const GUEST_LINK_GRACE_MS = DAY_MS

export function guestLinkExpiry (meetingEnd: number, now: number): number {
  return Math.floor((Math.max(meetingEnd, now) + GUEST_LINK_GRACE_MS) / 1000)
}
