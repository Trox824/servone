import calendar, { AccessLevel, type Calendar, type Event, generateEventId, getAllEvents, getPrimaryCalendar } from '@hcengineering/calendar'
import contact, { type Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import { EmptyMarkup, jsonToMarkup } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import { z } from 'zod'

import { defineTool, ToolInputError } from '../tool'
import type { SessionClient, WorkspaceSession } from '../types'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
// Bounds recurrence expansion and output per call; two months covers any month view.
const MAX_RANGE_DAYS = 62
// Must match DEFAULT_TIMED_REMINDER in servone-ui lich/lib/reminders.ts; per-calendar defaults are not read here.
const DEFAULT_TIMED_REMINDER = 10 * MINUTE_MS
const MAX_TITLE_CHARS = 255

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function checkTimeZone (timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone
  } catch (err) {
    if (err instanceof RangeError) throw new ToolInputError(`Unknown time zone "${timeZone}". Use an IANA name such as Europe/Berlin`)
    throw err
  }
}

function wallTime (ms: number, timeZone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(ms)
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') }
}

function wallAsUtc (wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
}

// Second pass corrects the guess when the offset differs across a DST switch.
function zonedToUtc (wall: WallTime, timeZone: string): number {
  const target = wallAsUtc(wall)
  let guess = target
  for (let pass = 0; pass < 2; pass++) guess = target - (wallAsUtc(wallTime(guess, timeZone)) - guess)
  return guess
}

function parseInstant (raw: string, field: string, timeZone: string): number {
  const text = raw.trim()
  const local = LOCAL_DATE_TIME.exec(text) ?? DATE_ONLY.exec(text)
  if (local !== null && !HAS_OFFSET.test(text)) {
    const [, year, month, day, hour, minute, second] = local
    return zonedToUtc(
      { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour ?? 0), minute: Number(minute ?? 0), second: Number(second ?? 0) },
      timeZone
    )
  }
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) throw new ToolInputError(`${field} must be an ISO 8601 date or date-time, got "${raw}"`)
  return ms
}

// All-day events are stored as UTC midnight of their calendar day (upstream saveUTC).
function parseDay (raw: string, field: string, timeZone: string): number {
  const date = DATE_ONLY.exec(raw.trim())
  if (date !== null) return Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]))
  const wall = wallTime(parseInstant(raw, field, timeZone), timeZone)
  return Date.UTC(wall.year, wall.month - 1, wall.day)
}

const pad = (n: number): string => String(n).padStart(2, '0')
const dayText = (w: WallTime): string => `${w.year}-${pad(w.month)}-${pad(w.day)}`
const clockText = (w: WallTime): string => `${pad(w.hour)}:${pad(w.minute)}`

function whenText (event: Pick<Event, 'allDay' | 'date' | 'dueDate'>, timeZone: string): string {
  if (event.allDay) {
    const first = dayText(wallTime(event.date, 'UTC'))
    const last = dayText(wallTime(Math.max(event.date, event.dueDate - 1), 'UTC'))
    return first === last ? `${first} all day` : `${first} - ${last} all day`
  }
  const start = wallTime(event.date, timeZone)
  const end = wallTime(event.dueDate, timeZone)
  if (dayText(start) === dayText(end)) return `${dayText(start)} ${clockText(start)}-${clockText(end)}`
  return `${dayText(start)} ${clockText(start)} - ${dayText(end)} ${clockText(end)}`
}

const timeZoneInput = z
  .string()
  .optional()
  .describe('IANA time zone (e.g. Asia/Ho_Chi_Minh). Used for date-times without an offset and for printed times. Default UTC.')

const listEvents = defineTool({
  name: 'list_events',
  title: 'List calendar events',
  description:
    "List events in the caller's own calendars between two instants, with recurring events expanded into occurrences. " +
    'from/to are ISO 8601 dates or date-times; a value without an offset (e.g. 2026-09-25 or 2026-09-25T09:00) is read in timeZone. ' +
    `Range at most ${MAX_RANGE_DAYS} days. Output: one line per occurrence, "YYYY-MM-DD HH:mm-HH:mm  Title  (location)", times in timeZone; all-day events show their date.`,
  input: z.object({
    from: z.string().describe('Range start, ISO 8601, inclusive'),
    to: z.string().describe('Range end, ISO 8601, exclusive'),
    timeZone: timeZoneInput
  }),
  annotations: { readOnlyHint: true },
  run: async (session, args) => {
    const timeZone = checkTimeZone(args.timeZone ?? 'UTC')
    const from = parseInstant(args.from, 'from', timeZone)
    const to = parseInstant(args.to, 'to', timeZone)
    if (to <= from) throw new ToolInputError('to must be after from')
    if (to - from > MAX_RANGE_DAYS * DAY_MS) throw new ToolInputError(`Range is longer than ${MAX_RANGE_DAYS} days; split it into smaller ranges`)

    const { client, account } = session
    const calendars = await client.findAll(calendar.class.Calendar, { createdBy: { $in: account.socialIds }, hidden: false })
    const ids = calendars.map((c) => c._id)
    const [inRange, series] = await Promise.all([
      client.findAll(calendar.class.Event, { calendar: { $in: ids }, date: { $lt: to }, dueDate: { $gt: from } }),
      client.findAll(calendar.class.ReccuringEvent, { calendar: { $in: ids }, _class: calendar.class.ReccuringEvent })
    ])
    const byId = new Map<Ref<Event>, Event>([...inRange, ...series].map((e) => [e._id, e]))
    // getAllEvents clamps times to the range; stored events print their real times.
    const occurrences = getAllEvents([...byId.values()], from, to).map((e) => byId.get(e._id) ?? e)

    const header = `Events ${whenText({ allDay: false, date: from, dueDate: to }, timeZone)} (${timeZone}):`
    if (occurrences.length === 0) return `${header}\nNo events`
    const lines = occurrences.map((e) => {
      const location = e.location !== undefined && e.location !== '' ? `  (${e.location})` : ''
      return `${whenText(e, timeZone)}  ${e.title}${location}`
    })
    return [header, ...lines].join('\n')
  }
})

