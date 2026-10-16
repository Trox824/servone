import type { PlanIssue } from './types'

export interface Totals {
  count: number
  points: number
  hours: number
  /** Issues that count toward the totals but have no points. */
  unpointed: number
  doneCount: number
  donePoints: number
}

export function totals (issues: Iterable<PlanIssue>): Totals {
  const t: Totals = { count: 0, points: 0, hours: 0, unpointed: 0, doneCount: 0, donePoints: 0 }
  for (const it of issues) {
    if (it.status === 'canceled' || it.isEpic) continue
    const p = it.points ?? 0
    t.count++
    t.points += p
    t.hours += it.estimation ?? 0
    if (it.points === null || it.points === undefined) t.unpointed++
    if (it.status === 'done') {
      t.doneCount++
      t.donePoints += p
    }
  }
  return t
}

export interface EpicProgress extends Totals {
  /** True when progress is measured in points (some child has points), false for issue count. */
  byPoints: boolean
  /** 0..1 */
  ratio: number
  /** Children in progress (started, not done), by count and by points. */
  activeCount: number
  activePoints: number
  /** 0..1, in progress ÷ total, in the same unit as `ratio`. */
  activeRatio: number
}

/**
 * Derived on read, never stored: done ÷ total by points when any child is pointed, by count
 * otherwise. Sub-tasks roll into their parent, so only the epic's direct children are counted.
 */
export function epicProgress (epicId: string, issues: PlanIssue[]): EpicProgress {
  const direct = issues.filter((it) => it.parent === epicId)
  const t = totals(direct)
  const byPoints = t.points > 0
  const total = byPoints ? t.points : t.count
  const done = byPoints ? t.donePoints : t.doneCount
  const active = direct.filter((it) => it.status === 'active' && !it.isEpic)
  const activeCount = active.length
  const activePoints = active.reduce((n, it) => n + (it.points ?? 0), 0)
  const act = byPoints ? activePoints : activeCount
  return {
    ...t,
    byPoints,
    ratio: total === 0 ? 0 : done / total,
    activeCount,
    activePoints,
    activeRatio: total === 0 ? 0 : act / total
  }
}

/** Issues shown as rows in the backlog: top-level work, no epics, no sub-tasks. */
export function isBacklogRow (issue: PlanIssue, epicIds: Set<string>): boolean {
  if (issue.isEpic) return false
  return issue.parent === null || epicIds.has(issue.parent)
}
