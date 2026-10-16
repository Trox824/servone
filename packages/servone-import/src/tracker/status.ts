import type { Priority, StatusCategory } from '../types'

const STATUS_PATTERNS: Array<[StatusCategory, RegExp]> = [
  ['canceled', /cancel|won.?t|\bwont\b|duplicate|reject|declined/],
  ['done', /\b(done|complete|completed|closed|resolved|shipped|released|finished|merged)\b/],
  ['todo', /\bnot started\b/],
  ['inProgress', /progress|review|doing|active|testing|\bqa\b|blocked|started|\bwip\b/],
  ['backlog', /backlog|triage|icebox|later|someday/],
  ['todo', /\b(to ?do|open|reopened|ready|selected|new)\b/]
]

export function matchStatus (name: string): StatusCategory | undefined {
  const text = name.toLowerCase()
  return STATUS_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0]
}

export function statusCategory (name: string, known?: StatusCategory): StatusCategory {
  const byName = matchStatus(name)
  if (known === undefined) return byName ?? 'todo'
  if (known === 'done' && byName === 'canceled') return 'canceled'
  if (known === 'todo' && byName === 'backlog') return 'backlog'
  return known
}

const PRIORITIES = new Map<string, Priority>([
  ['urgent', 'urgent'],
  ['highest', 'urgent'],
  ['critical', 'urgent'],
  ['blocker', 'urgent'],
  ['1', 'urgent'],
  ['high', 'high'],
  ['2', 'high'],
  ['medium', 'medium'],
  ['normal', 'medium'],
  ['3', 'medium'],
  ['low', 'low'],
  ['lowest', 'low'],
  ['minor', 'low'],
  ['trivial', 'low'],
  ['4', 'low']
])

export function priority (name: string): Priority {
  return PRIORITIES.get(name.trim().toLowerCase()) ?? 'none'
}
