import type { Timestamp } from '@hcengineering/core'

const MINUTE = 60_000

export function zoneOffsetMinutes (timeZone: string, at: Timestamp): number | undefined {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).formatToParts(new Date(at))
  } catch (err) {
    if (err instanceof RangeError) return undefined
    throw err
  }
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
  const atMinute = Math.floor(at / MINUTE) * MINUTE
  return Math.round((wall - atMinute) / MINUTE)
}

export function hoursAheadOfViewer (timeZone: string, at: Timestamp): number | undefined {
  const theirs = zoneOffsetMinutes(timeZone, at)
  if (theirs === undefined) return undefined
  const mine = -new Date(at).getTimezoneOffset()
  return (theirs - mine) / 60
}

export function formatHours (hours: number): string {
  return String(Math.round(Math.abs(hours) * 100) / 100)
}
