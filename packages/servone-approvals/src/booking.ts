import type { Person } from '@hcengineering/contact'
import type { Class, Doc, Ref } from '@hcengineering/core'
import type { StatusCode } from '@hcengineering/platform'

// A runtime class in the model space (created by servone-ui lich/setup.ts), so resources reach every client and the guard modelDb.
export const RESOURCE_CLASS = 'servone:class:BookableResource' as Ref<Class<BookableResource>>
// Custom attributes on calendar:class:Event, declared by servone-ui lich/setup.ts.
export const BOOKING_RESOURCE_ATTR = 'servoneResource'
export const BOOKING_STATE_ATTR = 'servoneBookingState'
export const BOOKING_WINDOW_DAYS = 90
export const SUGGEST_STEP_MS = 30 * 60 * 1000
export const MAX_SUGGESTIONS = 3
// Refusal params: { starts: number[] }, the start of each clashing occurrence.
export const BOOKING_CLASH = 'servone:status:BookingClash' as StatusCode

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const EXPANDABLE_FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
const UNSUPPORTED_RULE_PARTS = ['bySecond', 'byMinute', 'byHour', 'byYearDay', 'byWeekNo', 'bySetPos'] as const

export const RESOURCE_TYPES = ['room', 'car', 'equipment', 'other'] as const
export type ResourceType = (typeof RESOURCE_TYPES)[number]

export interface BookableResource extends Doc {
  name: string
  type: ResourceType
  capacity?: number
  needsApproval: boolean
  approver?: Ref<Person>
  archived: boolean
}

export type BookingState = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'cancelled'
export const BOOKING_STATES: readonly BookingState[] = ['pending', 'confirmed', 'rejected', 'expired', 'cancelled']
const HOLDING_STATES: readonly string[] = ['pending', 'confirmed']

// Structural subset of calendar RecurringRule; this package cannot depend on @hcengineering/calendar.
export interface BookingRule {
  freq: string
  endDate?: number
  count?: number
  interval?: number
  bySecond?: number[]
  byMinute?: number[]
  byHour?: number[]
  byDay?: string[]
  byMonthDay?: number[]
  byYearDay?: number[]
  byWeekNo?: number[]
  byMonth?: number[]
  bySetPos?: number[]
}

// Structural subset of calendar Event, ReccuringEvent and ReccuringInstance with the booking attributes.
export interface BookingEvent {
  _id: string
  eventId: string
  date: number
  dueDate: number
  allDay: boolean
  access: string
  timeZone?: string
  rules?: BookingRule[]
  exdate?: number[]
  rdate?: number[]
  recurringEventId?: string
  originalStartTime?: number
  isCancelled?: boolean
  servoneResource?: string
  servoneBookingState?: string
}

export interface Interval {
  start: number
  end: number
}

export function holdsSlot (state: string | undefined): boolean {
  return state !== undefined && HOLDING_STATES.includes(state)
}

export function initialBookingState (resource: Pick<BookableResource, 'needsApproval'>): BookingState {
  return resource.needsApproval ? 'pending' : 'confirmed'
}

