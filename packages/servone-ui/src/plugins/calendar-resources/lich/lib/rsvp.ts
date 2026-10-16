import type { CalEvent, Rsvp, Slot, Timed } from './types'

export const RSVP_ATTR = 'servoneRsvp'
export const RSVP_OCCURRENCES_ATTR = 'servoneRsvpOccurrences'
export const RSVP_NOTE_ATTR = 'servoneRsvpNote'
export const RSVP_PROPOSAL_ATTR = 'servoneRsvpProposal'
export const MAX_NOTE_LENGTH = 200
const STATUSES: readonly Rsvp[] = ['accepted', 'tentative', 'declined']
const ENTRY_SEPARATOR = ';'
const KEY_SEPARATOR = '='

export type Answer = Rsvp | 'organizer' | 'pending' | 'none'

export interface Occurrence extends Timed {
  originalStartTime: number
}

export interface RsvpFields {
  servoneRsvp?: string
  servoneRsvpOccurrences?: string
  servoneRsvpNote?: string
  servoneRsvpProposal?: string
}

export function stampRsvp (status: Rsvp, answeredFor: Timed): string {
  return `${status}:${answeredFor.date}:${answeredFor.dueDate}`
}

export function rsvpOf (stamp: string | undefined, current: Timed): Rsvp | undefined {
  if (stamp === undefined) return undefined
  const [status, date, dueDate] = stamp.split(':')
  const known = STATUSES.find((s) => s === status)
  if (known === undefined) return undefined
  return Number(date) === current.date && Number(dueDate) === current.dueDate ? known : undefined
}

export function isDeclined (answer: Answer): boolean {
  return answer === 'declined'
}

function occurrenceEntries (encoded: string | undefined): Map<number, string> {
  const entries = new Map<number, string>()
  for (const entry of (encoded ?? '').split(ENTRY_SEPARATOR)) {
    const [key, stamp] = entry.split(KEY_SEPARATOR)
    if (stamp === undefined || key === '' || Number.isNaN(Number(key))) continue
    entries.set(Number(key), stamp)
  }
  return entries
}

export function occurrenceRsvp (encoded: string | undefined, occurrence: Occurrence): Rsvp | undefined {
  return rsvpOf(occurrenceEntries(encoded).get(occurrence.originalStartTime), occurrence)
}

export function withOccurrenceRsvp (encoded: string | undefined, status: Rsvp, occurrence: Occurrence): string {
  const entries = occurrenceEntries(encoded)
  entries.set(occurrence.originalStartTime, stampRsvp(status, occurrence))
  return [...entries].map(([key, stamp]) => `${key}${KEY_SEPARATOR}${stamp}`).join(ENTRY_SEPARATOR)
}

export function seriesId (e: Pick<CalEvent, 'eventId' | 'recurringEventId'>): string {
  return e.recurringEventId ?? e.eventId
}

export function occurrenceOf (e: CalEvent, series: Timed, stored: CalEvent[]): Occurrence | undefined {
  if (e.recurringEventId === undefined || e.originalStartTime === undefined) return undefined
  const originalStartTime = e.originalStartTime
  if (e.virtual === true) {
    return { originalStartTime, date: originalStartTime, dueDate: originalStartTime + series.dueDate - series.date, allDay: series.allDay }
  }
  const override = stored.find((s) => s._id === e._id) ?? e
  return { originalStartTime, date: override.date, dueDate: override.dueDate, allDay: override.allDay }
}

export function answerFor (copy: CalEvent, occurrence: Occurrence | undefined): Answer {
  if (copy.access === 'owner') return 'organizer'
  const forOccurrence = occurrence === undefined ? undefined : occurrenceRsvp(copy.servoneRsvpOccurrences, occurrence)
  return forOccurrence ?? rsvpOf(copy.servoneRsvp, copy) ?? 'pending'
}

export function answers (
  copies: CalEvent[],
  personOf: (socialId: string) => string | undefined,
  occurrence?: Occurrence
): Map<string, Answer> {
  const byPerson = new Map<string, Answer>()
  for (const copy of copies) {
    const person = personOf(copy.user)
    if (person === undefined || byPerson.get(person) === 'organizer') continue
    byPerson.set(person, answerFor(copy, occurrence))
  }
  return byPerson
}

export function myCopy<E extends CalEvent> (copies: E[], id: string, isMine: (socialId: string) => boolean): E | undefined {
  const own = copies.filter((c) => c.eventId === id && isMine(c.user))
  return own.find((c) => c.access === 'owner') ?? own[0]
}

export function myAnswer (e: CalEvent, stored: CalEvent[], isMine: (socialId: string) => boolean): Answer {
  const copy = myCopy(stored, seriesId(e), isMine) ?? (isMine(e.user) ? e : undefined)
  if (copy === undefined) return 'none'
  return answerFor(copy, occurrenceOf(e, copy, stored))
}

export function rsvpUpdate (status: Rsvp, copy: CalEvent, occurrence: Occurrence | undefined): RsvpFields {
  if (occurrence !== undefined) {
    return { servoneRsvpOccurrences: withOccurrenceRsvp(copy.servoneRsvpOccurrences, status, occurrence) }
  }
  const fields: RsvpFields = { servoneRsvp: stampRsvp(status, copy) }
  if (copy.servoneRsvpOccurrences !== undefined) fields.servoneRsvpOccurrences = ''
  return fields
}

export function stampProposal (proposed: Slot, madeFor: Timed): string {
  return `${proposed.start}:${proposed.end}:${madeFor.date}:${madeFor.dueDate}`
}

export function proposalOf (stamp: string | undefined, current: Timed): Slot | undefined {
  if (stamp === undefined || stamp === '') return undefined
  const [start, end, date, dueDate] = stamp.split(':').map(Number)
  if (date !== current.date || dueDate !== current.dueDate || !(end > start)) return undefined
  return { start, end }
}

export interface GuestReply {
  copy: CalEvent
  note: string
  proposal: Slot | undefined
}

export function guestReply (copies: CalEvent[], person: string, personOf: (socialId: string) => string | undefined, current: Timed): GuestReply | undefined {
  const own = copies.filter((c) => c.access !== 'owner' && personOf(c.user) === person)
  const copy = own.find((c) => (c.servoneRsvpNote ?? '') !== '' || proposalOf(c.servoneRsvpProposal, current) !== undefined) ?? own[0]
  if (copy === undefined) return undefined
  return { copy, note: copy.servoneRsvpNote ?? '', proposal: proposalOf(copy.servoneRsvpProposal, current) }
}