type Lookup = { person: Ref<Person> } | { problem: string }

async function resolveParticipant (client: SessionClient, raw: string): Promise<Lookup> {
  const query = raw.trim()
  if (query.includes('@')) {
    const identity = await client.findOne(contact.class.SocialIdentity, { key: `email:${query.toLowerCase()}` })
    return identity === undefined ? { problem: `${raw} (no member with this email)` } : { person: identity.attachedTo }
  }
  const words = query.toLowerCase().split(/[\s,]+/).filter((w) => w !== '')
  if (words.length === 0) return { problem: `"${raw}" (empty)` }
  // Names are stored as "Last,First", so match every word anywhere instead of the whole string.
  const candidates = await client.findAll(contact.mixin.Employee, { active: true, name: { $like: `%${words[0]}%` } })
  const matches = candidates.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)))
  if (matches.length === 1) return { person: matches[0]._id }
  if (matches.length === 0) return { problem: `${raw} (no member with this name)` }
  return { problem: `${raw} (matches ${matches.length} members, use an email)` }
}

async function writableCalendar (session: WorkspaceSession): Promise<Ref<Calendar>> {
  const { client, account } = session
  const own = await client.findAll(calendar.class.Calendar, { createdBy: { $in: account.socialIds }, hidden: false })
  const writable = own.filter(
    (c) => account.socialIds.includes(c.user) && (c.access === AccessLevel.Owner || c.access === AccessLevel.Writer)
  )
  const preference = await client.findOne(calendar.class.PrimaryCalendar, {})
  const primary = getPrimaryCalendar(writable, preference, account.uuid)
  if (writable.some((c) => c._id === primary)) return primary
  if (writable.length > 0) return writable[0]._id
  throw new ToolInputError('You have no writable calendar')
}

const createEvent = defineTool({
  name: 'create_event',
  title: 'Create calendar event',
  description:
    "Create a one-off event in the caller's primary calendar; the caller is always a participant. " +
    'start/end are ISO 8601 date-times; a value without an offset is read in timeZone. For allDay events pass dates (YYYY-MM-DD); end is the last day, inclusive. ' +
    'participants are workspace members as emails (preferred) or full names; any unresolved name fails the call without creating anything. ' +
    'description is markdown. Returns a one-line confirmation.',
  input: z.object({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    start: z.string().describe('ISO 8601 start'),
    end: z.string().describe('ISO 8601 end; after start (allDay: same day or later)'),
    allDay: z.boolean().default(false),
    location: z.string().optional(),
    description: z.string().optional().describe('Markdown'),
    participants: z.array(z.string()).optional().describe('Emails or full names of workspace members'),
    timeZone: timeZoneInput
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  run: async (session, args) => {
    const timeZone = checkTimeZone(args.timeZone ?? 'UTC')
    let date: number
    let dueDate: number
    if (args.allDay) {
      date = parseDay(args.start, 'start', timeZone)
      // Upstream all-day events end at 23:59:59.999 of their last day.
      dueDate = parseDay(args.end, 'end', timeZone) + DAY_MS - 1
      if (dueDate < date) throw new ToolInputError('end must be on or after start')
    } else {
      date = parseInstant(args.start, 'start', timeZone)
      dueDate = parseInstant(args.end, 'end', timeZone)
      if (dueDate <= date) throw new ToolInputError('end must be after start')
    }

    const lookups = await Promise.all((args.participants ?? []).map(async (p) => await resolveParticipant(session.client, p)))
    const problems = lookups.flatMap((l) => ('problem' in l ? [l.problem] : []))
    if (problems.length > 0) throw new ToolInputError(`Could not resolve participants: ${problems.join('; ')}`)
    const participants = [...new Set([session.person, ...lookups.flatMap((l) => ('person' in l ? [l.person] : []))])]

    const calendarId = await writableCalendar(session)
    const description = args.description === undefined ? EmptyMarkup : jsonToMarkup(markdownToMarkup(args.description))
    await session.client.addCollection(calendar.class.Event, calendar.space.Calendar, calendar.ids.NoAttached, calendar.class.Event, 'events', {
      calendar: calendarId,
      eventId: generateEventId(),
      title: args.title,
      date,
      dueDate,
      allDay: args.allDay,
      participants,
      externalParticipants: [],
      reminders: args.allDay ? [] : [DEFAULT_TIMED_REMINDER],
      location: args.location,
      description,
      // Matches the UI default: timed events show as busy, all-day ones as free.
      blockTime: !args.allDay,
      access: AccessLevel.Owner,
      timeZone,
      user: session.account.primarySocialId
    })
    return `Created event "${args.title}" ${whenText({ allDay: args.allDay, date, dueDate }, timeZone)} (${timeZone}) with ${participants.length} participant(s)`
  }
})

export const calendarTools = [listEvents, createEvent]
