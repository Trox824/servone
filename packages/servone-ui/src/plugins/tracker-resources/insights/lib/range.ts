import type { DateRange } from './types'

const DAYS_IN_WEEK = 7
const LAST_30_DAYS_BACK = 29

function dayStart (t: number, addDays = 0): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + addDays)
  return d.getTime()
}

function mondayOf (t: number): number {
  const sinceMonday = (new Date(t).getDay() + DAYS_IN_WEEK - 1) % DAYS_IN_WEEK
  return dayStart(t, -sinceMonday)
}

/** `[from, to)` in local time; every preset ends with today. */
export function rangeBounds (range: DateRange, now: number): { from: number, to: number } {
  const to = dayStart(now, 1)
  switch (range.preset) {
    case 'thisWeek':
      return { from: mondayOf(now), to }
    case 'last2Weeks':
      return { from: dayStart(mondayOf(now), -DAYS_IN_WEEK), to }
    case 'thisMonth': {
      const d = new Date(now)
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to }
    }
    case 'last30Days':
      return { from: dayStart(now, -LAST_30_DAYS_BACK), to }
    case 'custom':
      return { from: range.from, to: range.to }
  }
}
