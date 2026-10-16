import { addDays, groupByDay, startOfDay } from './time'
import type { Timed } from './types'

export interface AgendaDay<T> {
  day: number
  events: T[]
}

export function agendaDays<T extends Timed> (events: T[], from: number, days: number): Array<AgendaDay<T>> {
  const byDay = groupByDay(events)
  const first = startOfDay(from)
  const listed: Array<AgendaDay<T>> = []
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i)
    const onDay = byDay.get(day)
    if (onDay !== undefined) listed.push({ day, events: onDay })
  }
  return listed
}
