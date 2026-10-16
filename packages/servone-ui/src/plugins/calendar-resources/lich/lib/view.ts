import { addDays, startOfDay, startOfWeek } from './time'
import type { Page, Slot, View } from './types'

export const VIEWS: readonly View[] = ['ngay', 'tuan', 'thang', 'lich-bieu']
export const PHONE_VIEWS: readonly View[] = ['ngay', 'ba-ngay', 'thang', 'lich-bieu']
const ALL_VIEWS: readonly View[] = [...VIEWS, 'ba-ngay']
const PAGES: readonly Page[] = [...ALL_VIEWS, 'chia-se', 'tim-kiem', 'tai-nguyen']
const THREE_DAYS = 3
export const AGENDA_DAYS = 30
export const MONTH_GRID_DAYS = 42

export function isView (segment: string | undefined): segment is View {
  return ALL_VIEWS.some((v) => v === segment)
}

export function parsePage (segment: string | undefined, fallback: View): Page {
  return PAGES.find((p) => p === segment) ?? fallback
}

function firstOfMonth (ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export function rangeOf (view: View, anchor: number, firstDayOfWeek: number, agendaDays = AGENDA_DAYS): Slot {
  switch (view) {
    case 'ngay': {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, 1) }
    }
    case 'ba-ngay': {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, THREE_DAYS) }
    }
    case 'tuan': {
      const start = startOfWeek(anchor, firstDayOfWeek)
      return { start, end: addDays(start, 7) }
    }
    case 'thang': {
      const start = startOfWeek(firstOfMonth(anchor), firstDayOfWeek)
      return { start, end: addDays(start, MONTH_GRID_DAYS) }
    }
    case 'lich-bieu': {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, agendaDays) }
    }
  }
}

export function shift (view: View, anchor: number, dir: 1 | -1): number {
  switch (view) {
    case 'ngay':
      return addDays(anchor, dir)
    case 'ba-ngay':
      return addDays(anchor, THREE_DAYS * dir)
    case 'tuan':
      return addDays(anchor, 7 * dir)
    case 'thang': {
      const d = new Date(anchor)
      return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime()
    }
    case 'lich-bieu':
      return addDays(anchor, AGENDA_DAYS * dir)
  }
}
