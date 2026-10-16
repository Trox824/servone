import type { Event } from '@hcengineering/calendar'
import { getCurrentLocation, navigate } from '@hcengineering/ui'
import { joinMeetingEvent } from '../../love-resources/calls/join'

function openMeeting (event: Event): void {
  const loc = getCurrentLocation()
  loc.path[2] = 'love'
  loc.path.length = 3
  loc.query = { meeting: event._id }
  navigate(loc)
}

export function joinOrOpenMeeting (event: Event, isJoinable: boolean): void {
  if (isJoinable) void joinMeetingEvent(event)
  else openMeeting(event)
}
