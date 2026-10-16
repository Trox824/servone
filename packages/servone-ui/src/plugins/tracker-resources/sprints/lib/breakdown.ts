import { type PlanIssue } from './types'

export type BreakdownBy = 'assignee' | 'epic'

export interface BreakdownRow {
  /** Assignee or epic id; '' for unassigned / no epic. */
  key: string
  count: number
  total: number
  done: number
}

/** Rows by group, biggest first; `byPoints` false weighs every issue as 1. */
export function breakdown (issues: PlanIssue[], by: BreakdownBy, byPoints: boolean): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const it of issues) {
    if (it.isEpic || it.status === 'canceled') continue
    const key = (by === 'assignee' ? it.assignee : it.parent) ?? ''
    const row = rows.get(key) ?? { key, count: 0, total: 0, done: 0 }
    const w = byPoints ? it.points ?? 0 : 1
    row.count++
    row.total += w
    if (it.status === 'done') row.done += w
    rows.set(key, row)
  }
  return [...rows.values()].sort(byShare)
}

/** The none bucket ('', i.e. unassigned / no epic) last; otherwise the biggest share first. */
export function byShare (a: Pick<BreakdownRow, 'key' | 'total' | 'count'>, b: Pick<BreakdownRow, 'key' | 'total' | 'count'>): number {
  if ((a.key === '') !== (b.key === '')) return a.key === '' ? 1 : -1
  return b.total - a.total || b.count - a.count
}

export function weigh (ids: string[], issues: Map<string, PlanIssue>, byPoints: boolean): number {
  return ids.reduce((sum, id) => {
    const it = issues.get(id)
    return sum + (it === undefined ? 0 : byPoints ? it.points ?? 0 : 1)
  }, 0)
}
