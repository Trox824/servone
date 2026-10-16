import { answers, guestReply, myAnswer, proposalOf, rsvpOf, seriesId, stampProposal, stampRsvp } from '../rsvp'
import type { CalEvent } from '../types'

function event (over: Partial<CalEvent>): CalEvent {
  return {
    _id: 'e1', eventId: 'ev', title: 'Giao ban', user: 'me', calendar: 'cal', access: 'reader',
    participants: [], blockTime: true, date: 1000, dueDate: 2000, allDay: false, ...over
  }
}

describe('rsvpOf', () => {
  it('reads an answer stamped for the current time', () => {
    const e = event({})
    expect(rsvpOf(stampRsvp('accepted', e), e)).toBe('accepted')
  })
  it('treats an answer for an old time as unanswered', () => {
    const stamp = stampRsvp('declined', event({}))
    expect(rsvpOf(stamp, event({ date: 5000, dueDate: 6000 }))).toBeUndefined()
  })
  it('ignores missing and malformed stamps', () => {
    expect(rsvpOf(undefined, event({}))).toBeUndefined()
    expect(rsvpOf('maybe:1000:2000', event({}))).toBeUndefined()
    expect(rsvpOf('accepted', event({}))).toBeUndefined()
  })
})

describe('seriesId', () => {
  it('uses the recurring series id for instances', () => {
    expect(seriesId({ eventId: 'inst', recurringEventId: 'series' })).toBe('series')
    expect(seriesId({ eventId: 'single' })).toBe('single')
  })
})

describe('answers', () => {
  it('maps each copy owner to their answer', () => {
    const owner = event({ _id: 'a', user: 's-an', access: 'owner' })
    const yes = event({ _id: 'b', user: 's-binh', servoneRsvp: stampRsvp('accepted', owner) })
    const stale = event({ _id: 'c', user: 's-chi', servoneRsvp: '1:2:3' })
    const people: Record<string, string> = { 's-an': 'an', 's-binh': 'binh', 's-chi': 'chi' }
    const byPerson = answers([owner, yes, stale], (s) => people[s])
    expect(Object.fromEntries(byPerson)).toEqual({ an: 'organizer', binh: 'accepted', chi: 'pending' })
  })
  it('reads a guest answer as pending once the organizer moves the event', () => {
    const moved = event({ user: 's-binh', date: 5000, dueDate: 6000, servoneRsvp: stampRsvp('accepted', event({})) })
    expect(Object.fromEntries(answers([moved], () => 'binh'))).toEqual({ binh: 'pending' })
  })
  it('skips copies whose owner is not a known person', () => {
    expect(answers([event({ user: 's-unknown' })], () => undefined).size).toBe(0)
  })
})

describe('myAnswer', () => {
  const mine = (s: string): boolean => s === 'me'
  it('reads the stored copy, not the range-clipped one', () => {
    const stored = event({ date: 1000, dueDate: 90000, servoneRsvp: 'tentative:1000:90000' })
    const clipped = { ...stored, date: 50000 }
    expect(myAnswer(clipped, [stored], mine)).toBe('tentative')
  })
  it('checks a virtual recurring instance against its series', () => {
    const series = event({ eventId: 'series', date: 1000, dueDate: 2000, servoneRsvp: 'accepted:1000:2000' })
    const instance = { ...series, _id: 'virtual', eventId: 'series-20260924', recurringEventId: 'series', date: 86401000, dueDate: 86402000 }
    expect(myAnswer(instance, [series], mine)).toBe('accepted')
  })
  it('reports organizer for my own event and pending when unanswered', () => {
    expect(myAnswer(event({ access: 'owner' }), [], mine)).toBe('organizer')
    expect(myAnswer(event({}), [], mine)).toBe('pending')
  })
  it('prefers my owner copy when sync left two copies of mine', () => {
    const google = event({ _id: 'g', user: 'me-google', access: 'reader' })
    const huly = event({ _id: 'h', access: 'owner' })
    const isMe = (s: string): boolean => s === 'me' || s === 'me-google'
    expect(myAnswer(google, [google, huly], isMe)).toBe('organizer')
  })
  it('reports none for a colleague\'s copy when I have none, even if they organize it', () => {
    expect(myAnswer(event({ user: 'colleague', access: 'owner' }), [], mine)).toBe('none')
  })
})

describe('proposalOf', () => {
  it('reads a proposal made for the current time', () => {
    const e = event({})
    expect(proposalOf(stampProposal({ start: 3000, end: 4000 }, e), e)).toEqual({ start: 3000, end: 4000 })
  })
  it('drops a proposal once the event moved', () => {
    const stamp = stampProposal({ start: 3000, end: 4000 }, event({}))
    expect(proposalOf(stamp, event({ date: 3000, dueDate: 4000 }))).toBeUndefined()
  })
  it('ignores dismissed and malformed proposals', () => {
    expect(proposalOf('', event({}))).toBeUndefined()
    expect(proposalOf('x:y:1000:2000', event({}))).toBeUndefined()
    expect(proposalOf('4000:3000:1000:2000', event({}))).toBeUndefined()
  })
})

describe('guestReply', () => {
  const personOf = (socialId: string): string | undefined => ({ an: 'An', an2: 'An', binh: 'Binh' })[socialId]
  it('picks the guest copy that carries the note', () => {
    const organizer = event({ _id: 'o', user: 'binh', access: 'owner', servoneRsvpNote: 'mine' })
    const plain = event({ _id: 'a1', user: 'an' })
    const noted = event({ _id: 'a2', user: 'an2', servoneRsvpNote: 'Late 10 min' })
    expect(guestReply([organizer, plain, noted], 'An', personOf, event({}))).toEqual({ copy: noted, note: 'Late 10 min', proposal: undefined })
    expect(guestReply([organizer], 'Binh', personOf, event({}))).toBeUndefined()
  })
})
