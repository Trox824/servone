import type { Timestamp } from '@hcengineering/core'

export function isPushOn (settings: Array<{ enabled: boolean }>, defaultEnabled: boolean): boolean {
  return settings.length === 0 ? defaultEnabled : settings.some((setting) => setting.enabled)
}

export function parseLocalDateTime (text: string): Timestamp | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text)
  if (match === null) return undefined
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day, hour, minute)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date.getTime()
}

export function toLocalDateTime (at: Timestamp): string {
  const d = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatPauseTime (until: Timestamp, now: Timestamp, locale: string | undefined): string {
  const end = new Date(until)
  const sameDay = new Date(now).toDateString() === end.toDateString()
  return end.toLocaleString(
    locale,
    sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  )
}
