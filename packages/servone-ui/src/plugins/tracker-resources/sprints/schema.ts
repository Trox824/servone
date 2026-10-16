import { MilestoneStatus, type Issue, type Milestone, type Project } from '@hcengineering/tracker'
import { isEstimateScale } from './lib/scale'
import { parseSprintSnapshot } from './lib/snapshot'
import { DEFAULT_SETTINGS, type ProjectSprintSettings, type Sprint, type SprintState } from './lib/types'
import { ISSUE_DATES, ISSUE_POINTS, PROJECT, SPRINT } from './scrum-spec'

export { ISSUE_DATES, ISSUE_POINTS, PROJECT, SPRINT } from './scrum-spec'

function field<T> (doc: object, name: string): T | undefined {
  const v = (doc as Record<string, unknown>)[name]
  return v === null ? undefined : (v as T | undefined)
}

export function issuePoints (issue: Issue): number | null {
  const v = field<number>(issue, ISSUE_POINTS)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function issueDates (issue: Issue): { startedOn: number | null, completedOn: number | null } {
  const startedOn = field<number>(issue, ISSUE_DATES.startedOn)
  const completedOn = field<number>(issue, ISSUE_DATES.completedOn)
  return {
    startedOn: typeof startedOn === 'number' ? startedOn : null,
    completedOn: typeof completedOn === 'number' ? completedOn : null
  }
}

/** A milestone never touched by the sprint screens (older, or imported) takes its state from its status. */
function stateFromStatus (status: MilestoneStatus): SprintState {
  switch (status) {
    case MilestoneStatus.InProgress:
      return 'active'
    case MilestoneStatus.Completed:
    case MilestoneStatus.Canceled:
      return 'closed'
    default:
      return 'future'
  }
}

export function statusForState (state: SprintState): MilestoneStatus {
  return state === 'active' ? MilestoneStatus.InProgress : state === 'closed' ? MilestoneStatus.Completed : MilestoneStatus.Planned
}

export function toSprint (m: Milestone): Sprint {
  const state = field<SprintState>(m, SPRINT.state)
  return {
    _id: m._id,
    label: m.label,
    state: state === 'future' || state === 'active' || state === 'closed' ? state : stateFromStatus(m.status),
    goal: field<string>(m, SPRINT.goal),
    startDate: m.startDate ?? null,
    targetDate: m.targetDate,
    completedAt: field<number>(m, SPRINT.completedAt),
    committedPoints: field<number>(m, SPRINT.committedPoints),
    committedCount: field<number>(m, SPRINT.committedCount),
    completedPoints: field<number>(m, SPRINT.completedPoints),
    completedCount: field<number>(m, SPRINT.completedCount),
    rolledOver: field<string[]>(m, SPRINT.rolledOver),
    issuesSnapshot: parseSprintSnapshot(field<string>(m, SPRINT.snapshot))
  }
}

export function projectSettings (p: Project | undefined): ProjectSprintSettings {
  if (p === undefined) return DEFAULT_SETTINGS
  const length = field<number>(p, PROJECT.lengthDays)
  const auto = field<boolean>(p, PROJECT.autoCreate)
  const scale = field<string>(p, PROJECT.scale)
  const done = field<boolean>(p, PROJECT.doneNeedsPoints)
  return {
    lengthDays: typeof length === 'number' && length > 0 ? length : DEFAULT_SETTINGS.lengthDays,
    autoCreate: typeof auto === 'boolean' ? auto : DEFAULT_SETTINGS.autoCreate,
    scale: isEstimateScale(scale) ? scale : DEFAULT_SETTINGS.scale,
    wipLimits: parseLimits(field<string>(p, PROJECT.wipLimits)),
    doneNeedsPoints: typeof done === 'boolean' ? done : DEFAULT_SETTINGS.doneNeedsPoints
  }
}

/** Positive whole numbers by status name; anything else is dropped. */
export function parseLimits (raw: string | undefined): Record<string, number> {
  if (raw === undefined || raw === '') return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (typeof v === 'number' && Number.isInteger(v) && v > 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}
