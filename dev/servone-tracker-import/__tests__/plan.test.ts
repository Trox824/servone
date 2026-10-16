import { buildImportPlan, LEAD_KEY, parseDayRows, parseEpicNames, splitBuildCell } from '../plan'

const FIXTURE = `# Plan

### P0.3 Import the plan and run the project on it

| Tracker part | Holds |
|---|---|
| Epics | One per module: M0 Review, M3 Lịch, plus "Lead times" |

## Day-by-day schedule

Day 1 is Thu 2026-10-01.

### Week 1: foundations and Lịch (days 1–7, Thu 1 Oct – Wed 7 Oct)

| Day | Date | Build | Ops, marketing, lead times |
|---|---|---|---|
| 1 | Thu 1 Oct | **M0** review: Tracker, Documents, Inbox | Sprint 1 of \`SRV\` starts |
| 5 | Mon 5 Oct | **M3** Lịch shell: one app in the rail | — |

### Week 2: Lịch, Drive, Workflow (days 8–14, Thu 8 Oct – Wed 14 Oct)

| Day | Date | Build | Ops, marketing, lead times |
|---|---|---|---|
| 8 | Thu 8 Oct | **M3** Google Calendar connect + two-way sync | |

## MVP modules in detail

### M0. Review of done modules (days 1–2)

**Goal.** Everything already skinned works.

### M3. Lịch: one schedule module (days 5–9)

One app for time.
`

describe('plan parsing', () => {
  const plan = buildImportPlan(FIXTURE)
  const epic = (key: string) => plan.epics.find((e) => e.module === key)!

  it('reads day rows and treats a dash or empty ops cell as none', () => {
    const rows = parseDayRows(FIXTURE)
    expect(rows.map((r) => r.day)).toEqual([1, 5, 8])
    expect(rows[0].ops).toBe('Sprint 1 of `SRV` starts')
    expect(rows[1].ops).toBeUndefined()
    expect(rows[2].ops).toBeUndefined()
  })

  it('reads epic names from the P0.3 table', () => {
    expect([...parseEpicNames(FIXTURE).entries()]).toEqual([
      ['M0', 'M0 Review'],
      ['M3', 'M3 Lịch'],
      [LEAD_KEY, 'Lead times']
    ])
  })

  it('splits a build cell with two module tags', () => {
    expect(splitBuildCell('**M0** review: Chat. **M2** hide Card', 'M10')).toEqual([
      { module: 'M0', text: 'review: Chat.' },
      { module: 'M2', text: 'hide Card' }
    ])
    expect(splitBuildCell('Buffer. **Go/no-go**', 'M10')).toEqual([{ module: 'M10', text: 'Buffer. **Go/no-go**' }])
  })

  it('builds one epic per module, ops under Lead times', () => {
    expect(plan.epics.map((e) => [e.module, e.title])).toEqual([
      ['M0', 'M0 Review'],
      ['M3', 'M3 Lịch'],
      [LEAD_KEY, 'Lead times']
    ])
    expect(epic('M0').tasks.map((t) => t.title)).toEqual(['Review: Tracker, Documents, Inbox'])
    expect(epic('M3').tasks.map((t) => t.day)).toEqual([5, 8])
    expect(epic(LEAD_KEY).tasks.map((t) => t.title)).toEqual(['Sprint 1 of SRV starts'])
    expect(epic('M3')).toMatchObject({ type: 'Epic', startDate: '2026-10-05', dueDate: '2026-10-08' })
  })

  it('parses sprints and assigns tasks by day', () => {
    expect(plan.sprints.map((s) => [s.label, s.firstDay, s.lastDay, s.startDate, s.targetDate])).toEqual([
      ['Sprint 1', 1, 7, '2026-10-01', '2026-10-07'],
      ['Sprint 2', 8, 14, '2026-10-08', '2026-10-14']
    ])
    expect(epic('M3').tasks.map((t) => t.milestone)).toEqual(['Sprint 1', 'Sprint 2'])
  })

  it('sets date, hours and points per row kind', () => {
    const build = epic('M3').tasks[0]
    expect(build).toMatchObject({ kind: 'build', type: 'Task', date: '2026-10-05', estimationHours: 8, storyPoints: 5 })
    const ops = epic(LEAD_KEY).tasks[0]
    expect(ops).toMatchObject({ kind: 'ops', type: 'Task', date: '2026-10-01', estimationHours: 1, storyPoints: 1 })
  })

  it('numbers tasks in day order and epics after them', () => {
    const tasks = plan.epics.flatMap((e) => e.tasks).sort((a, b) => a.number - b.number)
    expect(tasks.map((t) => [t.number, t.day, t.kind])).toEqual([
      [1, 1, 'build'],
      [2, 1, 'ops'],
      [3, 5, 'build'],
      [4, 8, 'build']
    ])
    expect(plan.epics.map((e) => e.number)).toEqual([5, 6, 7])
  })

  it('truncates long titles and keeps the full text in the description', () => {
    const long = 'word '.repeat(60)
    const md = FIXTURE.replace('**M3** Lịch shell: one app in the rail', `**M3** ${long}`)
    const t = buildImportPlan(md).epics.find((e) => e.module === 'M3')!.tasks[0]
    expect(t.title.length).toBeLessThanOrEqual(120)
    expect(t.title.endsWith('…')).toBe(true)
    expect(t.description).toContain(long.trim())
  })
})
