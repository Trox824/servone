import { spanOf, startOfDay, startOfWeek, addDays } from './time'
import type { Lang, Slot, Timed, View } from './types'

const VI_WEEKDAY = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const VI_WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const EN_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EN_MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (n: number): string => String(n).padStart(2, '0')
const enMonthShort = (d: Date): string => EN_MONTH[d.getMonth()].slice(0, 3)

export function dateShort (ts: number, lang: Lang): string {
  const d = new Date(ts)
  return lang === 'vi'
    ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
    : `${enMonthShort(d)} ${d.getDate()}, ${d.getFullYear()}`
}

export function dateWithWeekday (ts: number, lang: Lang): string {
  const d = new Date(ts)
  return lang === 'vi'
    ? `${VI_WEEKDAY_SHORT[d.getDay()]}, ${dateShort(ts, lang)}`
    : `${EN_WEEKDAY[d.getDay()].slice(0, 3)}, ${d.getDate()} ${enMonthShort(d)} ${d.getFullYear()}`
}

export function dayHeading (day: number, lang: Lang): string {
  const d = new Date(day)
  return lang === 'vi'
    ? `${VI_WEEKDAY_SHORT[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
    : `${EN_WEEKDAY[d.getDay()].slice(0, 3)}, ${enMonthShort(d)} ${d.getDate()}`
}

export function timeRange (e: Timed, lang: Lang): string {
  if (e.allDay) return lang === 'vi' ? 'Cả ngày' : 'All day'
  const { start, end } = spanOf(e)
  const hm = (ts: number): string => `${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`
  return `${hm(start)}–${hm(end)}`
}

function weekTitle (anchor: number, firstDayOfWeek: number, lang: Lang): string {
  const a = new Date(startOfWeek(anchor, firstDayOfWeek))
  const b = new Date(addDays(a.getTime(), 6))
  const sameMonth = a.getMonth() === b.getMonth()
  if (lang === 'vi') {
    const left = sameMonth ? `${a.getDate()}` : `${pad(a.getDate())}/${pad(a.getMonth() + 1)}`
    return `${left} – ${pad(b.getDate())}/${pad(b.getMonth() + 1)}/${b.getFullYear()}`
  }
  const right = sameMonth ? `${b.getDate()}` : `${enMonthShort(b)} ${b.getDate()}`
  return `${enMonthShort(a)} ${a.getDate()} – ${right}, ${b.getFullYear()}`
}

function monthTitle (anchor: number, lang: Lang): string {
  const d = new Date(anchor)
  return lang === 'vi' ? `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}` : `${EN_MONTH[d.getMonth()]} ${d.getFullYear()}`
}

export function shortTitleOf (view: View, anchor: number, lang: Lang): string {
  if (view !== 'ngay') return monthTitle(anchor, lang)
  const d = new Date(anchor)
  return lang === 'vi' ? `${d.getDate()} thg ${d.getMonth() + 1}` : `${enMonthShort(d)} ${d.getDate()}`
}

export function titleOf (view: View, anchor: number, firstDayOfWeek: number, lang: Lang): string {
  const d = new Date(anchor)
  switch (view) {
    case 'ngay':
      return lang === 'vi'
        ? `${VI_WEEKDAY[d.getDay()]}, ${dateShort(anchor, lang)}`
        : `${EN_WEEKDAY[d.getDay()]}, ${dateShort(anchor, lang)}`
    case 'ba-ngay':
      return monthTitle(anchor, lang)
    case 'tuan':
      return weekTitle(anchor, firstDayOfWeek, lang)
    case 'thang':
      return monthTitle(anchor, lang)
    case 'lich-bieu':
      return lang === 'vi' ? `Từ ${dateShort(anchor, lang)}` : `From ${dateShort(anchor, lang)}`
  }
}

function dayLong (ts: number, lang: Lang): string {
  const d = new Date(ts)
  return lang === 'vi'
    ? `${VI_WEEKDAY[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}`
    : `${EN_WEEKDAY[d.getDay()]}, ${EN_MONTH[d.getMonth()]} ${d.getDate()}`
}

const meridiem = (d: Date): string => (d.getHours() < 12 ? 'am' : 'pm')
const clock12 = (d: Date): string => `${d.getHours() % 12 === 0 ? 12 : d.getHours() % 12}:${pad(d.getMinutes())}`
const clock24 = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export function whenText (slot: Slot, allDay: boolean, lang: Lang): string {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const lastDay = startOfDay(Math.max(slot.start, slot.end - 1))
  const isOneDay = lastDay === startOfDay(slot.start)
  if (allDay) return isOneDay ? dayLong(slot.start, lang) : `${dayLong(slot.start, lang)} – ${dayLong(lastDay, lang)}`
  if (!isOneDay) {
    const at = (d: Date): string => (lang === 'vi' ? clock24(d) : clock12(d) + meridiem(d))
    return `${dayLong(slot.start, lang)}, ${at(start)} – ${dayLong(slot.end, lang)}, ${at(end)}`
  }
  if (lang === 'vi') return `${dayLong(slot.start, lang)} · ${clock24(start)} – ${clock24(end)}`
  const startText = meridiem(start) === meridiem(end) ? clock12(start) : clock12(start) + meridiem(start)
  return `${dayLong(slot.start, lang)} · ${startText} – ${clock12(end)}${meridiem(end)}`
}
