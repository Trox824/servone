//
// Builds the seed scenario (~14 weeks of 2-week sprints) as a time-ordered event list.
// Pure: no platform imports, deterministic for a given `now` and `seed`.
//
// Sprint transitions use the app's `startSprint` / `completeSprint`, so snapshots and rollovers match the sprint screens.
//
import {
  completeSprint,
  startSprint,
  type SprintPatch
} from '../../packages/servone-ui/src/plugins/tracker-resources/sprints/lib/lifecycle'
import type { PlanIssue, Sprint, StatusKind } from '../../packages/servone-ui/src/plugins/tracker-resources/sprints/lib/types'
import { COMMENTS, EPICS, LOOSE_BUGS, PEOPLE, SPRINT_GOALS, type EpicSpec, type PersonSpec } from './content'

export const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
/** The team works in Vietnam time (UTC+7, no DST). */
const TZ = 7 * HOUR

export const SPRINT_DAYS = 14
/** Sprints 1…6 are closed, 7 is running (today is inside it), 8 and 9 are planned. */
export const ACTIVE = 7
export const LAST = 9

export type Kind = 'epic' | 'story' | 'task' | 'bug'
export type StatusName = 'Backlog' | 'Todo' | 'In Progress' | 'In Review' | 'Done' | 'Canceled'

export interface SeedPerson extends PersonSpec {
  /** A real workspace member (the script looks them up) rather than a demo teammate. */
  real?: boolean
}

export interface SeedSprint {
  key: string
  index: number
  label: string
  goal: string
  startDate: number
  targetDate: number
}

export interface SeedIssue {
  key: string
  /** Issue number in the project, in creation order. */
  number: number
  kind: Kind
  title: string
  /** Key of the parent epic issue, for work items. */
  epic: string | null
  priority: number
  startDate: number | null
  dueDate: number | null
}

export interface IssueFields {
  status: StatusName
  points: number | null
  assignee: string | null
  sprint: string | null
}

export type SeedEvent =
  | { t: number, by: string, op: 'sprint.create', sprint: string }
  | { t: number, by: string, op: 'sprint.update', sprint: string, patch: SprintPatch }
  | { t: number, by: string, op: 'issue.create', issue: string, fields: IssueFields }
  | { t: number, by: string, op: 'issue.update', issue: string, set: Partial<IssueFields> }
  | { t: number, by: string, op: 'comment', issue: string, text: string }

export interface Scenario {
  projectName: string
  projectCreated: number
  people: SeedPerson[]
  sprints: SeedSprint[]
  /** In creation (= number) order; that is also the backlog rank order. */
  issues: SeedIssue[]
  events: SeedEvent[]
}

export interface ScenarioOptions {
  now: number
  seed?: number
  /** Real members to include as part-time developers. */
  members?: Array<{ key: string, first: string, last: string }>
  projectName?: string
  /** Sprint names are "<prefix> Sprint N", like the app names them (it uses the project identifier). */
  sprintPrefix?: string
}

const PM = 'linh'
const QA = 'thao'
const STATUS_KIND: Record<StatusName, StatusKind> = {
  Backlog: 'unstarted',
  Todo: 'todo',
  'In Progress': 'active',
  'In Review': 'active',
  Done: 'done',
  Canceled: 'canceled'
}
const FIB = [1, 2, 3, 5, 8, 13]

