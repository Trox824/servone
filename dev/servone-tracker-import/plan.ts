//
// Parses docs/SERVONE-PRODUCT-PLAN.md into a tracker import model.
// Pure (no fs, no network) and run under Node's type stripping: no enums, namespaces or parameter properties.
//

export type TaskKind = 'build' | 'ops'
export type IssueType = 'Epic' | 'Task'

/** Module key: 'M0'..'M10', or LEAD_KEY for the "Lead times" epic. */
export const LEAD_KEY = 'LEAD'

export interface PlanRow {
  day: number
  /** The date cell as written in the plan, e.g. "Thu 1 Oct". */
  dateLabel: string
  build: string
  /** Undefined when the cell is empty or a dash. */
  ops?: string
  /** The `###` heading the row's table sits under. */
  section: string
}

export interface Sprint {
  label: string
  firstDay: number
  lastDay: number
  /** ISO YYYY-MM-DD */
  startDate: string
  /** ISO YYYY-MM-DD */
  targetDate: string
  description: string
}

export interface PlanTask {
  number: number
  kind: TaskKind
  type: IssueType
  module: string
  day: number
  /** ISO YYYY-MM-DD */
  date: string
  title: string
  description: string
  estimationHours: number
  storyPoints: number
  milestone?: string
}

export interface PlanEpic {
  number: number
  type: IssueType
  module: string
  title: string
  description: string
  /** ISO dates of the first and last child, undefined when there are no children. */
  startDate?: string
  dueDate?: string
  tasks: PlanTask[]
}

export interface ImportPlan {
  project: {
    identifier: string
    title: string
    description: string
    defaultIssueStatus: string
  }
  sprints: Sprint[]
  epics: PlanEpic[]
}

export interface PlanOptions {
  /** ISO date of day 1. */
  day1: string
  identifier: string
  projectTitle: string
  /** Build rows with no `**Mx**` tag go to this module. */
  untaggedModule: string
  buildHours: number
  buildPoints: number
  opsHours: number
  opsPoints: number
  titleMax: number
  sourcePath: string
}

export const DEFAULT_OPTIONS: PlanOptions = {
  day1: '2026-10-01',
  identifier: 'SRV',
  projectTitle: 'Servone MVP launch',
  untaggedModule: 'M10',
  buildHours: 8,
  buildPoints: 5,
  opsHours: 1,
  opsPoints: 1,
  titleMax: 120,
  sourcePath: 'docs/SERVONE-PRODUCT-PLAN.md'
}

const DAY_MS = 86_400_000

export function dayToIsoDate (day: number, day1: string): string {
  const [y, m, d] = day1.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + (day - 1) * DAY_MS
  return new Date(t).toISOString().slice(0, 10)
}

/** Text from a `## heading` (exclusive) to the next `## ` heading. */
export function sliceSection (md: string, headingPrefix: string): string {
  const lines = md.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  if (start < 0) return ''
  const level = (headingPrefix.match(/^#+/) ?? ['##'])[0]
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/)
    if (m !== null && m[1].length <= level.length) break
    out.push(lines[i])
  }
  return out.join('\n')
}

export function splitTableRow (line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim())
}

function isEmptyCell (cell: string | undefined): boolean {
  if (cell === undefined) return true
  const c = cell.trim()
  return c === '' || /^[—–-]+$/.test(c)
}

/** Rows of every day table under "## Day-by-day schedule". */
export function parseDayRows (md: string): PlanRow[] {
  const body = sliceSection(md, '## Day-by-day schedule')
  const rows: PlanRow[] = []
  let section = ''
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^###\s+(.+)$/)
    if (h !== null) {
      section = h[1].trim()
      continue
    }
    if (!/^\|\s*\d+\s*\|/.test(line)) continue
    const cells = splitTableRow(line)
    const ops = isEmptyCell(cells[3]) ? undefined : cells[3]
    rows.push({ day: Number(cells[0]), dateLabel: cells[1] ?? '', build: cells[2] ?? '', ops, section })
  }
  return rows
}

/**
 * Sprints from the week headings of the day-by-day schedule, e.g.
 * "Week 1: foundations and Lịch (days 1–7, ...)" -> Sprint 1, days 1-7;
 * "Launch prep (days 29–32, ...)" -> Launch prep, days 29-32.
 */
