const MAX_SHOWN_PARTICIPANTS = 3

const NAME_ADDRESS = /^"?([^"<]*?)"?\s*<(.+)>\s*$/

export function parseAddress (address: string): { name: string, email: string } {
  const trimmed = address.trim()
  const match = NAME_ADDRESS.exec(trimmed)
  if (match !== null) return { name: match[1].trim(), email: match[2].trim() }
  return { name: '', email: trimmed }
}

export function displayName (address: string): string {
  const { name, email } = parseAddress(address)
  if (name.length > 0) return name
  const at = email.indexOf('@')
  return at === -1 ? email : email.slice(0, at)
}

export function participantsLine (participants: string[], me: string, meLabel: string): string {
  const meEmail = parseAddress(me).email.toLowerCase()
  const others = participants.filter((participant) => parseAddress(participant).email.toLowerCase() !== meEmail)
  const shown = others.slice(0, MAX_SHOWN_PARTICIPANTS).map(displayName)
  if (others.length < participants.length && shown.length < MAX_SHOWN_PARTICIPANTS) shown.push(meLabel)
  const hidden = participants.length - shown.length
  return hidden > 0 ? `${shown.join(', ')} +${hidden}` : shown.join(', ')
}

const FORMAT_OPTIONS = {
  date: { year: 'numeric', month: 'numeric', day: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  monthDay: { month: 'short', day: 'numeric' },
  full: { dateStyle: 'full', timeStyle: 'short' }
} satisfies Record<string, Intl.DateTimeFormatOptions>

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter (locale: string, style: keyof typeof FORMAT_OPTIONS): Intl.DateTimeFormat {
  const key = `${locale}|${style}`
  let cached = formatters.get(key)
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat(locale, FORMAT_OPTIONS[style])
    formatters.set(key, cached)
  }
  return cached
}

function dateParts (timestamp: number, locale: string): { day: string, month: string, year: string } {
  const parts = formatter(locale, 'date').formatToParts(timestamp)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { day: byType.day, month: byType.month, year: byType.year }
}

export function listTime (sentAt: number, now: number, lang: string): string {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US'
  const sent = dateParts(sentAt, locale)
  const today = dateParts(now, locale)
  if (sent.day === today.day && sent.month === today.month && sent.year === today.year) {
    return formatter(locale, 'time').format(sentAt)
  }
  if (sent.year === today.year) {
    if (lang === 'vi') return `${sent.day} thg ${sent.month}`
    return formatter(locale, 'monthDay').format(sentAt)
  }
  return `${sent.day.padStart(2, '0')}/${sent.month.padStart(2, '0')}/${sent.year}`
}

export function fullTime (sentAt: number, lang: string): string {
  return formatter(lang === 'vi' ? 'vi-VN' : 'en-US', 'full').format(sentAt)
}

export function recipientNames (recipients: string[], me: string, meLabel: string): string[] {
  const meEmail = parseAddress(me).email.toLowerCase()
  return recipients.map((recipient) => parseAddress(recipient).email.toLowerCase() === meEmail ? meLabel : displayName(recipient))
}
