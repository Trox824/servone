
export type SprintState = 'future' | 'active' | 'closed'

export type StatusKind = 'unstarted' | 'todo' | 'active' | 'done' | 'canceled'

export type EstimateScale = 'fibonacci' | 'tshirt' | 'linear' | 'off'

export interface PlanIssue {
  _id: string
  /** Parent issue (`attachedTo`), `null` for top-level issues. */
  parent: string | null
  isEpic: boolean
  status: StatusKind
  points: number | null
  /** Original estimate, hours. */
  estimation: number
  sprint: string | null
  assignee?: string | null
  /** The service-kept dates (servoneStartedOn / servoneCompletedOn); absent until it has written them. */
  startedOn?: number | null
  completedOn?: number | null
}

/** One issue of a sprint as it stood when the sprint was completed. */
export interface SnapshotIssue {
  id: string
  assignee: string | null
  /** Parent issue, as the sprint report's epic breakdown groups by. */
  epic: string | null
  points: number | null
  done: boolean
  startedOn: number | null
  completedOn: number | null
}

export interface SprintIssuesSnapshot {
  v: 1
  issues: SnapshotIssue[]
}

export interface SprintSnapshot {
  committedPoints?: number
  committedCount?: number
  completedPoints?: number
  completedCount?: number
  completedAt?: number
  rolledOver?: string[]
  /** Stored at completion so later edits to its issues don't rewrite the report. */
  issuesSnapshot?: SprintIssuesSnapshot
}

export interface Sprint extends SprintSnapshot {
  _id: string
  label: string
  state: SprintState
  goal?: string
  startDate: number | null
  targetDate: number
}

export interface ProjectSprintSettings {
  /** Default sprint length in days. */
  lengthDays: number
  autoCreate: boolean
  scale: EstimateScale
  /** Board column limits by status name; a column over its limit is flagged. */
  wipLimits: Record<string, number>
  /** Moving an unestimated issue to done asks for its points first. */
  doneNeedsPoints: boolean
}

export const DEFAULT_SETTINGS: ProjectSprintSettings = {
  lengthDays: 7,
  autoCreate: true,
  scale: 'fibonacci',
  wipLimits: {},
  doneNeedsPoints: false
}

export const DAY = 24 * 60 * 60 * 1000

export function isOpen (status: StatusKind): boolean {
  return status !== 'done' && status !== 'canceled'
}