export function parseSprints (md: string, day1: string): Sprint[] {
  const body = sliceSection(md, '## Day-by-day schedule')
  const sprints: Sprint[] = []
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^###\s+(.+)$/)
    if (h === null) continue
    const heading = h[1].trim()
    const range = heading.match(/\(days\s+(\d+)\s*[–-]\s*(\d+)/)
    if (range === null) continue
    const week = heading.match(/^Week\s+(\d+)/i)
    const label = week !== null ? `Sprint ${week[1]}` : heading.slice(0, heading.indexOf('(')).trim()
    const firstDay = Number(range[1])
    const lastDay = Number(range[2])
    sprints.push({
      label,
      firstDay,
      lastDay,
      startDate: dayToIsoDate(firstDay, day1),
      targetDate: dayToIsoDate(lastDay, day1),
      description: `${heading}. Days ${firstDay}–${lastDay} of the plan.`
    })
  }
  return sprints
}

export function sprintForDay (sprints: Sprint[], day: number): Sprint | undefined {
  return sprints.find((s) => day >= s.firstDay && day <= s.lastDay)
}

/** Epic names from the "Epics" row of the P0.3 table, keyed by module. */
export function parseEpicNames (md: string): Map<string, string> {
  const names = new Map<string, string>()
  const line = md.split(/\r?\n/).find((l) => /^\|\s*Epics\s*\|/.test(l))
  if (line === undefined) return names
  let cell = splitTableRow(line)[1] ?? ''
  const colon = cell.indexOf(':')
  if (colon >= 0) cell = cell.slice(colon + 1)
  for (const raw of cell.split(/,\s*|\s+plus\s+/)) {
    const item = raw.trim().replace(/^plus\s+/i, '').replace(/^["“”']+|["“”']+$/g, '').trim()
    if (item === '') continue
    const m = item.match(/^(M\d+)\b/)
    if (m !== null) names.set(m[1], item)
    else if (/lead times/i.test(item)) names.set(LEAD_KEY, item)
  }
  return names
}

export interface ModuleSection {
  module: string
  heading: string
  intro: string
}

/** `### Mx. Heading` sections under "## MVP modules in detail". */
export function parseModuleSections (md: string): Map<string, ModuleSection> {
  const out = new Map<string, ModuleSection>()
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^###\s+(M\d+)\.\s+(.+)$/)
    if (h === null) continue
    const para: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (/^#/.test(l)) break
      if (l.trim() === '') {
        if (para.length > 0) break
        continue
      }
      para.push(l.trim())
    }
    out.set(h[1], { module: h[1], heading: `${h[1]}. ${h[2].trim()}`, intro: para.join(' ') })
  }
  return out
}

/** Strips markdown emphasis and code ticks, collapses whitespace. */
export function plainText (md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function makeTitle (md: string, max: number): string {
  let t = plainText(md).replace(/[.;,:\s]+$/, '')
  if (t.length > 0) t = t[0].toUpperCase() + t.slice(1)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[.;,:\s]+$/, '') + '…'
}

export interface BuildSegment {
  module: string
  text: string
}

/**
 * Splits a build cell into one segment per `**Mx**` tag. Text before the
 * first tag joins the first segment; a cell without tags is one segment
 * for `untaggedModule`.
 */
export function splitBuildCell (build: string, untaggedModule: string): BuildSegment[] {
  const re = /\*\*(M\d+)\*\*/g
  const tags: Array<{ module: string, start: number, end: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(build)) !== null) tags.push({ module: m[1], start: m.index, end: m.index + m[0].length })
  if (tags.length === 0) return [{ module: untaggedModule, text: build.trim() }]
  const lead = build.slice(0, tags[0].start).trim()
  return tags.map((t, i) => {
    const end = i + 1 < tags.length ? tags[i + 1].start : build.length
    let text = build.slice(t.end, end).trim()
    if (i === 0 && lead !== '') text = `${lead} ${text}`
    return { module: t.module, text }
  })
}

/** Splits `total` into `n` integer shares, remainder to the first shares. */
export function splitPoints (total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const rest = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0))
}

/** Splits `total` hours into `n` shares rounded to half hours, summing to total. */
export function splitHours (total: number, n: number): number[] {
  const share = Math.floor((total / n) * 2) / 2
  const out = Array.from({ length: n }, () => share)
  out[0] += total - share * n
  return out
}

