import type { Slot, Timed } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000

export function startOfDay (ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays (ts: number, n: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function startOfWeek (ts: number, firstDayOfWeek: number): number {
  const d = new Date(startOfDay(ts))
  d.setDate(d.getDate() - ((d.getDay() - firstDayOfWeek + 7) % 7))
  return d.getTime()
}

function utcWallToLocal (ts: number): number {
  const d = new Date(ts)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()).getTime()
}

export function spanOf (e: Timed): Slot {
  if (!e.allDay) return { start: e.date, end: e.dueDate }
  return { start: utcWallToLocal(e.date), end: utcWallToLocal(e.dueDate) }
}

export function daysCovered (e: Timed): number[] {
  const { start, end } = spanOf(e)
  const last = startOfDay(Math.max(start, end - 1))
  const days: number[] = []
  for (let day = startOfDay(start); day <= last; day = addDays(day, 1)) days.push(day)
  return days
}

export function groupByDay<T extends Timed> (events: T[]): Map<number, T[]> {
  const sorted = [...events].sort((a, b) => Number(b.allDay) - Number(a.allDay) || spanOf(a).start - spanOf(b).start)
  const byDay = new Map<number, T[]>()
  for (const e of sorted) {
    for (const day of daysCovered(e)) byDay.set(day, [...(byDay.get(day) ?? []), e])
  }
  return byDay
}

export function nextHourSlot (day: number, now: number, duration: number): Slot {
  const next = new Date(now)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  const start = new Date(startOfDay(day))
  start.setHours(next.getHours())
  return { start: start.getTime(), end: start.getTime() + duration }
}

export function workingSlot (now: number, duration: number): Slot {
  const nextHour = new Date(now)
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
  const lastHourToday = new Date(now)
  lastHourToday.setHours(23, 0, 0, 0)
  const start = Math.min(nextHour.getTime(), lastHourToday.getTime())
  return { start, end: start + duration }
}

export function allDaySlot (day: number): Slot {
  const start = startOfDay(day)
  return { start, end: new Date(start).setHours(23, 59, 59, 999) }
}
