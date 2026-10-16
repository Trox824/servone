import type { Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import {
  AUTO_ARCHIVE_MONTHS,
  HANDOFF_FIELD,
  HELPDESK_FIELDS,
  handoffToJson,
  SLA_PRIORITIES,
  slaToJson,
  type Handoff,
  type HelpdeskSettings,
  type Sla,
  type SlaPriority,
  type StoredHandoff,
  type StoredHelpdesk
} from '@servone/notify-rules'

export interface HelpdeskDraft {
  targets: Record<SlaPriority, { respond: string, resolve: string }>
  autoCloseDays: string
  autoArchiveMonths: string
  handoff: { stage: string, target: string, assignee: string, person: Ref<Person> | '' }
}

export interface HelpdeskUpdate extends StoredHelpdesk, StoredHandoff {
  $unset?: Partial<Record<keyof StoredHelpdesk | keyof StoredHandoff, true>>
}

const text = (count: number | undefined): string => (count === undefined ? '' : String(count))

export function draftOf (settings: HelpdeskSettings, handoff: Handoff | undefined): HelpdeskDraft {
  const row = (priority: SlaPriority): HelpdeskDraft['targets'][SlaPriority] => {
    const target = settings.sla?.targets[priority]
    return { respond: text(target?.respondHours), resolve: text(target?.resolveHours) }
  }
  return {
    targets: { urgent: row('urgent'), high: row('high'), medium: row('medium'), low: row('low') },
    autoCloseDays: text(settings.autoCloseDays),
    autoArchiveMonths: text(settings.autoArchiveMonths),
    handoff: {
      stage: handoff?.stage ?? '',
      target: handoff?.target ?? '',
      assignee: handoff?.assignee.kind ?? 'none',
      person: handoff?.assignee.kind === 'person' ? (handoff.assignee.person as Ref<Person>) : ''
    }
  }
}

export function handoffOf (draft: HelpdeskDraft['handoff']): Handoff | undefined | null {
  if (draft.stage === '' && draft.target === '') return undefined
  if (draft.stage === '' || draft.target === '') return null
  if (draft.assignee === 'none' || draft.assignee === 'same') {
    return { stage: draft.stage, target: draft.target, assignee: { kind: draft.assignee } }
  }
  if (draft.person === '') return null
  return { stage: draft.stage, target: draft.target, assignee: { kind: 'person', person: draft.person } }
}

function count (typed: string): number | undefined {
  const trimmed = typed.trim()
  if (trimmed === '') return undefined
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : NaN
}

export function isValidCount (typed: string): boolean {
  return !Number.isNaN(count(typed))
}

export function helpdeskUpdate (draft: HelpdeskDraft, saved: HelpdeskSettings, now: number): HelpdeskUpdate | undefined {
  const typed = [
    ...SLA_PRIORITIES.flatMap((priority) => [draft.targets[priority].respond, draft.targets[priority].resolve]),
    draft.autoCloseDays
  ]
  const handoff = handoffOf(draft.handoff)
  if (!typed.every(isValidCount) || handoff === null) return undefined

  const targets: Sla['targets'] = {}
  for (const priority of SLA_PRIORITIES) {
    const respondHours = count(draft.targets[priority].respond)
    const resolveHours = count(draft.targets[priority].resolve)
    if (respondHours === undefined && resolveHours === undefined) continue
    const target: Sla['targets'][SlaPriority] = {}
    if (respondHours !== undefined) target.respondHours = respondHours
    if (resolveHours !== undefined) target.resolveHours = resolveHours
    targets[priority] = target
  }
  const isSameTargets = JSON.stringify(saved.sla?.targets) === JSON.stringify(targets)
  const since = saved.sla !== undefined && isSameTargets ? saved.sla.since : now
  const autoCloseDays = count(draft.autoCloseDays)
  const autoArchiveMonths = AUTO_ARCHIVE_MONTHS.find((months) => String(months) === draft.autoArchiveMonths)

  const update: HelpdeskUpdate = {}
  const unset: NonNullable<HelpdeskUpdate['$unset']> = {}
  if (Object.keys(targets).length > 0) update[HELPDESK_FIELDS.sla] = slaToJson({ since, targets })
  else unset[HELPDESK_FIELDS.sla] = true
  if (autoCloseDays !== undefined) update[HELPDESK_FIELDS.autoCloseDays] = autoCloseDays
  else unset[HELPDESK_FIELDS.autoCloseDays] = true
  if (autoArchiveMonths !== undefined) update[HELPDESK_FIELDS.autoArchiveMonths] = autoArchiveMonths
  else unset[HELPDESK_FIELDS.autoArchiveMonths] = true
  if (handoff !== undefined) update[HANDOFF_FIELD] = handoffToJson(handoff)
  else unset[HANDOFF_FIELD] = true
  if (Object.keys(unset).length > 0) update.$unset = unset
  return update
}