function longDate (iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function taskDescription (
  row: PlanRow,
  date: string,
  column: string,
  text: string,
  sprint: Sprint | undefined,
  opts: PlanOptions,
  fullRow?: string
): string {
  const parts = [
    `**Day ${row.day}** · ${longDate(date)} (${date})${sprint !== undefined ? ` · ${sprint.label}` : ''}`,
    '',
    text.trim()
  ]
  if (fullRow !== undefined) parts.push('', `Full build cell for the day: ${fullRow.trim()}`)
  parts.push('', `Source: \`${opts.sourcePath}\`, day-by-day schedule, day ${row.day}, ${column} column (${row.section}).`)
  return parts.join('\n') + '\n'
}

type DraftTask = Omit<PlanTask, 'number'>

export function buildImportPlan (md: string, options: Partial<PlanOptions> = {}): ImportPlan {
  const opts: PlanOptions = { ...DEFAULT_OPTIONS, ...options }
  const rows = parseDayRows(md)
  const sprints = parseSprints(md, opts.day1)
  const epicNames = parseEpicNames(md)
  const sections = parseModuleSections(md)

  const drafts: DraftTask[] = []
  for (const row of rows) {
    const date = dayToIsoDate(row.day, opts.day1)
    const sprint = sprintForDay(sprints, row.day)
    const segments = splitBuildCell(row.build, opts.untaggedModule)
    const hours = splitHours(opts.buildHours, segments.length)
    const points = splitPoints(opts.buildPoints, segments.length)
    segments.forEach((seg, i) => {
      drafts.push({
        kind: 'build',
        type: 'Task',
        module: seg.module,
        day: row.day,
        date,
        title: makeTitle(seg.text, opts.titleMax),
        description: taskDescription(row, date, 'build', seg.text, sprint, opts, segments.length > 1 ? row.build : undefined),
        estimationHours: hours[i],
        storyPoints: points[i],
        milestone: sprint?.label
      })
    })
    if (row.ops !== undefined) {
      drafts.push({
        kind: 'ops',
        type: 'Task',
        module: LEAD_KEY,
        day: row.day,
        date,
        title: makeTitle(row.ops, opts.titleMax),
        description: taskDescription(row, date, 'ops', row.ops, sprint, opts),
        estimationHours: opts.opsHours,
        storyPoints: opts.opsPoints,
        milestone: sprint?.label
      })
    }
  }

  // Same-cell text repeats across days; the suffix keeps issue titles tellable apart.
  const seen = new Map<string, number>()
  for (const d of drafts) seen.set(d.title, (seen.get(d.title) ?? 0) + 1)
  for (const d of drafts) {
    if ((seen.get(d.title) ?? 0) > 1) d.title = `${d.title} (day ${d.day}${d.kind === 'ops' ? ', ops' : ''})`
  }

  // Epics take the highest numbers: the importer sets the issue sequence from top-level numbers only,
  // so otherwise the next issue created in the app would reuse a task's number.
  const tasks: PlanTask[] = drafts.map((d, i) => ({ ...d, number: i + 1 }))

  const moduleKeys: string[] = []
  const addKey = (k: string): void => {
    if (!moduleKeys.includes(k)) moduleKeys.push(k)
  }
  for (const k of epicNames.keys()) addKey(k)
  for (const t of tasks) addKey(t.module)
  moduleKeys.sort(compareModules)

  let next = tasks.length + 1
  const epics: PlanEpic[] = moduleKeys.map((key) => {
    const children = tasks.filter((t) => t.module === key)
    const section = sections.get(key)
    const title = epicNames.get(key) ?? (key === LEAD_KEY ? 'Lead times' : (section?.heading.replace(/\.\s+/, ' ') ?? key))
    const dates = children.map((c) => c.date).sort()
    return {
      number: next++,
      type: 'Epic',
      module: key,
      title,
      description: epicDescription(key, title, section, children, opts),
      startDate: dates[0],
      dueDate: dates[dates.length - 1],
      tasks: children
    }
  })

  return {
    project: {
      identifier: opts.identifier,
      title: opts.projectTitle,
      description: `The ${opts.sourcePath} day-by-day plan, generated by dev/servone-tracker-import. The plan stays the source of truth for what gets built; the tracker holds status.`,
      defaultIssueStatus: 'Todo'
    },
    sprints,
    epics
  }
}

function compareModules (a: string, b: string): number {
  const rank = (k: string): number => (k === LEAD_KEY ? 1000 : Number(k.replace(/^M/, '')))
  return rank(a) - rank(b)
}

function epicDescription (
  key: string,
  title: string,
  section: ModuleSection | undefined,
  children: PlanTask[],
  opts: PlanOptions
): string {
  const lines: string[] = []
  if (key === LEAD_KEY) {
    lines.push('Ops, marketing and lead-time items from the "Ops, marketing, lead times" column of the day-by-day schedule, one task per day cell.')
  } else if (section !== undefined) {
    lines.push(`**${section.heading}**`)
    if (section.intro !== '') lines.push('', section.intro)
  } else {
    lines.push(`Module ${key} (${title}).`)
  }
  const days = [...new Set(children.map((c) => c.day))]
  if (days.length > 0) lines.push('', `Days in the schedule: ${days.join(', ')}.`)
  lines.push('', `Source: \`${opts.sourcePath}\`.`)
  return lines.join('\n') + '\n'
}
