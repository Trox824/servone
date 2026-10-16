import { addDays, groupByDay, startOfDay } from './time'
import type { Timed } from './types'
import { MONTH_GRID_DAYS, rangeOf } from './view'

export const MONTH_CELL_LIMIT = 3

export interface MonthCell<T> {
  day: number
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
  shown: T[]
  more: number
}

export function monthCells<T extends Timed> (anchor: number, events: T[], firstDayOfWeek: number, now: number): Array<MonthCell<T>> {
  const { start } = rangeOf('thang', anchor, firstDayOfWeek)
  const month = new Date(anchor).getMonth()
  const today = startOfDay(now)
  const byDay = groupByDay(events)
  return Array.from({ length: MONTH_GRID_DAYS }, (_, i) => {
    const day = addDays(start, i)
    const onDay = byDay.get(day) ?? []
    const weekday = new Date(day).getDay()
    return {
      day,
      inMonth: new Date(day).getMonth() === month,
      isToday: day === today,
      isWeekend: weekday === 0 || weekday === 6,
      shown: onDay.slice(0, MONTH_CELL_LIMIT),
      more: Math.max(0, onDay.length - MONTH_CELL_LIMIT)
    }
  })
}
