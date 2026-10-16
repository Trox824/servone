export interface TextPart {
  text: string
  isMatch: boolean
}

export function splitMatches (text: string, query: string): TextPart[] {
  const words = query.trim().split(/\s+/).filter((w) => w !== '')
  if (words.length === 0) return [{ text, isMatch: false }]
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu')
  return text
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, isMatch: words.some((w) => w.localeCompare(part, undefined, { sensitivity: 'accent' }) === 0) }))
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

export function formatBytes (bytes: number, locale: string): string {
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024
    unit++
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: BYTE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit < 2 ? 0 : 1
  }).format(size)
}
