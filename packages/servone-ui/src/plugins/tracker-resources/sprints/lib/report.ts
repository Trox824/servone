import { DAY, isOpen, type Sprint, type StatusKind } from './types'

export interface IssueValues {
  status: StatusKind
  sprint: string | null
  points: number | null
}

export interface IssueChange {
  at: number
  status?: StatusKind
  sprint?: string | null
  points?: number | null
}

export interface IssueHistory {
  _id: string
  isEpic: boolean
  created: number
  initial: IssueValues
  /** Any order; sorted on use. */
  changes: IssueChange[]
}

/** The issue's values at time `t`, or `undefined` if it didn't exist yet. */
export function valuesAt (h: IssueHistory, t: number): IssueValues | undefined {
  if (h.created > t) return undefined
  const v: IssueValues = { ...h.initial }
  for (const c of [...h.changes].sort((a, b) => a.at - b.at)) {
    if (c.at > t) break
    if (c.status !== undefined) v.status = c.status
    if (c.sprint !== undefined) v.sprint = c.sprint
    if (c.points !== undefined) v.points = c.points
  }
  return v
}

export interface BurndownPoint {
  /** Start of the day (local time). */
  day: number
  /** Remaining work at the end of that day, `null` for days still in the future. */
  remaining: number | null
  /** Total scope at the end of that day (rises when work is added mid-sprint). */
  scope: number | null
  ideal: number
}

export interface SprintReport {
  byPoints: boolean
  start: number
  end: number
  committed: number
  completed: string[]
  notCompleted: string[]
  added: string[]
  removed: string[]
  burndown: BurndownPoint[]
}

export function startOfDay (t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * `byPoints` false measures issue count (points off for the project). `now` bounds the
 * burndown of a sprint still running: days after it have `remaining: null`.
 */
export function sprintReport (sprint: Sprint, histories: IssueHistory[], byPoints: boolean, now: number): SprintReport {
  const start = sprint.startDate ?? sprint.targetDate
  const plannedEnd = startOfDay(sprint.targetDate) + DAY - 1
  const end = sprint.state === 'closed' && sprint.completedAt !== undefined ? sprint.completedAt : Math.min(now, plannedEnd)
  const last = sprint.state === 'closed' ? end - 1 : end
  const work = histories.filter((h) => !h.isEpic)
  const weight = (v: IssueValues): number => (byPoints ? v.points ?? 0 : 1)

  const measure = (t: number): { remaining: number, scope: number } => {
    let remaining = 0
    let scope = 0
    for (const h of work) {
      const v = valuesAt(h, t)
      if (v === undefined || v.sprint !== sprint._id || v.status === 'canceled') continue
      scope += weight(v)
      if (isOpen(v.status)) remaining += weight(v)
    }
    return { remaining, scope }
  }

  const committedBy = Math.min(Math.max(start, startOfDay(start) + DAY - 1), last)
  const snapshot = byPoints ? sprint.committedPoints : sprint.committedCount
  const committed = snapshot ?? measure(committedBy).scope

  const atStart = new Set<string>()
  const atEnd = new Map<string, IssueValues>()
  for (const h of work) {
    const s = valuesAt(h, committedBy)
    if (s !== undefined && s.sprint === sprint._id) atStart.add(h._id)
    const e = valuesAt(h, last)
    if (e !== undefined && e.sprint === sprint._id && e.status !== 'canceled') atEnd.set(h._id, e)
  }
  const completed: string[] = []
  let notCompleted: string[] = []
  for (const [id, v] of atEnd) (v.status === 'done' ? completed : notCompleted).push(id)
  if (sprint.state === 'closed' && sprint.rolledOver !== undefined) {
    const seen = new Set(notCompleted)
    notCompleted = [...notCompleted, ...sprint.rolledOver.filter((id) => !seen.has(id) && !completed.includes(id))]
  }
  const added = [...atEnd.keys()].filter((id) => !atStart.has(id))
  const removed = [...atStart].filter((id) => !atEnd.has(id) && !notCompleted.includes(id))

  const burndown: BurndownPoint[] = []
  const firstDay = startOfDay(start)
  const lastDay = startOfDay(sprint.targetDate)
  const days = Math.max(1, Math.round((lastDay - firstDay) / DAY) + 1)
  for (let i = 0; i < days; i++) {
    const day = firstDay + i * DAY
    const endOfDay = Math.min(day + DAY - 1, last)
    const ideal = days === 1 ? 0 : committed * (1 - i / (days - 1))
    if (day > last) {
      burndown.push({ day, remaining: null, scope: null, ideal })
    } else {
      const m = measure(i === 0 ? Math.max(start, endOfDay) : endOfDay)
      burndown.push({ day, remaining: m.remaining, scope: m.scope, ideal })
    }
  }

  return { byPoints, start, end, committed, completed, notCompleted, added, removed, burndown }
}

export interface VelocityEntry {
  sprint: string
  label: string
  committed: number
  completed: number
}

/**
 * Committed vs completed for the last `limit` closed sprints, oldest first. Snapshots win;
 * `fallback` (the history-computed report) fills sprints closed before snapshots existed.
 */
export function velocity (
  sprints: Sprint[],
  limit: number,
  fallback: (s: Sprint) => { committed: number, completed: number } | undefined
): VelocityEntry[] {
  return sprints
    .filter((s) => s.state === 'closed')
    .sort((a, b) => (a.completedAt ?? a.targetDate) - (b.completedAt ?? b.targetDate))
    .slice(-limit)
    .map((s) => {
      const fb = s.committedPoints === undefined || s.completedPoints === undefined ? fallback(s) : undefined
      return {
        sprint: s._id,
        label: s.label,
        committed: s.committedPoints ?? fb?.committed ?? 0,
        completed: s.completedPoints ?? fb?.completed ?? 0
      }
    })
}
