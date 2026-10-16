import type { Lang } from '../../lib/types'

export const SLOT_MINUTES = 15
const DAY_MINUTES = 24 * 60
const MINUTE_MS = 60 * 1000

const pad = (n: number): string => String(n).padStart(2, '0')

export function minutesOfDay (ts: number): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

export function atMinutes (day: number, minutes: number): number {
  const d = new Date(day)
  d.setHours(0, minutes, 0, 0)
  return d.getTime()
}

export function daySlots (current: number): number[] {
  const slots = Array.from({ length: DAY_MINUTES / SLOT_MINUTES }, (_, i) => i * SLOT_MINUTES)
  return slots.includes(current) ? slots : [...slots, current].sort((a, b) => a - b)
}

export function hm (minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function durationText (ms: number, lang: Lang): string {
  const total = Math.max(0, Math.round(ms / MINUTE_MS))
  const days = Math.floor(total / DAY_MINUTES)
  const hours = Math.floor((total % DAY_MINUTES) / 60)
  const minutes = total % 60
  const units = lang === 'vi' ? { d: 'ngày', h: 'giờ', m: 'phút' } : { d: 'd', h: 'h', m: 'min' }
  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${units.d}`)
  if (hours > 0) parts.push(`${hours} ${units.h}`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${units.m}`)
  return parts.join(' ')
}

export function beforeText (ms: number, lang: Lang): string {
  if (lang === 'vi') return `${durationText(ms, lang)} trước`
  const units: Array<[number, string]> = [[DAY_MINUTES * MINUTE_MS, 'day'], [60 * MINUTE_MS, 'hour'], [MINUTE_MS, 'minute']]
  const unit = units.find(([size]) => ms >= size) ?? units[2]
  if (ms % unit[0] !== 0) return `${durationText(ms, lang)} before`
  const count = ms / unit[0]
  return `${count} ${unit[1]}${count === 1 ? '' : 's'} before`
}
