import { dateShort } from './format'
import type { Lang, Rule } from './types'

const UNITS: Partial<Record<string, { vi: string, en: string, enEvery: string }>> = {
  DAILY: { vi: 'ngày', en: 'Daily', enEvery: 'days' },
  WEEKLY: { vi: 'tuần', en: 'Weekly', enEvery: 'weeks' },
  MONTHLY: { vi: 'tháng', en: 'Monthly', enEvery: 'months' },
  YEARLY: { vi: 'năm', en: 'Yearly', enEvery: 'years' }
}
const DAYS: Partial<Record<string, { vi: string, en: string }>> = {
  MO: { vi: 'T2', en: 'Mon' },
  TU: { vi: 'T3', en: 'Tue' },
  WE: { vi: 'T4', en: 'Wed' },
  TH: { vi: 'T5', en: 'Thu' },
  FR: { vi: 'T6', en: 'Fri' },
  SA: { vi: 'T7', en: 'Sat' },
  SU: { vi: 'CN', en: 'Sun' }
}

export function seriesEndBefore (lastKeptStart: number, cutAt: number): number {
  return Math.min(new Date(lastKeptStart).setHours(23, 59, 59, 999), cutAt - 1)
}

export function recurrenceText (rules: Rule[], lang: Lang): string {
  const rule = rules[0]
  if (rule === undefined) return ''
  const unit = UNITS[rule.freq]
  if (unit === undefined) return lang === 'vi' ? 'Lặp lại' : 'Repeats'
  const interval = rule.interval ?? 1
  let text =
    lang === 'vi'
      ? interval > 1 ? `Mỗi ${interval} ${unit.vi}` : `Hàng ${unit.vi}`
      : interval > 1 ? `Every ${interval} ${unit.enEvery}` : unit.en
  const days = (rule.byDay ?? []).map((d) => DAYS[d]?.[lang]).filter((d) => d !== undefined)
  if (rule.freq === 'WEEKLY' && days.length > 0) text += lang === 'vi' ? ` vào ${days.join(', ')}` : ` on ${days.join(', ')}`
  if (rule.count !== undefined) text += lang === 'vi' ? ` · ${rule.count} lần` : ` · ${rule.count} times`
  else if (rule.endDate !== undefined) text += lang === 'vi' ? ` · đến ${dateShort(rule.endDate, lang)}` : ` · until ${dateShort(rule.endDate, lang)}`
  return text
}
