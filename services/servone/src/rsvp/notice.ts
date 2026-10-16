import type { IntlString } from '@hcengineering/platform'

export type RsvpStatus = 'accepted' | 'tentative' | 'declined'

const STATUSES: readonly RsvpStatus[] = ['accepted', 'tentative', 'declined']

// Registered client-side by servone-ui lich/strings.ts; keep the keys in sync.
const NOTICE: Record<RsvpStatus, IntlString> = {
  accepted: 'servone-calendar:string:RsvpAcceptedNotice' as IntlString,
  tentative: 'servone-calendar:string:RsvpTentativeNotice' as IntlString,
  declined: 'servone-calendar:string:RsvpDeclinedNotice' as IntlString
}

export interface RsvpReply {
  // servoneRsvp as written by servone-ui lich/lib/rsvp.ts stampRsvp: `${status}:${date}:${dueDate}`.
  stamp: string
  isOrganizerCopy: boolean
  guest: string
  organizer: string
}

export function statusOfStamp (stamp: string): RsvpStatus | undefined {
  const [status] = stamp.split(':')
  return STATUSES.find((known) => known === status)
}

export function noticeFor (reply: RsvpReply): IntlString | undefined {
  if (reply.isOrganizerCopy || reply.guest === reply.organizer) return undefined
  const status = statusOfStamp(reply.stamp)
  return status === undefined ? undefined : NOTICE[status]
}