export function overlaps (a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

// Exactly the rules Lịch's repeat picker writes; anything else would be expanded wrong, so the guard refuses it.
// Lịch's repeat picker writes byMonthDay (MONTHLY) and a 0-based byMonth (YEARLY, Huly's getMonth convention) taken
// from the start; ruleStarts repeats on the start's day and month, so only that exact value expands the same way.
export function isSupportedRule (rules: BookingRule[] | undefined, start: number, timeZone: string): boolean {
  if (rules === undefined || rules.length === 0) return true
  if (rules.length > 1) return false
  const [rule] = rules
  if (!EXPANDABLE_FREQS.includes(rule.freq)) return false
  if (rule.interval !== undefined && !(Number.isInteger(rule.interval) && rule.interval > 0)) return false
  if (UNSUPPORTED_RULE_PARTS.some((part) => rule[part] !== undefined)) return false
  const wall = new Date(wallOf(start, timeZone))
  if (rule.byMonthDay !== undefined && !(rule.freq === 'MONTHLY' && isOnly(rule.byMonthDay, wall.getUTCDate()))) return false
  if (rule.byMonth !== undefined && !(rule.freq === 'YEARLY' && isOnly(rule.byMonth, wall.getUTCMonth()))) return false
  if (rule.byDay === undefined) return true
  return rule.freq === 'WEEKLY' && rule.byDay.length > 0 && rule.byDay.every((day) => WEEKDAYS.includes(day))
}

function isOnly (values: number[], expected: number): boolean {
  return values.length === 1 && values[0] === expected
}

const formatters = new Map<string, Intl.DateTimeFormat>()

// The instant's wall clock in `timeZone`, encoded as if that wall clock were UTC.
function wallOf (instant: number, timeZone: string): number {
  let formatter = formatters.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
    formatters.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'), new Date(instant).getUTCMilliseconds())
}

function instantOf (wall: number, timeZone: string): number {
  const guess = wall - (wallOf(wall, timeZone) - wall)
  return wall - (wallOf(guess, timeZone) - guess)
}

function addWallDays (wall: number, days: number): number {
  return wall + days * DAY_MS
}

// Huly's own semantics (plugins/calendar utils generateWeeklyValues): a weekly period is the 7 days from the start, not from WKST.
function periodWalls (rule: BookingRule, wall: number, period: number, weekDays: string[]): { base: number, walls: number[] } {
  const d = new Date(wall)
  const time = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()] as const
  switch (rule.freq) {
    case 'DAILY': {
      const base = addWallDays(wall, period)
      return { base, walls: [base] }
    }
    case 'WEEKLY': {
      const base = addWallDays(wall, period * 7)
      const walls = [0, 1, 2, 3, 4, 5, 6].map((i) => addWallDays(base, i)).filter((w) => weekDays.includes(WEEKDAYS[new Date(w).getUTCDay()]))
      return { base, walls }
    }
    case 'MONTHLY': {
      const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + period, d.getUTCDate(), ...time)
      return { base, walls: new Date(base).getUTCDate() === d.getUTCDate() ? [base] : [] }
    }
    default: {
      const base = Date.UTC(d.getUTCFullYear() + period, d.getUTCMonth(), d.getUTCDate(), ...time)
      return { base, walls: new Date(base).getUTCMonth() === d.getUTCMonth() ? [base] : [] }
    }
  }
}

function ruleStarts (rule: BookingRule, start: number, timeZone: string, until: number): number[] {
  const wall = wallOf(start, timeZone)
  const step = rule.interval ?? 1
  const weekDays = rule.byDay ?? [WEEKDAYS[new Date(wall).getUTCDay()]]
  const starts: number[] = []
  for (let period = 0; ; period += step) {
    const { base, walls } = periodWalls(rule, wall, period, weekDays)
    if (instantOf(base, timeZone) > until) return starts
    for (const w of walls) {
      const at = instantOf(w, timeZone)
      if (at > until || (rule.endDate !== undefined && at > rule.endDate)) return starts
      starts.push(at)
      if (rule.count !== undefined && starts.length >= rule.count) return starts
    }
  }
}

function seriesKey (event: BookingEvent): string {
  return event.recurringEventId ?? event.eventId
}

function isSeries (event: BookingEvent): boolean {
  return (event.rules ?? []).length > 0 && event.recurringEventId === undefined
}

function holds (event: BookingEvent, resource: string): boolean {
  return (
    event.access === 'owner' &&
    event.isCancelled !== true &&
    event.servoneResource === resource &&
    holdsSlot(event.servoneBookingState)
  )
}

