import { sprintIssuesSnapshot } from './snapshot'
import { totals } from './totals'
import {
  DAY,
  isOpen,
  type PlanIssue,
  type ProjectSprintSettings,
  type Sprint,
  type SprintIssuesSnapshot,
  type SprintState
} from './types'

export interface SprintPatch {
  state: SprintState
  label?: string
  goal?: string
  startDate?: number | null
  targetDate?: number
  committedPoints?: number
  committedCount?: number
  completedPoints?: number
  completedCount?: number
  completedAt?: number
  rolledOver?: string[]
  issuesSnapshot?: SprintIssuesSnapshot
}

export interface NewSprint {
  label: string
  startDate: number
  targetDate: number
}

export type Warning = 'another-active' | 'no-issues' | 'unpointed'

export type TransitionError = 'not-future' | 'not-active' | 'not-closed' | 'not-admin' | 'bad-dates'

export type Result<T> = { ok: true, value: T, warnings: Warning[] } | { ok: false, error: TransitionError }

function startOfDay (t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Name and dates of the sprint that follows `sprints`: "<Project> Sprint N", starting the day after the last one. */
export function nextSprintDefaults (
  sprints: Sprint[],
  settings: Pick<ProjectSprintSettings, 'lengthDays'>,
  projectName: string,
  now: number
): NewSprint {
  let maxN = 0
  const re = /Sprint\s+(\d+)\s*$/i
  for (const s of sprints) {
    const m = re.exec(s.label)
    if (m !== null) maxN = Math.max(maxN, Number(m[1]))
  }
  const n = Math.max(maxN, sprints.length) + 1
  const lastEnd = sprints.reduce<number | null>((acc, s) => (acc === null || s.targetDate > acc ? s.targetDate : acc), null)
  const startDate = lastEnd === null ? startOfDay(now) : startOfDay(lastEnd) + DAY
  const length = Math.max(1, Math.round(settings.lengthDays))
  return { label: `${projectName} Sprint ${n}`, startDate, targetDate: startDate + (length - 1) * DAY }
}

export interface StartInput {
  label?: string
  goal?: string
  startDate: number
  targetDate: number
}

/** Another active sprint is a warning, not a block. */
export function startSprint (sprint: Sprint, projectSprints: Sprint[], sprintIssues: PlanIssue[], input: StartInput): Result<SprintPatch> {
  if (sprint.state !== 'future') return { ok: false, error: 'not-future' }
  if (input.targetDate < input.startDate) return { ok: false, error: 'bad-dates' }
  const warnings: Warning[] = []
  if (projectSprints.some((s) => s._id !== sprint._id && s.state === 'active')) warnings.push('another-active')
  const t = totals(sprintIssues)
  if (t.count === 0) warnings.push('no-issues')
  if (t.unpointed > 0) warnings.push('unpointed')
  return {
    ok: true,
    warnings,
    value: {
      state: 'active',
      label: input.label ?? sprint.label,
      goal: input.goal ?? sprint.goal,
      startDate: input.startDate,
      targetDate: input.targetDate,
      committedPoints: t.points,
      committedCount: t.count
    }
  }
}

export function issuesToCommit (sprintIssues: PlanIssue[], epics: PlanIssue[]): string[] {
  const parents = new Set(sprintIssues.map((it) => it.parent).filter((p): p is string => p !== null))
  return [
    ...sprintIssues.filter((it) => it.status === 'unstarted').map((it) => it._id),
    ...epics.filter((e) => parents.has(e._id) && e.status === 'unstarted').map((e) => e._id)
  ]
}

export type RolloverTarget = { kind: 'next' } | { kind: 'new' } | { kind: 'backlog' } | { kind: 'sprint', sprint: string }

/** `NEW_SPRINT` in a move means "the sprint created by this same completion". */
export const NEW_SPRINT = '__new__'

export interface IssueMove {
  issue: string
  to: string | null
}

export interface Completion {
  sprint: SprintPatch
  moves: IssueMove[]
  create?: NewSprint
}

export interface CompleteInput {
  target: RolloverTarget
  now: number
  settings: Pick<ProjectSprintSettings, 'lengthDays' | 'autoCreate'>
  projectName: string
}

/** Also creates the next sprint when the project auto-creates and nothing is planned. */
export function completeSprint (
  sprint: Sprint,
  projectSprints: Sprint[],
  sprintIssues: PlanIssue[],
  input: CompleteInput
): Result<Completion> {
  if (sprint.state !== 'active') return { ok: false, error: 'not-active' }
  const t = totals(sprintIssues)
  const open = sprintIssues.filter((it) => isOpen(it.status) && !it.isEpic)

  const others = projectSprints.filter((s) => s._id !== sprint._id)
  const nextFuture = others
    .filter((s) => s.state === 'future')
    .sort((a, b) => (a.startDate ?? a.targetDate) - (b.startDate ?? b.targetDate))[0]

  let create: NewSprint | undefined
  let to: string | null
  switch (input.target.kind) {
    case 'backlog':
      to = null
      break
    case 'sprint': {
      const target = others.find((s) => s._id === (input.target as { sprint: string }).sprint)
      if (target === undefined || target.state === 'closed') return { ok: false, error: 'not-future' }
      to = target._id
      break
    }
    case 'next':
      to = nextFuture?._id ?? NEW_SPRINT
      break
    case 'new':
      to = NEW_SPRINT
      break
  }
  const closedSelf: Sprint = { ...sprint, state: 'closed' }
  if (to === NEW_SPRINT || (input.settings.autoCreate && nextFuture === undefined)) {
    create = nextSprintDefaults([...others, closedSelf], input.settings, input.projectName, input.now)
  }

  return {
    ok: true,
    warnings: [],
    value: {
      sprint: {
        state: 'closed',
        completedAt: input.now,
        completedPoints: t.donePoints,
        completedCount: t.doneCount,
        rolledOver: open.map((it) => it._id),
        issuesSnapshot: sprintIssuesSnapshot(sprintIssues)
      },
      moves: open.map((it) => ({ issue: it._id, to })),
      create
    }
  }
}

/** Reopen a closed sprint — admins only; warns when another sprint is already active. */
export function reopenSprint (sprint: Sprint, projectSprints: Sprint[], isAdmin: boolean): Result<SprintPatch> {
  if (!isAdmin) return { ok: false, error: 'not-admin' }
  if (sprint.state !== 'closed') return { ok: false, error: 'not-closed' }
  const warnings: Warning[] = projectSprints.some((s) => s._id !== sprint._id && s.state === 'active') ? ['another-active'] : []
  return { ok: true, warnings, value: { state: 'active', completedAt: undefined, issuesSnapshot: undefined } }
}

/** A closed sprint's membership is history: adding issues to it is refused (the UI warns). */
export function canAddToSprint (sprint: Pick<Sprint, 'state'> | undefined): boolean {
  return sprint === undefined || sprint.state !== 'closed'
}
