import type { PlanIssue, Sprint } from './types'

export interface StatusSplit {
  todo: number
  active: number
  done: number
}

/** Work by stage, in points (`byPoints`) or issues. Epics and canceled work are left out. */
export function statusSplit (issues: Iterable<PlanIssue>, byPoints: boolean): StatusSplit {
  const s: StatusSplit = { todo: 0, active: 0, done: 0 }
  for (const it of issues) {
    if (it.isEpic || it.status === 'canceled') continue
    const w = byPoints ? it.points ?? 0 : 1
    if (it.status === 'done') s.done += w
    else if (it.status === 'active') s.active += w
    else s.todo += w
  }
  return s
}

export const CAPACITY_WINDOW = 3

/** Undefined before any sprint has closed with a recorded result. */
export function capacity (sprints: Sprint[], byPoints: boolean): number | undefined {
  const done = sprints
    .filter((s) => s.state === 'closed')
    .map((s) => ({ at: s.completedAt ?? s.targetDate, value: byPoints ? s.completedPoints : s.completedCount }))
    .filter((s): s is { at: number, value: number } => typeof s.value === 'number')
    .sort((a, b) => b.at - a.at)
    .slice(0, CAPACITY_WINDOW)
  if (done.length === 0) return undefined
  return Math.round(done.reduce((sum, s) => sum + s.value, 0) / done.length)
}
