import type { PushSetting } from './push-setting'

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export interface WorkingSchedule {
  // 0 = Sunday .. 6 = Saturday; an overnight range belongs to the day it starts on.
  days: number[]
  start: string
  end: string
  timeZone: string
}

// Stored with the flag so turning working hours off keeps the chosen times.
export interface StoredSchedule extends WorkingSchedule {
  isEnabled: boolean
}

export const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export function defaultSchedule (timeZone: string): StoredSchedule {
  return { isEnabled: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '17:30', timeZone }
}

export function isTimeZone (timeZone: string): boolean {
  try {
    formatter(timeZone)
    return true
  } catch (err) {
    if (err instanceof RangeError) return false
    throw err
  }
}

function parseDays (stored: unknown): number[] | undefined {
  if (!Array.isArray(stored)) return undefined
  const days = new Set<number>()
  for (const day of stored) {
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return undefined
    days.add(day)
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : undefined
}

export function isTime (text: string): boolean {
  return TIME.test(text)
}

function parseTime (stored: unknown): string | undefined {
  return typeof stored === 'string' && isTime(stored) ? stored : undefined
}

// Returns the stored schedule whether or not it is switched on; undefined when missing or malformed.
export function parseStoredSchedule (setting: PushSetting | undefined): StoredSchedule | undefined {
  const stored = setting?.servoneSchedule
  if (typeof stored !== 'object' || stored === null) return undefined
  if (!('isEnabled' in stored && 'days' in stored && 'start' in stored && 'end' in stored && 'timeZone' in stored)) {
    return undefined
  }
  const days = parseDays(stored.days)
  const start = parseTime(stored.start)
  const end = parseTime(stored.end)
  const timeZone = stored.timeZone
  if (days === undefined || start === undefined || end === undefined || start === end) return undefined
  if (typeof stored.isEnabled !== 'boolean' || typeof timeZone !== 'string' || !isTimeZone(timeZone)) return undefined
  return { isEnabled: stored.isEnabled, days, start, end, timeZone }
}

// The schedule to enforce, or undefined when working hours are off: then every hour is working time.
export function parseSchedule (setting: PushSetting | undefined): WorkingSchedule | undefined {
  const stored = parseStoredSchedule(setting)
  if (stored === undefined || !stored.isEnabled) return undefined
  return { days: stored.days, start: stored.start, end: stored.end, timeZone: stored.timeZone }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter (timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)
  if (cached !== undefined) return cached
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  })
  formatters.set(timeZone, created)
  return created
}

interface WallClock {
  year: number
  month: number
  day: number
  minutes: number
}

function wallClock (at: number, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(new Date(at))
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    minutes: part('hour') * 60 + part('minute')
  }
}

function minutesOf (time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function weekdayOf (clock: WallClock): number {
  return new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay()
}

export function isWorkingTime (schedule: WorkingSchedule, now: number): boolean {
  const clock = wallClock(now, schedule.timeZone)
  const weekday = weekdayOf(clock)
  const start = minutesOf(schedule.start)
  const end = minutesOf(schedule.end)
  if (start < end) return schedule.days.includes(weekday) && clock.minutes >= start && clock.minutes < end
  const yesterday = (weekday + 6) % 7
  return (
    (schedule.days.includes(weekday) && clock.minutes >= start) ||
    (schedule.days.includes(yesterday) && clock.minutes < end)
  )
}
