import {
  answerFor,
  answers,
  isDeclined,
  myAnswer,
  occurrenceOf,
  occurrenceRsvp,
  rsvpUpdate,
  stampRsvp,
  withOccurrenceRsvp,
  type Occurrence
} from '../rsvp'
import type { CalEvent } from '../types'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function event (over: Partial<CalEvent>): CalEvent {
  return {
    _id: 'series-copy', eventId: 'series', title: 'Giao ban', user: 'me', calendar: 'cal', access: 'reader',
    participants: [], blockTime: true, date: 10 * HOUR, dueDate: 11 * HOUR, allDay: false, ...over
  }
}

function virtualOn (series: CalEvent, day: number, over: Partial<CalEvent> = {}): CalEvent {
  const start = series.date + day * DAY
  return {
    ...series,
    _id: `virtual-${day}`,
    eventId: `generated-${day}`,
    recurringEventId: series.eventId,
    originalStartTime: start,
    date: start,
    dueDate: start + series.dueDate - series.date,
    virtual: true,
    ...over
  }
}

const occ = (start: number, end = start + HOUR): Occurrence => ({ originalStartTime: start, date: start, dueDate: end, allDay: false })

describe('occurrence stamps', () => {
  it('round-trips an answer for one occurrence', () => {
    const o = occ(DAY)
    expect(occurrenceRsvp(withOccurrenceRsvp(undefined, 'declined', o), o)).toBe('declined')
  })
  it('replaces the entry for the same occurrence and keeps the others', () => {
    const a = occ(DAY)
    const b = occ(2 * DAY)
    let encoded = withOccurrenceRsvp(undefined, 'accepted', a)
    encoded = withOccurrenceRsvp(encoded, 'tentative', b)
    encoded = withOccurrenceRsvp(encoded, 'declined', a)
    expect(occurrenceRsvp(encoded, a)).toBe('declined')
    expect(occurrenceRsvp(encoded, b)).toBe('tentative')
    expect(encoded.split(';')).toHaveLength(2)
  })
  it('voids an occurrence answer once that occurrence moves', () => {
    const encoded = withOccurrenceRsvp(undefined, 'accepted', occ(DAY))
    expect(occurrenceRsvp(encoded, { ...occ(DAY), date: DAY + HOUR, dueDate: DAY + 2 * HOUR })).toBeUndefined()
  })
  it('ignores empty and malformed encodings', () => {
    expect(occurrenceRsvp('', occ(DAY))).toBeUndefined()
    expect(occurrenceRsvp('garbage;;x=y', occ(DAY))).toBeUndefined()
    expect(occurrenceRsvp(`${DAY}=maybe:${DAY}:${DAY + HOUR}`, occ(DAY))).toBeUndefined()
  })
})

describe('occurrenceOf', () => {
  const series = event({})
  it('is undefined for a single event', () => {
    expect(occurrenceOf(series, series, [])).toBeUndefined()
  })
  it('uses the original start of a virtual instance, not the range-clipped date', () => {
    const instance = virtualOn(series, 1, { date: 10 * HOUR + DAY + 30 * 60 * 1000 })
    expect(occurrenceOf(instance, series, [])).toEqual(occ(10 * HOUR + DAY))
  })
  it('uses the stored times of a moved (overridden) occurrence', () => {
    const moved = { ...virtualOn(series, 1), _id: 'override', virtual: undefined, date: 13 * HOUR + DAY, dueDate: 15 * HOUR + DAY }
    const clipped = { ...moved, dueDate: 14 * HOUR + DAY }
    expect(occurrenceOf(clipped, series, [moved])).toEqual({ originalStartTime: 10 * HOUR + DAY, date: 13 * HOUR + DAY, dueDate: 15 * HOUR + DAY, allDay: false })
  })
})

describe('answerFor', () => {
  const o = occ(10 * HOUR + DAY)
  it('prefers the occurrence answer over the series answer', () => {
    const copy = event({ servoneRsvp: stampRsvp('accepted', event({})), servoneRsvpOccurrences: withOccurrenceRsvp(undefined, 'declined', o) })
    expect(answerFor(copy, o)).toBe('declined')
  })
  it('falls back to the series answer for other occurrences', () => {
    const copy = event({ servoneRsvp: stampRsvp('accepted', event({})), servoneRsvpOccurrences: withOccurrenceRsvp(undefined, 'declined', o) })
    expect(answerFor(copy, occ(10 * HOUR + 2 * DAY))).toBe('accepted')
    expect(answerFor(copy, undefined)).toBe('accepted')
  })
  it('reports organizer for the owner copy and pending when unanswered', () => {
    expect(answerFor(event({ access: 'owner' }), o)).toBe('organizer')
    expect(answerFor(event({}), o)).toBe('pending')
  })
})

describe('answers and myAnswer per occurrence', () => {
  const series = event({ servoneRsvp: stampRsvp('accepted', event({})) })
  const instance = virtualOn(series, 1)
  const o = occurrenceOf(instance, series, [])
  const declinedThere = { ...series, servoneRsvpOccurrences: withOccurrenceRsvp(undefined, 'declined', o ?? occ(0)) }
  it('reads each guest copy for the occurrence', () => {
    const other = event({ _id: 'b', user: 's-binh', servoneRsvp: stampRsvp('tentative', event({})) })
    const byPerson = answers([{ ...declinedThere, user: 's-an' }, other], (s) => s.slice(2), o)
    expect(Object.fromEntries(byPerson)).toEqual({ an: 'declined', binh: 'tentative' })
  })
  it('reads my answer for the clicked occurrence', () => {
    const mine = (s: string): boolean => s === 'me'
    expect(myAnswer(instance, [declinedThere], mine)).toBe('declined')
    expect(myAnswer(virtualOn(series, 2), [declinedThere], mine)).toBe('accepted')
  })
})

describe('rsvpUpdate', () => {
  const series = event({ servoneRsvpOccurrences: withOccurrenceRsvp(undefined, 'declined', occ(DAY)) })
  it('answers all occurrences on the series and clears occurrence answers', () => {
    expect(rsvpUpdate('accepted', series, undefined)).toEqual({ servoneRsvp: stampRsvp('accepted', series), servoneRsvpOccurrences: '' })
  })
  it('leaves occurrence answers alone on a copy that has none', () => {
    const single = event({})
    expect(rsvpUpdate('tentative', single, undefined)).toEqual({ servoneRsvp: stampRsvp('tentative', single) })
  })
  it('answers one occurrence without touching the series answer', () => {
    const fields = rsvpUpdate('accepted', series, occ(2 * DAY))
    expect(fields.servoneRsvp).toBeUndefined()
    expect(occurrenceRsvp(fields.servoneRsvpOccurrences, occ(2 * DAY))).toBe('accepted')
    expect(occurrenceRsvp(fields.servoneRsvpOccurrences, occ(DAY))).toBe('declined')
  })
})

describe('isDeclined', () => {
  it('is true only for a declined answer', () => {
    expect(isDeclined('declined')).toBe(true)
    expect(isDeclined('pending')).toBe(false)
    expect(isDeclined('organizer')).toBe(false)
  })
})
