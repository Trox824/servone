import { sprintReport, type IssueHistory } from '../../../packages/servone-ui/src/plugins/tracker-resources/sprints/lib/report'
import type { Sprint, SprintState, StatusKind } from '../../../packages/servone-ui/src/plugins/tracker-resources/sprints/lib/types'
import { ACTIVE, buildScenario, type Scenario, type SeedEvent, type StatusName } from '../scenario'

const NOW = Date.UTC(2026, 8, 23, 6, 30) // Wed 23 Sep 2026, 13:30 in Vietnam
const KIND: Record<StatusName, StatusKind> = {
  Backlog: 'unstarted',
  Todo: 'todo',
  'In Progress': 'active',
  'In Review': 'active',
  Done: 'done',
  Canceled: 'canceled'
}

function histories (s: Scenario): IssueHistory[] {
  const byId = new Map<string, IssueHistory>()
  for (const ev of s.events) {
    if (ev.op === 'issue.create') {
      const issue = s.issues.find((it) => it.key === ev.issue)
      byId.set(ev.issue, {
        _id: ev.issue,
        isEpic: issue?.kind === 'epic',
        created: ev.t,
        initial: { status: KIND[ev.fields.status], sprint: ev.fields.sprint, points: ev.fields.points },
        changes: []
      })
    } else if (ev.op === 'issue.update') {
      byId.get(ev.issue)?.changes.push({
        at: ev.t,
        ...(ev.set.status !== undefined ? { status: KIND[ev.set.status] } : {}),
        ...('sprint' in ev.set ? { sprint: ev.set.sprint } : {}),
        ...('points' in ev.set ? { points: ev.set.points } : {})
      })
    }
  }
  return [...byId.values()]
}

function sprintsAtEnd (s: Scenario): Sprint[] {
  const out = new Map<string, Sprint>()
  for (const ev of s.events) {
    if (ev.op === 'sprint.create') {
      const sp = s.sprints.find((it) => it.key === ev.sprint)
      if (sp !== undefined) out.set(sp.key, { _id: sp.key, label: sp.label, state: 'future', startDate: sp.startDate, targetDate: sp.targetDate })
    } else if (ev.op === 'sprint.update') {
      Object.assign(out.get(ev.sprint) as Sprint, ev.patch)
    }
  }
  return [...out.values()]
}

describe('seed scenario', () => {
  const s = buildScenario({ now: NOW, members: [{ key: 'me', first: 'Founder', last: 'Servone' }] })

  it('is deterministic', () => {
    const again = buildScenario({ now: NOW, members: [{ key: 'me', first: 'Founder', last: 'Servone' }] })
    expect(again.events).toEqual(s.events)
  })

  it('is time-ordered, in the past, and every doc exists before it changes', () => {
    const seen = new Set<string>()
    let prev = 0
    for (const ev of s.events) {
      expect(Number.isInteger(ev.t)).toBe(true)
      expect(ev.t).toBeGreaterThanOrEqual(prev)
      expect(ev.t).toBeLessThanOrEqual(NOW)
      prev = ev.t
      if (ev.op === 'issue.create' || ev.op === 'sprint.create') {
        seen.add(ev.op === 'issue.create' ? ev.issue : ev.sprint)
      } else {
        expect(seen.has(ev.op === 'sprint.update' ? ev.sprint : ev.issue)).toBe(true)
      }
      if ((ev.op === 'issue.create' || ev.op === 'issue.update')) {
        const sprint = ev.op === 'issue.create' ? ev.fields.sprint : ev.set.sprint
        if (sprint !== undefined && sprint !== null) expect(seen.has(sprint)).toBe(true)
      }
    }
  })

  it('numbers issues 1…n in creation order', () => {
    expect(s.issues.map((it) => it.number)).toEqual(s.issues.map((_, i) => i + 1))
    expect(s.issues.length).toBeGreaterThan(100)
    expect(s.issues.length).toBeLessThan(260)
  })

  it('has six closed sprints, one active, two future', () => {
    const states = sprintsAtEnd(s).map((sp) => sp.state)
    const count = (st: SprintState): number => states.filter((x) => x === st).length
    expect([count('closed'), count('active'), count('future')]).toEqual([ACTIVE - 1, 1, 2])
  })

  it('closed sprints finish most of what they commit, and the report agrees with the snapshots', () => {
    const hs = histories(s)
    for (const sp of sprintsAtEnd(s).filter((it) => it.state === 'closed')) {
      const ratio = (sp.completedPoints ?? 0) / (sp.committedPoints ?? 1)
      expect(ratio).toBeGreaterThan(0.55)
      expect(ratio).toBeLessThan(1.25)
      const r = sprintReport(sp, hs, true, NOW)
      expect(r.committed).toBe(sp.committedPoints)
      expect(r.completed.length).toBe(sp.completedCount)
      // Day 0 is the end of the first day: carried-over work often closes that Monday.
      expect(r.burndown[0].remaining).toBeLessThanOrEqual(sp.committedPoints ?? 0)
      const last = r.burndown[r.burndown.length - 1].remaining ?? 0
      expect(last).toBeLessThan(r.burndown[0].remaining ?? 0)
    }
    expect(sprintsAtEnd(s).some((sp) => (sp.rolledOver ?? []).length > 0)).toBe(true)
  })

  it('the active sprint is mid-flight: some done, some in progress, some not started', () => {
    const active = sprintsAtEnd(s).find((sp) => sp.state === 'active') as Sprint
    const hs = histories(s)
    const now = hs
      .map((h) => {
        let v = { ...h.initial }
        for (const c of h.changes) v = { ...v, ...c }
        return v
      })
      .filter((v) => v.sprint === active._id)
    const kinds = new Set(now.map((v) => v.status))
    expect(kinds.has('done')).toBe(true)
    expect(kinds.has('active')).toBe(true)
    expect(kinds.has('todo')).toBe(true)
  })

  it('keeps a backlog, with some unpointed items', () => {
    const final = new Map<string, { sprint: string | null, points: number | null }>()
    for (const ev of s.events) {
      if (ev.op === 'issue.create') final.set(ev.issue, { sprint: ev.fields.sprint, points: ev.fields.points })
      if (ev.op === 'issue.update') Object.assign(final.get(ev.issue) as object, ev.set)
    }
    const epics = new Set(s.issues.filter((it) => it.kind === 'epic').map((it) => it.key))
    const backlog = [...final.entries()].filter(([k, v]) => v.sprint === null && !epics.has(k))
    expect(backlog.length).toBeGreaterThanOrEqual(15)
    expect(backlog.some(([, v]) => v.points === null)).toBe(true)
  })

  it('writes history for the real member too', () => {
    const mine = s.events.filter((ev): ev is Extract<SeedEvent, { op: 'issue.update' }> => ev.op === 'issue.update' && ev.by === 'me')
    expect(mine.length).toBeGreaterThan(3)
  })
})