function mulberry32 (seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function localMidnight (t: number): number {
  return Math.floor((t + TZ) / DAY) * DAY - TZ
}

function mondayOnOrBefore (t: number): number {
  const m = localMidnight(t)
  const dow = new Date(m + TZ).getUTCDay() // 0 = Sunday
  return m - ((dow + 6) % 7) * DAY
}

interface Sim {
  issue: SeedIssue
  f: IssueFields
  created: number
  /** Developer-days of work left. */
  work: number
  /** Work-days of review left once in review. */
  review: number
  epicSpec?: EpicSpec
}

interface QueueItem {
  sim: Sim
  /** Work-day position from which the item can be picked up. */
  from: number
  rank: number
}

export function buildScenario (opts: ScenarioOptions): Scenario {
  const now = opts.now
  const rnd = mulberry32(opts.seed ?? 7)
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
  const between = (a: number, b: number): number => a + rnd() * (b - a)
  const chance = (p: number): boolean => rnd() < p
  const projectName = opts.projectName ?? 'Servone App'
  const sprintPrefix = opts.sprintPrefix ?? 'APP'

  const people: SeedPerson[] = [
    ...PEOPLE,
    ...(opts.members ?? []).map((m) => ({ ...m, role: 'dev' as const, capacity: 0.5, real: true }))
  ]
  const devs = people.filter((p) => p.capacity > 0)
  const capacity = new Map(people.map((p) => [p.key, p.capacity]))
  const teamCapacity = devs.reduce((s, p) => s + p.capacity, 0)

  // Calendar: sprint k = two Mon–Fri weeks; position w ∈ [0, 10) = work-days into it, 9:00–18:00.
  const activeStart = mondayOnOrBefore(now - 5 * DAY)
  const sprintStart = (k: number): number => activeStart + (k - ACTIVE) * SPRINT_DAYS * DAY
  const dayOffset = (d: number): number => (d < 5 ? d : d + 2)
  const at = (k: number, w: number): number => {
    const d = Math.min(9, Math.max(0, Math.floor(w)))
    const frac = Math.min(Math.max(w - d, 0), 0.999)
    return sprintStart(k) + dayOffset(d) * DAY + Math.round((9 + frac * 9) * HOUR)
  }
  const wOf = (k: number, t: number): number => {
    for (let d = 0; d < 10; d++) {
      const open = sprintStart(k) + dayOffset(d) * DAY + 9 * HOUR
      if (t < open) return d
      if (t < open + 9 * HOUR) return d + (t - open) / (9 * HOUR)
    }
    return 10
  }
  /** Last work-day position events may happen at in sprint k. */
  const endOf = (k: number): number => (k < ACTIVE ? 9.9 : Math.min(9.9, wOf(k, now) - 0.02))
  const completionTime = (k: number): number => at(k, 9.95)

  const events: SeedEvent[] = []
  const sims = new Map<string, Sim>()
  const issues: SeedIssue[] = []
  let nextKey = 0

  function createIssue (
    t: number,
    by: string,
    spec: { kind: Kind, title: string, epic: string | null, priority: number, startDate?: number | null, dueDate?: number | null },
    fields: IssueFields,
    epicSpec?: EpicSpec
  ): Sim {
    const issue: SeedIssue = {
      key: `i${++nextKey}`,
      number: 0,
      startDate: null,
      dueDate: null,
      ...spec
    }
    const sim: Sim = { issue, f: { ...fields }, created: t, work: workFor(fields.points, spec.kind), review: 0, epicSpec }
    sims.set(issue.key, sim)
    issues.push(issue)
    events.push({ t, by, op: 'issue.create', issue: issue.key, fields: { ...fields } })
    return sim
  }
  function update (t: number, by: string, sim: Sim, set: Partial<IssueFields>): void {
    Object.assign(sim.f, set)
    events.push({ t, by, op: 'issue.update', issue: sim.issue.key, set })
  }
  function comment (t: number, by: string, sim: Sim, text: string): void {
    if (t <= now) events.push({ t, by, op: 'comment', issue: sim.issue.key, text })
  }
  function workFor (points: number | null, kind: Kind): number {
    if (kind === 'epic') return 0
    return 0.2 + (points ?? 2) * between(0.5, 0.9)
  }
  function pointsFor (kind: Kind): number {
    if (kind === 'story') return pick([2, 3, 3, 5, 5, 5, 8, 8, 13])
    if (kind === 'task') return pick([1, 2, 2, 3, 3, 5])
    return pick([1, 1, 2, 2, 3])
  }
  function priorityFor (kind: Kind): number {
    if (kind === 'bug') return pick([1, 2, 2, 3])
    if (kind === 'story') return pick([0, 2, 3, 3, 3, 4])
    return pick([0, 3, 3, 4])
  }

  const sprints: SeedSprint[] = []
  const sprintState = new Map<string, Sprint>()
  const sprintKey = (k: number): string => `s${k}`
  for (let k = 1; k <= LAST; k++) {
    const s: SeedSprint = {
      key: sprintKey(k),
      index: k,
      label: `${sprintPrefix} Sprint ${k}`,
      goal: SPRINT_GOALS[k - 1] ?? '',
      startDate: sprintStart(k),
      targetDate: sprintStart(k) + (SPRINT_DAYS - 1) * DAY
    }
    sprints.push(s)
  }
  function createSprint (t: number, k: number): void {
    const s = sprints[k - 1]
    sprintState.set(s.key, {
      _id: s.key,
      label: s.label,
      state: 'future',
      goal: s.goal,
      startDate: s.startDate,
      targetDate: s.targetDate
    })
    events.push({ t, by: PM, op: 'sprint.create', sprint: s.key })
  }
  const planIssues = (k: number): PlanIssue[] =>
    [...sims.values()]
      .filter((s) => s.f.sprint === sprintKey(k))
      .map((s) => ({
        _id: s.issue.key,
        parent: s.issue.epic,
        isEpic: s.issue.kind === 'epic',
        status: STATUS_KIND[s.f.status],
        points: s.f.points,
        estimation: 0,
        sprint: s.f.sprint,
        assignee: s.f.assignee
      }))

  // Backlog: epics and their items, written when the team grooms them.
  const projectCreated = sprintStart(1) - 7 * DAY + 10 * HOUR
  const epicSim = new Map<string, Sim>()
  function groomEpic (e: EpicSpec, t0: number): void {
    const lead = pick(devs.filter((d) => !d.real)).key
    const epic = createIssue(
      t0,
      PM,
      {
        kind: 'epic',
        title: e.title,
        epic: null,
        priority: 0,
        startDate: e.from <= LAST ? sprintStart(e.from) : null,
        dueDate: e.to <= LAST ? sprintStart(e.to) + (SPRINT_DAYS - 1) * DAY : null
      },
      { status: 'Backlog', points: null, assignee: lead, sprint: null },
      e
    )
    epicSim.set(e.key, epic)
    const far = e.from > LAST
    const items: Array<[Kind, string]> = [...e.stories.map((s) => ['story', s] as [Kind, string]), ...e.tasks.map((s) => ['task', s] as [Kind, string])]
    let t = t0
    for (const [kind, title] of items) {
      t += Math.round(between(2, 25) * 60 * 1000)
      const pointed = !far || chance(0.4)
      createIssue(
        t,
        chance(0.7) ? PM : lead,
        { kind, title, epic: epic.issue.key, priority: priorityFor(kind) },
        { status: 'Backlog', points: pointed ? pointsFor(kind) : null, assignee: null, sprint: null },
        e
      )
    }
  }
  createSprint(projectCreated + 1 * HOUR, 1)
  createSprint(projectCreated + 1 * HOUR + 5 * 60 * 1000, 2)
  for (const e of EPICS.filter((e) => e.from <= 2)) groomEpic(e, projectCreated + between(3, 30) * HOUR)
  const groomed = new Set(EPICS.filter((e) => e.from <= 2).map((e) => e.key))

  const bugPool = new Map(EPICS.map((e) => [e.key, [...e.bugs]]))
  const looseBugs = [...LOOSE_BUGS]

  for (let k = 1; k <= ACTIVE; k++) {
    const sk = sprintKey(k)
    const planT = at(k, 0.05)
    const end = endOf(k)

    // Grooming the Friday before: epics that start next sprint get their items written.
    for (const e of EPICS) {
      if (groomed.has(e.key)) continue
      if (e.from === k + 1 || (k === ACTIVE && e.from > ACTIVE + 1)) {
        const t = k === ACTIVE ? at(k, between(0.5, Math.max(0.6, end - 0.5))) : at(k, between(6, 9))
        groomEpic(e, t)
        groomed.add(e.key)
      }
    }

    // Planning: rolled-over work is already in the sprint; fill up from the backlog.
    const cap = teamCapacity * 7.2 * (0.92 + 0.02 * k) * between(0.93, 1.07)
    const inSprint = (): Sim[] => [...sims.values()].filter((s) => s.f.sprint === sk)
    let committed = inSprint().reduce((sum, s) => sum + (s.f.points ?? 0), 0)
    const candidates = [...sims.values()]
      .filter((s) => s.f.sprint === null && s.f.status === 'Backlog' && s.issue.kind !== 'epic' && s.created < planT)
      .filter((s) => s.epicSpec === undefined || s.epicSpec.from <= k)
      .sort((a, b) => (a.epicSpec?.from ?? 0) - (b.epicSpec?.from ?? 0) || a.created - b.created)
    const load = new Map(devs.map((d) => [d.key, 0]))
    for (const s of inSprint()) if (s.f.assignee !== null) load.set(s.f.assignee, (load.get(s.f.assignee) ?? 0) + s.work / (capacity.get(s.f.assignee) ?? 1))
    const leastLoaded = (): string => [...load.entries()].sort((a, b) => a[1] - b[1])[0][0]
    for (const c of candidates) {
      if (committed >= cap) break
      if (c.f.points === null) {
        // Pointed in refinement before planning.
        update(planT - 3 * DAY + Math.round(between(1, 6) * HOUR), pick(devs).key, c, { points: pointsFor(c.issue.kind) })
        c.work = workFor(c.f.points, c.issue.kind)
      }
      const who = leastLoaded()
      load.set(who, (load.get(who) ?? 0) + c.work / (capacity.get(who) ?? 1))
      update(planT + Math.round(between(1, 40) * 60 * 1000), PM, c, { sprint: sk, status: 'Todo', assignee: who })
      committed += c.f.points ?? 0
    }
    for (const s of inSprint()) {
      if (s.f.assignee === null) {
        const who = leastLoaded()
        load.set(who, (load.get(who) ?? 0) + s.work / (capacity.get(who) ?? 1))
        update(planT + HOUR, PM, s, { assignee: who })
      }
    }

    const state = sprintState.get(sk) as Sprint
    const started = startSprint(state, [...sprintState.values()], planIssues(k), {
      startDate: sprints[k - 1].startDate,
      targetDate: sprints[k - 1].targetDate
    })
    if (!started.ok) throw new Error(`start ${sk}: ${started.error}`)
    events.push({ t: planT + HOUR + 5 * 60 * 1000, by: PM, op: 'sprint.update', sprint: sk, patch: started.value })
    Object.assign(state, started.value)

    // Queue per developer: carried-over work first, then by rank.
    const queues = new Map<string, QueueItem[]>(devs.map((d) => [d.key, []]))
    let rank = 0
    for (const s of inSprint().sort((a, b) => (STATUS_KIND[b.f.status] === 'active' ? 1 : 0) - (STATUS_KIND[a.f.status] === 'active' ? 1 : 0) || a.created - b.created)) {
      if (s.f.assignee !== null) queues.get(s.f.assignee)?.push({ sim: s, from: 0, rank: rank++ })
    }

    // Disruptions: one item descoped, one canceled, one re-estimated, bugs found mid-sprint.
    const todo = (): Sim[] => inSprint().filter((s) => s.f.status === 'Todo')
    const drop = (sim: Sim): void => {
      for (const q of queues.values()) {
        const i = q.findIndex((it) => it.sim === sim)
        if (i >= 0) q.splice(i, 1)
      }
    }
    if (k % 2 === 0 && todo().length > 3) {
      const victim = todo().sort((a, b) => b.created - a.created)[0]
      const t = at(k, Math.min(end, between(2, 4)))
      drop(victim)
      update(t, PM, victim, { sprint: null, status: 'Backlog', assignee: null })
      comment(t + 60 * 1000, PM, victim, 'Descoped: not needed for this sprint’s goal.')
    }
    if ((k === 3 || k === 5) && todo().length > 3) {
      const victim = todo()[Math.floor(rnd() * todo().length)]
      const t = at(k, Math.min(end, between(3, 5)))
      drop(victim)
      update(t, PM, victim, { status: 'Canceled' })
      comment(t + 60 * 1000, PM, victim, 'Canceling — covered by the new flow.')
    }
    if (k === 2 || k === 5 || k === ACTIVE) {
      const s = todo().find((it) => (it.f.points ?? 0) >= 2 && (it.f.points ?? 0) < 13)
      if (s !== undefined && s.f.assignee !== null) {
        const bumped = FIB[FIB.indexOf(s.f.points ?? 1) + 1]
        const t = at(k, Math.min(end, 1.2))
        comment(t - 30 * 60 * 1000, s.f.assignee, s, pick(COMMENTS.question))
        update(t, s.f.assignee, s, { points: bumped })
        s.work = workFor(bumped, s.issue.kind)
      }
    }
    const scopeBugs = k === ACTIVE ? 2 : 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < scopeBugs; i++) {
      const w = between(1.5, Math.max(1.6, Math.min(7.5, end - 0.2)))
      if (w > end) continue
      const epic = EPICS.find((e) => e.from <= k && k <= e.to && (bugPool.get(e.key)?.length ?? 0) > 0)
      const title = epic !== undefined ? bugPool.get(epic.key)?.shift() : looseBugs.shift()
      if (title === undefined) continue
      const who = leastLoaded()
      const sim = createIssue(
        at(k, w),
        QA,
        { kind: 'bug', title, epic: epic !== undefined ? epicSim.get(epic.key)?.issue.key ?? null : null, priority: priorityFor('bug') },
        { status: 'Todo', points: pick([1, 1, 2, 3]), assignee: who, sprint: sk },
        epic
      )
      load.set(who, (load.get(who) ?? 0) + sim.work / (capacity.get(who) ?? 1))
      queues.get(who)?.push({ sim, from: w, rank: -1 }) // bugs jump the queue
    }
    if (k === ACTIVE) createSprint(at(k, Math.min(end, 1.5)), LAST)

    // Work: each developer takes the best available item, works it, hands it to review.
    for (const [dev, queue] of queues) {
      const speed = capacity.get(dev) ?? 1
      let cursor = 0
      while (queue.length > 0 && cursor < end) {
        const ready = queue.filter((it) => it.from <= cursor)
        if (ready.length === 0) {
          cursor = Math.min(...queue.map((it) => it.from))
          continue
        }
        const item = ready.sort((a, b) => a.rank - b.rank)[0]
        queue.splice(queue.indexOf(item), 1)
        const sim = item.sim
        const reviewer = pick(devs.filter((d) => d.key !== dev && !d.real)).key
        const at2 = (w: number): number => at(k, w)

        if (sim.f.status === 'In Review') {
          finishReview(sim, cursor, reviewer)
          continue
        }
        let w = cursor
        if (sim.f.status === 'Todo') {
          w += between(0.02, 0.2)
          if (w >= end) break
          update(at2(w), dev, sim, { status: 'In Progress' })
          if (chance(0.25)) comment(at2(w) + 5 * 60 * 1000, dev, sim, pick(COMMENTS.start))
          if (chance(0.15)) {
            comment(at2(w + 0.3), dev, sim, pick(COMMENTS.question))
            comment(at2(w + 0.45), PM, sim, pick(COMMENTS.answer))
          }
        }
        const done = w + sim.work / speed
        if (done >= end) {
          sim.work -= (end - w) * speed
          cursor = end
          break
        }
        sim.work = 0
        update(at2(done), dev, sim, { status: 'In Review' })
        if (chance(0.4)) comment(at2(done) + 2 * 60 * 1000, dev, sim, pick(COMMENTS.review))
        sim.review = between(0.15, 1.1)
        finishReview(sim, done, reviewer)
        cursor = done
      }
    }
    function finishReview (sim: Sim, from: number, reviewer: string): void {
      const dev = sim.f.assignee ?? reviewer
      let w = from + sim.review
      if (w >= end) {
        sim.review = w - end
        return
      }
      if (chance(0.1)) {
        // QA sends it back once; the fix is quick.
        update(at(k, w), QA, sim, { status: 'In Progress' })
        comment(at(k, w) + 60 * 1000, QA, sim, pick(COMMENTS.reopen))
        w += between(0.2, 0.8) / (capacity.get(dev) ?? 1)
        if (w >= end) return
        update(at(k, w), dev, sim, { status: 'In Review' })
        w += between(0.1, 0.5)
        if (w >= end) {
          sim.review = w - end
          return
        }
      }
      sim.review = 0
      const closer = sim.issue.kind === 'bug' || chance(0.5) ? QA : reviewer
      update(at(k, w), closer, sim, { status: 'Done' })
      if (closer === QA && chance(0.35)) comment(at(k, w) + 60 * 1000, QA, sim, pick(COMMENTS.verified))
    }

    if (k === ACTIVE) {
      // Next sprint is being filled in during this one.
      const t = at(k, Math.max(0.2, end - 0.3))
      let planned = 0
      const future = [...sims.values()]
        .filter((s) => s.f.sprint === null && s.f.status === 'Backlog' && s.issue.kind !== 'epic' && s.f.points !== null && s.created < t)
        .filter((s) => s.epicSpec === undefined || s.epicSpec.from <= ACTIVE + 1)
        .sort((a, b) => (a.epicSpec?.from ?? 0) - (b.epicSpec?.from ?? 0) || a.created - b.created)
      for (const s of future) {
        if (planned >= cap * 0.6) break
        update(t + Math.round(between(1, 20) * 60 * 1000), PM, s, { sprint: sprintKey(ACTIVE + 1) })
        planned += s.f.points ?? 0
      }
      break
    }

    // Complete: open work rolls to the next sprint; the one after that gets created.
    const tC = completionTime(k)
    const completed = completeSprint(state, [...sprintState.values()], planIssues(k), {
      target: { kind: 'next' },
      now: tC,
      settings: { lengthDays: SPRINT_DAYS, autoCreate: false },
      projectName: sprintPrefix
    })
    if (!completed.ok) throw new Error(`complete ${sk}: ${completed.error}`)
    events.push({ t: tC, by: PM, op: 'sprint.update', sprint: sk, patch: completed.value.sprint })
    Object.assign(state, completed.value.sprint)
    for (const move of completed.value.moves) {
      const sim = sims.get(move.issue) as Sim
      update(tC + 60 * 1000, PM, sim, { sprint: move.to })
      if (chance(0.3)) comment(tC + 2 * 60 * 1000, PM, sim, pick(COMMENTS.rollover))
    }
    if (k + 2 <= LAST) createSprint(tC + 5 * 60 * 1000, k + 2)

    // QA files a couple of bugs straight into the backlog.
    for (let i = 0; i < 2 && looseBugs.length > 4; i++) {
      createIssue(
        at(k, between(1, 9)),
        QA,
        { kind: 'bug', title: looseBugs.pop() as string, epic: null, priority: priorityFor('bug') },
        { status: 'Backlog', points: chance(0.5) ? pick([1, 2, 3]) : null, assignee: null, sprint: null }
      )
    }
  }

  // Epics follow their children: In Progress when work starts, Done when the last child closes.
  const sorted = sortEvents(events)
  const childStatus = new Map<string, Map<string, StatusName>>()
  const epicStatus = new Map<string, StatusName>()
  const epicEvents: SeedEvent[] = []
  for (const ev of sorted) {
    if (ev.op !== 'issue.create' && ev.op !== 'issue.update') continue
    const sim = sims.get(ev.issue) as Sim
    const epicKey = sim.issue.kind === 'epic' ? null : sim.issue.epic
    if (epicKey === null) continue
    const status = ev.op === 'issue.create' ? ev.fields.status : ev.set.status
    if (status === undefined) continue
    const children = childStatus.get(epicKey) ?? new Map<string, StatusName>()
    childStatus.set(epicKey, children)
    children.set(ev.issue, status)
    const epic = sims.get(epicKey) as Sim
    const current = epicStatus.get(epicKey) ?? 'Backlog'
    const all = [...children.values()]
    let next: StatusName = current
    if (current !== 'Done' && all.some((s) => s !== 'Backlog' && s !== 'Todo')) next = 'In Progress'
    if (
      (epic.epicSpec?.to ?? LAST) < ACTIVE &&
      all.every((s) => s === 'Done' || s === 'Canceled') &&
      all.length === (epic.epicSpec?.stories.length ?? 0) + (epic.epicSpec?.tasks.length ?? 0) + countBugs(epicKey)
    ) {
      next = 'Done'
    }
    if (next !== current) {
      epicStatus.set(epicKey, next)
      const t = ev.t + 20 * 60 * 1000
      if (t <= now) {
        epicEvents.push({ t, by: PM, op: 'issue.update', issue: epic.issue.key, set: { status: next } })
        epic.f.status = next
      }
    }
  }
  function countBugs (epicKey: string): number {
    return [...sims.values()].filter((s) => s.issue.kind === 'bug' && s.issue.epic === epicKey).length
  }

  // Whole milliseconds: timestamps are integer columns in the database.
  const all = sortEvents([...events, ...epicEvents])
    .map((ev) => ({ ...ev, t: Math.round(ev.t) }))
    .filter((ev) => ev.t <= now)
  // Numbers follow creation time, as the project sequence would have handed them out.
  let n = 0
  const created = new Set<string>()
  for (const ev of all) {
    if (ev.op === 'issue.create') {
      const sim = sims.get(ev.issue) as Sim
      sim.issue.number = ++n
      created.add(ev.issue)
    }
  }
  const liveIssues = issues.filter((it) => created.has(it.key)).sort((a, b) => a.number - b.number)
  const liveSprints = sprints.filter((s) => all.some((ev) => ev.op === 'sprint.create' && ev.sprint === s.key))
  return { projectName, projectCreated, people, sprints: liveSprints, issues: liveIssues, events: all }
}

const OP_ORDER: Record<SeedEvent['op'], number> = {
  'sprint.create': 0,
  'issue.create': 1,
  'issue.update': 2,
  'sprint.update': 3,
  comment: 4
}

/** Time order; at the same instant creations go before the updates that refer to them. */
function sortEvents (events: SeedEvent[]): SeedEvent[] {
  return events
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => a.ev.t - b.ev.t || OP_ORDER[a.ev.op] - OP_ORDER[b.ev.op] || a.i - b.i)
    .map((x) => x.ev)
}