// Occurrences of every event in `events` that hold `resource` within `window`. An instance replaces the occurrence
// of its series at originalStartTime, whether or not the instance itself still holds the resource.
export function bookingIntervals (events: BookingEvent[], resource: string, window: Interval): Array<Interval & { _id: string }> {
  const replaced = new Map<string, Set<number>>()
  for (const e of events) {
    if (e.recurringEventId === undefined || e.originalStartTime === undefined) continue
    replaced.set(e.recurringEventId, (replaced.get(e.recurringEventId) ?? new Set()).add(e.originalStartTime))
  }
  const found: Array<Interval & { _id: string }> = []
  for (const e of events) {
    if (!holds(e, resource)) continue
    const length = e.dueDate - e.date
    const starts = isSeries(e) ? seriesStarts(e, window.end, replaced.get(e.eventId)) : [e.date]
    for (const start of starts) {
      const occurrence = { _id: e._id, start, end: start + length }
      if (overlaps(occurrence, window)) found.push(occurrence)
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

function seriesStarts (series: BookingEvent, until: number, replaced = new Set<number>()): number[] {
  const [rule] = series.rules ?? []
  const excluded = new Set([...(series.exdate ?? []), ...replaced])
  const starts = [...ruleStarts(rule, series.date, series.timeZone ?? 'UTC', until), ...(series.rdate ?? [])]
  return [...new Set(starts)].filter((start) => !excluded.has(start))
}

export function bookingWindow (candidate: Pick<BookingEvent, 'date'>, now: number): Interval {
  return { start: Math.min(now, candidate.date), end: Math.max(now, candidate.date) + BOOKING_WINDOW_DAYS * DAY_MS }
}

// Holding time of other bookings of the candidate's resource; the candidate's own series never blocks it.
export function busyIntervals (candidate: BookingEvent, existing: BookingEvent[], window: Interval): Interval[] {
  const resource = candidate.servoneResource
  if (resource === undefined) return []
  const others = existing.filter((e) => seriesKey(e) !== seriesKey(candidate))
  return bookingIntervals(others, resource, window).map(({ start, end }) => ({ start, end }))
}

// Candidate occurrences that overlap another holding booking of the same resource; empty means it may be saved.
export function isBeyondWindow (start: number, now: number): boolean {
  return start > now + BOOKING_WINDOW_DAYS * DAY_MS
}

export function findClashes (candidate: BookingEvent, existing: BookingEvent[], window: Interval): Interval[] {
  const resource = candidate.servoneResource
  if (resource === undefined) return []
  const own = existing.filter((e) => seriesKey(e) === seriesKey(candidate) && e._id !== candidate._id)
  const mine = bookingIntervals([candidate, ...own], resource, window).filter((it) => it._id === candidate._id)
  const busy = busyIntervals(candidate, existing, window)
  return mine.filter((it) => busy.some((b) => overlaps(it, b))).map(({ start, end }) => ({ start, end }))
}

// True when `after` holds no time that `before` did not, so the change needs neither a clash check nor new approval.
export function isShrink (before: BookingEvent, after: BookingEvent, window: Interval): boolean {
  const resource = after.servoneResource
  if (resource === undefined) return true
  const held = new Set(bookingIntervals([before], resource, window).map((it) => `${it.start}-${it.end}`))
  return bookingIntervals([after], resource, window).every((it) => held.has(`${it.start}-${it.end}`))
}

// Nearest free slots of the same length within `day` (the caller's local day), on 30-minute steps from its start.
export function suggestSlots (want: Interval, busy: Interval[], now: number, day: Interval): Interval[] {
  const length = want.end - want.start
  const slots: Interval[] = []
  for (let start = day.start; start + length <= day.end; start += SUGGEST_STEP_MS) {
    const slot = { start, end: start + length }
    if (start < now || start === want.start || busy.some((b) => overlaps(slot, b))) continue
    slots.push(slot)
  }
  const distance = (slot: Interval): number => Math.abs(slot.start - want.start)
  return slots.sort((a, b) => distance(a) - distance(b) || a.start - b.start).slice(0, MAX_SUGGESTIONS)
}
