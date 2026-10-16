import type { CycleTime } from './flow'
import { DAY, type PlanIssue, type SnapshotIssue, type SprintIssuesSnapshot } from './types'

export function sprintIssuesSnapshot (issues: PlanIssue[]): SprintIssuesSnapshot {
  return {
    v: 1,
    issues: issues
      .filter((issue) => !issue.isEpic && issue.status !== 'canceled')
      .map((issue) => ({
        id: issue._id,
        assignee: issue.assignee ?? null,
        epic: issue.parent,
        points: issue.points,
        done: issue.status === 'done',
        startedOn: issue.startedOn ?? null,
        completedOn: issue.completedOn ?? null
      }))
  }
}

type StoredRow = Partial<Record<keyof SnapshotIssue, string | number | boolean | null>> | null

/** Malformed rows are dropped; anything that isn't a v1 snapshot reads as none. */
export function parseSprintSnapshot (raw: string | undefined): SprintIssuesSnapshot | undefined {
  if (raw === undefined || raw === '') return undefined
  let parsed: { v?: number, issues?: StoredRow[] } | null
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  if (parsed === null || typeof parsed !== 'object' || parsed.v !== 1 || !Array.isArray(parsed.issues)) return undefined
  const issues: SnapshotIssue[] = []
  for (const row of parsed.issues) {
    if (row === null || typeof row !== 'object') continue
    const { id, assignee, epic, points, done, startedOn, completedOn } = row
    if (
      typeof id !== 'string' ||
      typeof done !== 'boolean' ||
      (typeof assignee !== 'string' && assignee !== null) ||
      (typeof epic !== 'string' && epic !== null) ||
      (typeof points !== 'number' && points !== null) ||
      (typeof startedOn !== 'number' && startedOn !== null) ||
      (typeof completedOn !== 'number' && completedOn !== null)
    ) {
      continue
    }
    issues.push({ id, assignee, epic, points, done, startedOn, completedOn })
  }
  return { v: 1, issues }
}

export function snapshotPlanIssues (snapshot: SprintIssuesSnapshot, sprint: string): PlanIssue[] {
  return snapshot.issues.map((row) => ({
    _id: row.id,
    parent: row.epic,
    isEpic: false,
    status: row.done ? 'done' : 'todo',
    points: row.points,
    estimation: 0,
    sprint,
    assignee: row.assignee
  }))
}

export function snapshotCycleTimes (snapshot: SprintIssuesSnapshot): CycleTime[] {
  const cycles: CycleTime[] = []
  for (const row of snapshot.issues) {
    if (!row.done || row.startedOn === null || row.completedOn === null) continue
    const startedAt = Math.min(row.startedOn, row.completedOn)
    cycles.push({ _id: row.id, startedAt, doneAt: row.completedOn, days: (row.completedOn - startedAt) / DAY })
  }
  return cycles.sort((a, b) => a.doneAt - b.doneAt)
}
