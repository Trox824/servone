import { valuesAt, startOfDay, type IssueHistory } from './report'
import { DAY, type Sprint, type StatusKind } from './types'

export interface FlowPoint {
  /** Start of the day (local time). */
  day: number
  todo: number
  active: number
  done: number
}

/** Unstarted counts as "todo"; epics and canceled work are left out. */
export function cumulativeFlow (sprint: Sprint, histories: IssueHistory[], byPoints: boolean, now: number): FlowPoint[] {
  const start = sprint.startDate ?? sprint.targetDate
  const closedAt = sprint.state === 'closed' && sprint.completedAt !== undefined ? sprint.completedAt - 1 : undefined
  const last = Math.min(closedAt ?? now, startOfDay(sprint.targetDate) + DAY - 1)
  const work = histories.filter((h) => !h.isEpic)
  const out: FlowPoint[] = []
  for (let day = startOfDay(start); day <= last; day += DAY) {
    const t = Math.min(day + DAY - 1, last)
    const p: FlowPoint = { day, todo: 0, active: 0, done: 0 }
    for (const h of work) {
      const v = valuesAt(h, t)
      if (v === undefined || v.sprint !== sprint._id || v.status === 'canceled') continue
      const w = byPoints ? v.points ?? 0 : 1
      p[stage(v.status)] += w
    }
    out.push(p)
  }
  return out
}

function stage (s: StatusKind): 'todo' | 'active' | 'done' {
  return s === 'done' ? 'done' : s === 'active' ? 'active' : 'todo'
}

export interface CycleTime {
  _id: string
  /** First move to a started status; the creation time for work that went straight to done. */
  startedAt: number
  doneAt: number
  /** Fractional days. */
  days: number
}

/** Cycle time of each issue in `ids` that is done now (its last move to done), epics left out. */
export function cycleTimes (histories: IssueHistory[], ids: Iterable<string>): CycleTime[] {
  const wanted = new Set(ids)
  const out: CycleTime[] = []
  for (const h of histories) {
    if (h.isEpic || !wanted.has(h._id)) continue
    const changes = [...h.changes].sort((a, b) => a.at - b.at)
    let status = h.initial.status
    let startedAt: number | undefined = status === 'active' ? h.created : undefined
    let doneAt: number | undefined = status === 'done' ? h.created : undefined
    for (const c of changes) {
      if (c.status === undefined || c.status === status) continue
      status = c.status
      if (status === 'active' && startedAt === undefined) startedAt = c.at
      doneAt = status === 'done' ? c.at : undefined
    }
    if (status !== 'done' || doneAt === undefined) continue
    const from = Math.min(startedAt ?? h.created, doneAt)
    out.push({ _id: h._id, startedAt: from, doneAt, days: (doneAt - from) / DAY })
  }
  return out.sort((a, b) => a.doneAt - b.doneAt)
}

/** Nearest-rank percentile (0–100) of `values`; undefined for none. */
export function percentile (values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[rank - 1]
}
