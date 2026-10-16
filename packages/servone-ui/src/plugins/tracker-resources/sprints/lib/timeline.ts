import { DAY } from './types'

export type TimelineScale = 'weeks' | 'months' | 'quarters'

/** Pixels per day at each zoom. */
export const DAY_WIDTH: Record<TimelineScale, number> = { weeks: 32, months: 10, quarters: 3.5 }

export interface Span {
  start: number
  end: number
}

export interface DatedWork {
  startDate?: number | null
  dueDate?: number | null
  milestone?: string | null
}

export interface SprintDates {
  startDate: number | null
  targetDate: number
}

export function dayStart (t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function given (v: number | null | undefined): v is number {
  return v !== null && v !== undefined
}

export function spanOf (work: DatedWork, sprints: Map<string, SprintDates>): Span | undefined {
  const sprint = typeof work.milestone === 'string' ? sprints.get(work.milestone) : undefined
  let start: number | undefined
  let end: number | undefined
  if (given(work.startDate)) {
    start = work.startDate
    end = given(work.dueDate) ? work.dueDate : sprint?.targetDate ?? start
  } else if (sprint !== undefined) {
    start = sprint.startDate ?? sprint.targetDate
    end = Math.max(sprint.targetDate, given(work.dueDate) ? work.dueDate : 0)
  } else if (given(work.dueDate)) {
    start = end = work.dueDate
  }
  if (start === undefined || end === undefined) return undefined
  return { start: dayStart(Math.min(start, end)), end: dayStart(Math.max(start, end)) }
}

export function unionOf (spans: Array<Span | undefined>): Span | undefined {
  let out: Span | undefined
  for (const s of spans) {
    if (s === undefined) continue
    out = out === undefined ? { ...s } : { start: Math.min(out.start, s.start), end: Math.max(out.end, s.end) }
  }
  return out
}

function monthStart (t: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function addMonths (t: number, n: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()
}

/** Whole months around all work and today, plus a month either side (a quarter at Quarters zoom). */
export function rangeOf (spans: Array<Span | undefined>, today: number, scale: TimelineScale): Span {
  const all = unionOf([...spans, { start: today, end: today }]) as Span
  const pad = scale === 'quarters' ? 3 : 1
  let start = addMonths(monthStart(all.start), -pad)
  if (scale === 'quarters') start = addMonths(start, -(new Date(start).getMonth() % 3))
  let end = addMonths(monthStart(all.end), pad + 1)
  if (scale === 'quarters') {
    const m = new Date(end).getMonth() % 3
    if (m !== 0) end = addMonths(end, 3 - m)
  }
  return { start, end }
}

/** Whole days from `from` to `t`, safe across daylight-saving changes. */
export function daysBetween (from: number, t: number): number {
  return Math.round((dayStart(t) - dayStart(from)) / DAY)
}

export interface Tick {
  at: number
  label: string
  /** Offset and width in days from the range start. */
  offset: number
  days: number
}

function tick (range: Span, at: number, next: number, label: string): Tick {
  const from = Math.max(at, range.start)
  const to = Math.min(next, range.end)
  return { at, label, offset: daysBetween(range.start, from), days: daysBetween(from, to) }
}

/** Header ticks: the upper band (months, or quarters) and the lower band (weeks, months, or none at the Months zoom). */
export function ticksOf (range: Span, scale: TimelineScale, locale?: string): { upper: Tick[], lower: Tick[] } {
  const upper: Tick[] = []
  const lower: Tick[] = []
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' })
  const monthYearFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  if (scale === 'quarters') {
    for (let t = range.start; t < range.end; t = addMonths(t, 3)) {
      const d = new Date(t)
      upper.push(tick(range, t, addMonths(t, 3), `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`))
    }
  } else {
    for (let t = range.start; t < range.end; t = addMonths(t, 1)) {
      upper.push(tick(range, t, addMonths(t, 1), monthYearFmt.format(t)))
    }
  }
  if (scale === 'weeks') {
    const first = new Date(range.start)
    const monday = dayStart(new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7)).getTime())
    for (let t = monday; t < range.end; t = dayStart(t + 7 * DAY + DAY / 2)) {
      const next = dayStart(t + 7 * DAY + DAY / 2)
      lower.push(tick(range, t, next, String(new Date(t).getDate())))
    }
  } else if (scale === 'quarters') {
    for (let t = range.start; t < range.end; t = addMonths(t, 1)) {
      lower.push(tick(range, t, addMonths(t, 1), monthFmt.format(t)))
    }
  }
  return { upper, lower: lower.filter((t) => t.days > 0) }
}
