//
// Resolves content.ts into concrete timestamps. Pure and deterministic for a given `now`.
//
import {
  APPROVALS,
  CHANNELS,
  DIRECTS,
  EVENTS,
  LEAVES,
  RESOURCES,
  type ApprovalSpec,
  type ChannelSpec,
  type DirectSpec,
  type EventSpec,
  type LeaveSpec,
  type PersonKey,
  type ResourceSpec,
  type Weekday
} from './content'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const VIETNAM_OFFSET_MS = 7 * HOUR_MS // no daylight saving
const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR']
export const VIETNAM_ZONE = 'Asia/Ho_Chi_Minh'

/** Midnight in Vietnam on the day of `instant`. */
export function vietnamDayStart (instant: number): number {
  return Math.floor((instant + VIETNAM_OFFSET_MS) / DAY_MS) * DAY_MS - VIETNAM_OFFSET_MS
}

function clock (time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * HOUR_MS + minutes * MINUTE_MS
}

export interface PlannedMessage {
  id: string
  by: PersonKey
  at: number
  text: string
  isPinned: boolean
  replies: Array<{ id: string, by: PersonKey, at: number, text: string }>
}

function planMessages (idPrefix: string, specs: ChannelSpec['messages'] | DirectSpec['messages'], today: number): PlannedMessage[] {
  return specs
    .map((spec, i) => {
      const at = today - spec.ago * DAY_MS + clock(spec.at)
      return {
        id: `${idPrefix}-${i}`,
        by: spec.by,
        at,
        text: spec.text,
        isPinned: spec.isPinned === true,
        replies: (spec.replies ?? []).map((reply, r) => ({
          id: `${idPrefix}-${i}-r${r}`,
          by: reply.by,
          at: at + reply.after * MINUTE_MS,
          text: reply.text
        }))
      }
    })
    .sort((a, b) => a.at - b.at)
}

export interface PlannedRule {
  freq: 'WEEKLY'
  interval?: number
  byDay: Weekday[]
}

export interface PlannedEvent {
  key: string
  title: string
  description: string
  start: number
  end: number
  rule?: PlannedRule
  guests: PersonKey[]
  externalGuests: string[]
  location?: string
  resource?: string
}

function planEvent (spec: EventSpec, today: number): PlannedEvent {
  const weekday = new Date(today + VIETNAM_OFFSET_MS).getUTCDay() // 0 = Sunday
  const monday = today - ((weekday + 6) % 7) * DAY_MS
  const start = monday + (spec.week * 7 + WEEKDAYS.indexOf(spec.day)) * DAY_MS + clock(spec.at)
  const event: PlannedEvent = {
    key: spec.key,
    title: spec.title,
    description: spec.description,
    start,
    end: start + spec.minutes * MINUTE_MS,
    guests: spec.guests,
    externalGuests: spec.externalGuests ?? [],
    location: spec.location,
    resource: spec.resource
  }
  if (spec.every !== undefined) {
    event.rule = { freq: 'WEEKLY', byDay: [spec.day] }
    if (spec.every > 1) event.rule.interval = spec.every
  }
  return event
}

export interface PlannedLeave extends Pick<LeaveSpec, 'person' | 'state' | 'note'> {
  from: { year: number, month: number, day: number }
  to: { year: number, month: number, day: number }
}

function planLeave (spec: LeaveSpec, today: number): PlannedLeave {
  const dayOf = (offset: number): PlannedLeave['from'] => {
    const date = new Date(today + offset * DAY_MS + VIETNAM_OFFSET_MS)
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
  }
  return { person: spec.person, state: spec.state, note: spec.note, from: dayOf(spec.from), to: dayOf(spec.to) }
}

export interface PlannedApproval extends Omit<ApprovalSpec, 'items'> {
  items: Array<ApprovalSpec['items'][number] & { filedAt: number }>
}

export interface Scenario {
  channels: Array<Omit<ChannelSpec, 'messages'> & { messages: PlannedMessage[] }>
  directs: Array<{ with: PersonKey, messages: PlannedMessage[] }>
  resources: ResourceSpec[]
  events: PlannedEvent[]
  leaves: PlannedLeave[]
  approvals: PlannedApproval[]
}

export function buildScenario (now: number): Scenario {
  const today = vietnamDayStart(now)
  return {
    channels: CHANNELS.map((channel) => ({ ...channel, messages: planMessages(channel.key, channel.messages, today) })),
    directs: DIRECTS.map((direct) => ({ with: direct.with, messages: planMessages(`dm-${direct.with}`, direct.messages, today) })),
    resources: RESOURCES,
    events: EVENTS.map((event) => planEvent(event, today)),
    leaves: LEAVES.map((leave) => planLeave(leave, today)),
    approvals: APPROVALS.map((approval) => ({
      ...approval,
      items: approval.items.map((item) => ({ ...item, filedAt: now - item.ago * DAY_MS }))
    }))
  }
}

export interface MentionTarget {
  id: string
  name: string
}

type MarkupNode =
  | { type: 'text', text: string }
  | { type: 'reference', attrs: { id: string, objectclass: string, label: string } }

const PERSON_CLASS = 'contact:class:Person'

/** `@key` tokens become mentions; an unknown key stays plain text. */
export function markupOf (text: string, mentionOf: (key: string) => MentionTarget | undefined): string {
  const content: MarkupNode[] = []
  for (const [i, part] of text.split(/@(\w+)/).entries()) {
    if (i % 2 === 0) {
      if (part !== '') content.push({ type: 'text', text: part })
      continue
    }
    const target = mentionOf(part)
    if (target === undefined) content.push({ type: 'text', text: `@${part}` })
    else content.push({ type: 'reference', attrs: { id: target.id, objectclass: PERSON_CLASS, label: target.name } })
  }
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] })
}
