import {
  canAddToSprint,
  completeSprint,
  issuesToCommit,
  NEW_SPRINT,
  nextSprintDefaults,
  reopenSprint,
  startSprint
} from '../lifecycle'
import { DAY, type PlanIssue, type Sprint } from '../types'

const T0 = new Date(2026, 9, 1).getTime() // Thu 1 Oct 2026, local midnight

function sprint (_id: string, over: Partial<Sprint> = {}): Sprint {
  return { _id, label: `SRV Sprint ${_id}`, state: 'future', startDate: T0, targetDate: T0 + 6 * DAY, ...over }
}

function issue (_id: string, over: Partial<PlanIssue> = {}): PlanIssue {
  return { _id, parent: null, isEpic: false, status: 'todo', points: 3, estimation: 8, sprint: 's1', ...over }
}

const settings = { lengthDays: 7, autoCreate: false }

describe('startSprint', () => {
  it('activates a future sprint and snapshots what was committed', () => {
    const s = sprint('s1')
    const r = startSprint(s, [s], [issue('a'), issue('b', { points: 5 }), issue('c', { status: 'canceled' })], {
      goal: 'Ship it',
      startDate: T0,
      targetDate: T0 + 6 * DAY
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({ state: 'active', goal: 'Ship it', committedPoints: 8, committedCount: 2 })
    expect(r.warnings).toEqual([])
  })

  it('warns, but does not block, when another sprint is active', () => {
    const s = sprint('s1')
    const r = startSprint(s, [s, sprint('s0', { state: 'active' })], [issue('a')], { startDate: T0, targetDate: T0 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings).toContain('another-active')
  })

  it('warns about empty and unpointed sprints', () => {
    const s = sprint('s1')
    const empty = startSprint(s, [s], [], { startDate: T0, targetDate: T0 })
    if (empty.ok) expect(empty.warnings).toContain('no-issues')
    const unpointed = startSprint(s, [s], [issue('a', { points: null })], { startDate: T0, targetDate: T0 })
    if (unpointed.ok) expect(unpointed.warnings).toContain('unpointed')
  })

  it('refuses sprints that are not future and inverted dates', () => {
    const active = sprint('s1', { state: 'active' })
    expect(startSprint(active, [active], [], { startDate: T0, targetDate: T0 })).toEqual({ ok: false, error: 'not-future' })
    const s = sprint('s2')
    expect(startSprint(s, [s], [], { startDate: T0 + DAY, targetDate: T0 })).toEqual({ ok: false, error: 'bad-dates' })
  })
})

describe('issuesToCommit', () => {
  it('moves unstarted sprint work and its unstarted epics to To do, and nothing else', () => {
    const work = [
      issue('a', { status: 'unstarted', parent: 'e1' }),
      issue('b', { status: 'active', parent: 'e2' }),
      issue('c', { status: 'done' }),
      issue('d', { status: 'unstarted' })
    ]
    const epics = [
      issue('e1', { isEpic: true, status: 'unstarted', sprint: null }),
      issue('e2', { isEpic: true, status: 'todo', sprint: null }),
      issue('e3', { isEpic: true, status: 'unstarted', sprint: null })
    ]
    expect(issuesToCommit(work, epics)).toEqual(['a', 'd', 'e1'])
  })
})

describe('completeSprint', () => {
  const active = sprint('s1', { state: 'active' })
  const future = sprint('s2', { startDate: T0 + 7 * DAY, targetDate: T0 + 13 * DAY })
  const issues = [
    issue('done', { status: 'done', points: 5 }),
    issue('open', { status: 'active', points: 3 }),
    issue('todo', { points: 2 }),
    issue('gone', { status: 'canceled' }),
    issue('epic', { isEpic: true, status: 'todo' })
  ]
  const now = T0 + 6 * DAY + 3600_000

  it('rolls open issues into the next future sprint and snapshots the result', () => {
    const r = completeSprint(active, [active, future], issues, { target: { kind: 'next' }, now, settings, projectName: 'SRV' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.sprint).toEqual({
      state: 'closed',
      completedAt: now,
      completedPoints: 5,
      completedCount: 1,
      rolledOver: ['open', 'todo'],
      issuesSnapshot: {
        v: 1,
        issues: [
          { id: 'done', assignee: null, epic: null, points: 5, done: true, startedOn: null, completedOn: null },
          { id: 'open', assignee: null, epic: null, points: 3, done: false, startedOn: null, completedOn: null },
          { id: 'todo', assignee: null, epic: null, points: 2, done: false, startedOn: null, completedOn: null }
        ]
      }
    })
    expect(r.value.moves).toEqual([
      { issue: 'open', to: 's2' },
      { issue: 'todo', to: 's2' }
    ])
    expect(r.value.create).toBeUndefined()
  })

  it('moves open issues to the backlog', () => {
    const r = completeSprint(active, [active, future], issues, { target: { kind: 'backlog' }, now, settings, projectName: 'SRV' })
    if (r.ok) expect(r.value.moves.every((m) => m.to === null)).toBe(true)
  })

  it('creates a new sprint when asked to, dated after the last one', () => {
    const r = completeSprint(active, [active, future], issues, { target: { kind: 'new' }, now, settings, projectName: 'SRV' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.moves[0].to).toBe(NEW_SPRINT)
    expect(r.value.create).toEqual({ label: 'SRV Sprint 3', startDate: T0 + 14 * DAY, targetDate: T0 + 20 * DAY })
  })

  it('falls back to a new sprint when "next" has nothing planned', () => {
    const r = completeSprint(active, [active], issues, { target: { kind: 'next' }, now, settings, projectName: 'SRV' })
    if (r.ok) {
      expect(r.value.moves[0].to).toBe(NEW_SPRINT)
      expect(r.value.create?.startDate).toBe(T0 + 7 * DAY)
    }
  })

  it('auto-creates the next sprint when the project asks and none is planned', () => {
    const auto = { lengthDays: 14, autoCreate: true }
    const r = completeSprint(active, [active], issues, { target: { kind: 'backlog' }, now, settings: auto, projectName: 'SRV' })
    if (r.ok) expect(r.value.create).toEqual({ label: 'SRV Sprint 2', startDate: T0 + 7 * DAY, targetDate: T0 + 20 * DAY })
    const planned = completeSprint(active, [active, future], issues, { target: { kind: 'backlog' }, now, settings: auto, projectName: 'SRV' })
    if (planned.ok) expect(planned.value.create).toBeUndefined()
  })

  it('refuses a sprint that is not active and a closed target', () => {
    expect(completeSprint(future, [future], [], { target: { kind: 'backlog' }, now, settings, projectName: 'SRV' })).toEqual({
      ok: false,
      error: 'not-active'
    })
    const closed = sprint('s0', { state: 'closed' })
    expect(
      completeSprint(active, [active, closed], issues, { target: { kind: 'sprint', sprint: 's0' }, now, settings, projectName: 'SRV' })
    ).toEqual({ ok: false, error: 'not-future' })
  })
})

describe('nextSprintDefaults', () => {
  it('starts today when the project has no sprints', () => {
    const d = nextSprintDefaults([], { lengthDays: 7 }, 'SRV', T0 + 5 * 3600_000)
    expect(d).toEqual({ label: 'SRV Sprint 1', startDate: T0, targetDate: T0 + 6 * DAY })
  })
})

describe('guards', () => {
  it('refuses adding issues to a closed sprint', () => {
    expect(canAddToSprint({ state: 'closed' })).toBe(false)
    expect(canAddToSprint({ state: 'active' })).toBe(true)
    expect(canAddToSprint(undefined)).toBe(true)
  })

  it('lets only admins reopen a closed sprint', () => {
    const closed = sprint('s1', { state: 'closed', completedAt: T0 })
    expect(reopenSprint(closed, [closed], false)).toEqual({ ok: false, error: 'not-admin' })
    const r = reopenSprint(closed, [closed], true)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.state).toBe('active')
  })

  it('clears the completion snapshot when a sprint is reopened', () => {
    const closed = sprint('s1', { state: 'closed', completedAt: T0 })
    const r = reopenSprint(closed, [closed], true)
    expect(r.ok && 'issuesSnapshot' in r.value && r.value.issuesSnapshot === undefined).toBe(true)
  })
})
