// Hidden custom attributes on a tracker Project, written by the workflow settings page and read by the
// services/servone helpdesk tick. Any client can write them, so each is parsed where it is read.
export interface StoredHelpdesk {
  servoneSla?: unknown
  servoneAutoCloseDays?: unknown
  servoneAutoArchiveMonths?: unknown
}

export const HELPDESK_FIELDS = {
  sla: 'servoneSla',
  autoCloseDays: 'servoneAutoCloseDays',
  autoArchiveMonths: 'servoneAutoArchiveMonths'
} as const satisfies Record<string, keyof StoredHelpdesk>

// Hidden issue date; Quy trinh views exclude issues that have it.
export const ARCHIVED_ON = 'servoneArchivedOn'

export const SLA_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
export type SlaPriority = (typeof SLA_PRIORITIES)[number]

export interface SlaTarget {
  respondHours?: number
  resolveHours?: number
}

export interface Sla {
  // Issues created before the last save of the targets have no SLA.
  since: number
  targets: Partial<Record<SlaPriority, SlaTarget>>
}

// Linear's auto-archive choices.
export const AUTO_ARCHIVE_MONTHS = [1, 3, 6, 9, 12] as const
export type AutoArchiveMonths = (typeof AUTO_ARCHIVE_MONTHS)[number]

// An absent field is off.
export interface HelpdeskSettings {
  sla?: Sla
  autoCloseDays?: number
  autoArchiveMonths?: AutoArchiveMonths
}

export function slaToJson (sla: Sla): string {
  return JSON.stringify(sla)
}

function positiveInteger (stored: unknown): number | undefined {
  return typeof stored === 'number' && Number.isInteger(stored) && stored > 0 ? stored : undefined
}

function parseTarget (stored: unknown): SlaTarget | undefined {
  if (typeof stored !== 'object' || stored === null) return undefined
  const target: SlaTarget = {}
  const respondHours = 'respondHours' in stored ? positiveInteger(stored.respondHours) : undefined
  const resolveHours = 'resolveHours' in stored ? positiveInteger(stored.resolveHours) : undefined
  if (respondHours !== undefined) target.respondHours = respondHours
  if (resolveHours !== undefined) target.resolveHours = resolveHours
  return Object.keys(target).length > 0 ? target : undefined
}

function parseJson (text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
}

function parseSla (stored: unknown): Sla | undefined {
  if (typeof stored !== 'string') return undefined
  const sla = parseJson(stored)
  if (typeof sla !== 'object' || sla === null || !('since' in sla && 'targets' in sla)) return undefined
  const { since, targets: storedTargets } = sla
  if (typeof since !== 'number' || !Number.isFinite(since)) return undefined
  if (typeof storedTargets !== 'object' || storedTargets === null) return undefined
  const byPriority = new Map<string, unknown>(Object.entries(storedTargets))
  const targets: Sla['targets'] = {}
  for (const priority of SLA_PRIORITIES) {
    const target = parseTarget(byPriority.get(priority))
    if (target !== undefined) targets[priority] = target
  }
  return Object.keys(targets).length > 0 ? { since, targets } : undefined
}

export function parseHelpdeskSettings (project: StoredHelpdesk): HelpdeskSettings {
  const settings: HelpdeskSettings = {}
  const sla = parseSla(project.servoneSla)
  const autoCloseDays = positiveInteger(project.servoneAutoCloseDays)
  const autoArchiveMonths = AUTO_ARCHIVE_MONTHS.find((months) => months === project.servoneAutoArchiveMonths)
  if (sla !== undefined) settings.sla = sla
  if (autoCloseDays !== undefined) settings.autoCloseDays = autoCloseDays
  if (autoArchiveMonths !== undefined) settings.autoArchiveMonths = autoArchiveMonths
  return settings
}
