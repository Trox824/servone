
export const ISSUE_POINTS = 'storyPoints'

export const ISSUE_DATES = {
  startedOn: 'servoneStartedOn',
  completedOn: 'servoneCompletedOn',
  respondedOn: 'servoneRespondedOn'
} as const

export const SPRINT = {
  state: 'sprintState',
  goal: 'sprintGoal',
  completedAt: 'sprintCompletedAt',
  committedPoints: 'sprintCommittedPoints',
  committedCount: 'sprintCommittedCount',
  completedPoints: 'sprintCompletedPoints',
  completedCount: 'sprintCompletedCount',
  rolledOver: 'sprintRolledOver',
  /** JSON SprintIssuesSnapshot (./lib/types.ts), written at completion. */
  snapshot: 'sprintSnapshot'
} as const

/** A release is a TagElement in the Releases category (see ./releases.ts); these add what a label lacks. */
export const RELEASE = {
  project: 'releaseProject',
  startDate: 'releaseStartDate',
  releaseDate: 'releaseDate',
  state: 'releaseState',
  releasedAt: 'releasedAt'
} as const

export const RELEASE_CATEGORY_ID = 'servone:tagCategory:Releases'

export const PROJECT = {
  lengthDays: 'sprintLengthDays',
  autoCreate: 'sprintAutoCreate',
  scale: 'estimateScale',
  /** JSON object: status name → max issues in that board column. */
  wipLimits: 'sprintWipLimits',
  doneNeedsPoints: 'sprintDoneNeedsPoints'
} as const

export const SCRUM_TYPE_ID = 'servone:projectType:Scrum'

export type IssueTypeKey = 'epic' | 'story' | 'task' | 'bug'

export const TASK_TYPE_IDS: Record<IssueTypeKey, string> = {
  epic: 'servone:taskType:Epic',
  story: 'servone:taskType:Story',
  task: 'servone:taskType:Task',
  bug: 'servone:taskType:Bug'
}

/** Task first: the create dialog's type picker defaults to the first type. */
export const TASK_TYPE_ORDER: IssueTypeKey[] = ['task', 'story', 'bug', 'epic']

export const TASK_TYPE_LOOK: Record<IssueTypeKey, { name: string, color: number }> = {
  epic: { name: 'Epic', color: 4 }, // Lavander
  story: { name: 'Story', color: 17 }, // Grass
  task: { name: 'Task', color: 11 }, // Cerulean
  bug: { name: 'Bug', color: 0 } // Firework
}

export type StatusCategoryKey = 'UnStarted' | 'ToDo' | 'Active' | 'Won' | 'Lost'

/**
 * Names match the classic type's statuses, so `createState` reuses those docs and existing issues
 * keep their status when their project moves to Scrum.
 */
export const SCRUM_STATUSES: Array<{ name: string, color: number, category: StatusCategoryKey }> = [
  { name: 'Backlog', color: 21, category: 'UnStarted' }, // Cloud
  { name: 'Todo', color: 23, category: 'ToDo' }, // Porpoise
  { name: 'In Progress', color: 11, category: 'Active' }, // Cerulean
  { name: 'In Review', color: 18, category: 'Active' }, // Sunshine
  { name: 'Done', color: 17, category: 'Won' }, // Grass
  { name: 'Canceled', color: 22, category: 'Lost' } // Coin
]

export type AttrKind = 'number' | 'string' | 'boolean' | 'timestamp' | 'issueRefs'

export const SCRUM_ATTRIBUTES: Array<{
  of: 'Issue' | 'Milestone' | 'Project' | 'TagElement'
  name: string
  label: string
  kind: AttrKind
  hidden: boolean
}> = [
  { of: 'Issue', name: ISSUE_POINTS, label: 'Story points', kind: 'number', hidden: false },
  { of: 'Milestone', name: SPRINT.state, label: 'Sprint state', kind: 'string', hidden: true },
  { of: 'Milestone', name: SPRINT.goal, label: 'Sprint goal', kind: 'string', hidden: false },
  { of: 'Milestone', name: SPRINT.completedAt, label: 'Completed at', kind: 'timestamp', hidden: true },
  { of: 'Milestone', name: SPRINT.committedPoints, label: 'Committed points', kind: 'number', hidden: true },
  { of: 'Milestone', name: SPRINT.committedCount, label: 'Committed issues', kind: 'number', hidden: true },
  { of: 'Milestone', name: SPRINT.completedPoints, label: 'Completed points', kind: 'number', hidden: true },
  { of: 'Milestone', name: SPRINT.completedCount, label: 'Completed issues', kind: 'number', hidden: true },
  { of: 'Milestone', name: SPRINT.rolledOver, label: 'Rolled over', kind: 'issueRefs', hidden: true },
  { of: 'Milestone', name: SPRINT.snapshot, label: 'Sprint snapshot', kind: 'string', hidden: true },
  { of: 'Project', name: PROJECT.lengthDays, label: 'Sprint length (days)', kind: 'number', hidden: true },
  { of: 'Project', name: PROJECT.autoCreate, label: 'Create next sprint automatically', kind: 'boolean', hidden: true },
  { of: 'Project', name: PROJECT.scale, label: 'Estimate scale', kind: 'string', hidden: true },
  { of: 'Project', name: PROJECT.wipLimits, label: 'Work-in-progress limits', kind: 'string', hidden: true },
  { of: 'Project', name: PROJECT.doneNeedsPoints, label: 'Require an estimate before done', kind: 'boolean', hidden: true },
  { of: 'TagElement', name: RELEASE.project, label: 'Release project', kind: 'string', hidden: true },
  { of: 'TagElement', name: RELEASE.startDate, label: 'Start date', kind: 'timestamp', hidden: true },
  { of: 'TagElement', name: RELEASE.releaseDate, label: 'Release date', kind: 'timestamp', hidden: true },
  { of: 'TagElement', name: RELEASE.state, label: 'Release state', kind: 'string', hidden: true },
  { of: 'TagElement', name: RELEASE.releasedAt, label: 'Released at', kind: 'timestamp', hidden: true }
]

/** Icon asset ids registered by ./install.ts (same ids as ./plugin.ts builds). */
export function taskTypeIcon (key: IssueTypeKey): string {
  return `servone-tracker:icon:${key}`
}
