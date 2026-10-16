import type { Lang, Rule } from '../../lib/types'

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'yearly'
export type RepeatEnd = 'never' | 'on' | 'after'

export interface RuleFields extends Rule {
  byMonthDay?: number[]
  byMonth?: number[]
  bySetPos?: number[]
}

export interface RepeatRule extends RuleFields {
  freq: Freq
}

export interface CustomRepeat {
  freq: Freq
  interval: number
  byDay: string[]
  end: RepeatEnd
  endDate: number
  count: number
}

export const PRESETS: readonly RepeatPreset[] = ['none', 'daily', 'weekly', 'weekdays', 'monthly', 'yearly']
export const FREQS: readonly Freq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const WORK_WEEK = ['MO', 'TU', 'WE', 'TH', 'FR']

const VI_WEEKDAY = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const EN_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EN_MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function weekdayCode (ts: number): string {
  return WEEKDAY_CODES[new Date(ts).getDay()]
}

export function isFreq (text: string): text is Freq {
  return FREQS.some((f) => f === text)
}

export function presetRules (preset: RepeatPreset, start: number): RepeatRule[] {
  const d = new Date(start)
  switch (preset) {
    case 'none':
      return []
    case 'daily':
      return [{ freq: 'DAILY', interval: 1 }]
    case 'weekly':
      return [{ freq: 'WEEKLY', interval: 1, byDay: [weekdayCode(start)] }]
    case 'weekdays':
      return [{ freq: 'WEEKLY', interval: 1, byDay: [...WORK_WEEK] }]
    case 'monthly':
      return [{ freq: 'MONTHLY', interval: 1, byMonthDay: [d.getDate()] }]
    case 'yearly':
      return [{ freq: 'YEARLY', interval: 1, byMonth: [d.getMonth()] }]
  }
}

function sameRule (a: RuleFields, b: RuleFields): boolean {
  const list = (xs: Array<string | number> | undefined): string => [...(xs ?? [])].sort().join(',')
  return (
    a.freq === b.freq &&
    (a.interval ?? 1) === (b.interval ?? 1) &&
    a.count === b.count &&
    a.endDate === b.endDate &&
    list(a.byDay) === list(b.byDay) &&
    list(a.byMonthDay) === list(b.byMonthDay) &&
    list(a.byMonth) === list(b.byMonth) &&
    list(a.bySetPos) === list(b.bySetPos)
  )
}

export function presetOf (rules: RuleFields[], start: number): RepeatPreset | 'custom' {
  if (rules.length === 0) return 'none'
  if (rules.length > 1) return 'custom'
  return PRESETS.find((p) => p !== 'none' && sameRule(rules[0], presetRules(p, start)[0])) ?? 'custom'
}

export function presetLabel (preset: RepeatPreset, start: number, lang: Lang): string {
  const d = new Date(start)
  const vi = lang === 'vi'
  switch (preset) {
    case 'none':
      return vi ? 'Không lặp' : 'Does not repeat'
    case 'daily':
      return vi ? 'Hàng ngày' : 'Daily'
    case 'weekly':
      return vi ? `Hàng tuần vào ${VI_WEEKDAY[d.getDay()]}` : `Weekly on ${EN_WEEKDAY[d.getDay()]}`
    case 'weekdays':
      return vi ? 'Các ngày trong tuần (T2 đến T6)' : 'Every weekday (Mon to Fri)'
    case 'monthly':
      return vi ? `Hàng tháng vào ngày ${d.getDate()}` : `Monthly on day ${d.getDate()}`
    case 'yearly':
      return vi ? `Hàng năm vào ngày ${d.getDate()} tháng ${d.getMonth() + 1}` : `Annually on ${EN_MONTH[d.getMonth()]} ${d.getDate()}`
  }
}

export function customFrom (rule: RuleFields | undefined, start: number, endOfToday: number): CustomRepeat {
  const freq = rule !== undefined && isFreq(rule.freq) ? rule.freq : 'WEEKLY'
  return {
    freq,
    interval: rule?.interval ?? 1,
    byDay: freq === 'WEEKLY' && rule?.byDay !== undefined ? [...rule.byDay] : [weekdayCode(start)],
    end: rule?.endDate !== undefined ? 'on' : rule?.count !== undefined ? 'after' : 'never',
    endDate: rule?.endDate ?? endOfToday,
    count: rule?.count ?? 10
  }
}

export function customRule (form: CustomRepeat, base: RuleFields | undefined, start: number): RepeatRule {
  const d = new Date(start)
  const rule: RepeatRule = { freq: form.freq, interval: Math.max(1, Math.floor(form.interval)) }
  const kept = base?.freq === form.freq ? base : undefined
  if (form.freq === 'WEEKLY') rule.byDay = form.byDay.length > 0 ? [...form.byDay] : [weekdayCode(start)]
  if (form.freq === 'MONTHLY') {
    if (kept?.bySetPos !== undefined) {
      rule.bySetPos = kept.bySetPos
      rule.byDay = kept.byDay
    } else {
      rule.byMonthDay = kept?.byMonthDay ?? [d.getDate()]
    }
  }
  if (form.freq === 'YEARLY') {
    rule.byMonth = kept?.byMonth ?? [d.getMonth()]
    if (kept?.bySetPos !== undefined) {
      rule.bySetPos = kept.bySetPos
      rule.byDay = kept.byDay
    }
  }
  if (form.end === 'on') rule.endDate = form.endDate
  if (form.end === 'after') rule.count = Math.max(1, Math.floor(form.count))
  return rule
}
