import type { Timestamp } from '@hcengineering/core'

const MINUTE = 60_000
const MORNING_HOUR = 9
const EARLY_CUTOFF_HOUR = 6

export type RemindPreset = 'in20m' | 'in1h' | 'morning'

export const REMIND_PRESETS: RemindPreset[] = ['in20m', 'in1h', 'morning']

export function isMorningToday (now: Timestamp): boolean {
  return new Date(now).getHours() < EARLY_CUTOFF_HOUR
}

export function remindAt (preset: RemindPreset, now: Timestamp): Timestamp {
  switch (preset) {
    case 'in20m':
      return now + 20 * MINUTE
    case 'in1h':
      return now + 60 * MINUTE
    case 'morning': {
      const day = new Date(now)
      if (!isMorningToday(now)) day.setDate(day.getDate() + 1)
      day.setHours(MORNING_HOUR, 0, 0, 0)
      return day.getTime()
    }
  }
}

export function isValidRemindAt (at: Timestamp, now: Timestamp): boolean {
  return Number.isFinite(at) && at > now
}

export function formatRemindTime (at: Timestamp, now: Timestamp, locale: string | undefined): string {
  const end = new Date(at)
  const isSameDay = new Date(now).toDateString() === end.toDateString()
  return end.toLocaleString(
    locale,
    isSameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  )
}
