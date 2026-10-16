import type { Issue } from '@hcengineering/tracker'
import { DAY } from './lib/types'

export function fmtDate (t: number | null | undefined): string {
  if (t === null || t === undefined) return '—'
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function fmtRange (start: number | null | undefined, end: number | null | undefined): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

export function startOfDay (t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole days from today to the target day; negative once it's passed. */
export function daysLeft (targetDate: number, now: number = Date.now()): number {
  return Math.round((startOfDay(targetDate) - startOfDay(now)) / DAY)
}

export function byRank (a: Pick<Issue, 'rank'>, b: Pick<Issue, 'rank'>): number {
  return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
}

export const DRAG_TYPE = 'application/x-servone-issues'
