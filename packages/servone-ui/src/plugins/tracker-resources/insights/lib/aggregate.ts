import { byShare } from '../../sprints/lib/breakdown'
import { percentile } from '../../sprints/lib/flow'
import { DAY, type StatusKind } from '../../sprints/lib/types'
import { isTimeMeasure, type Dimension, type InsightIssue, type InsightsQuery, type Measure } from './types'

/** Bucket key for folded buckets; no Huly id starts with NUL. */
export const OTHER_KEY = '\u0000other'
const MAX_BARS = 12
const MAX_SEGMENTS = 5
const P85 = 85

function counted (issues: InsightIssue[]): InsightIssue[] {
  return issues.filter((issue) => !issue.isEpic && issue.statusKind !== 'canceled')
}

/** What the panel counts: open work as it is now, plus work done in the range (a reopened issue is open). */
export function panelIssues (open: InsightIssue[], completed: InsightIssue[]): InsightIssue[] {
  return [
    ...counted(open).filter((issue) => issue.statusKind !== 'done'),
    ...counted(completed).filter((issue) => issue.statusKind === 'done')
  ]
}

export function median (values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export interface BucketStats {
  issues: number
  points: number
  unestimated: number
  /** Done without ever being started; left out of cycle time. */
  neverStarted: number
  cycleMs: number[]
  leadMs: number[]
}

export function bucketStats (issues: InsightIssue[]): BucketStats {
  const stats: BucketStats = { issues: 0, points: 0, unestimated: 0, neverStarted: 0, cycleMs: [], leadMs: [] }
  for (const issue of issues) {
    stats.issues++
    stats.points += issue.points ?? 0
    if (issue.points === null) stats.unestimated++
    if (issue.completedOn === null) continue
    stats.leadMs.push(issue.completedOn - issue.createdOn)
    if (issue.startedOn !== null && issue.startedOn <= issue.completedOn) stats.cycleMs.push(issue.completedOn - issue.startedOn)
    else stats.neverStarted++
  }
  return stats
}

function durations (stats: BucketStats, measure: Measure): number[] {
  return (measure === 'cycleTime' ? stats.cycleMs : stats.leadMs).map((ms) => ms / DAY)
}

function measureOf (issues: InsightIssue[], measure: Measure): number {
  const stats = bucketStats(issues)
  if (measure === 'count') return stats.issues
  if (measure === 'points') return stats.points
  return median(durations(stats, measure)) ?? 0
}

/** Bucket keys of an issue; '' is the none bucket. Labels are multi-valued. */
export function keysOf (issue: InsightIssue, dimension: Dimension): string[] {
  switch (dimension) {
    case 'assignee':
      return [issue.assignee ?? '']
    case 'status':
      return [issue.statusName]
    case 'label':
      return issue.labels.length > 0 ? issue.labels : ['']
    case 'epic':
      return [issue.epic ?? '']
    case 'sprint':
      return [issue.sprint ?? '']
  }
}

function groupBy (issues: InsightIssue[], dimension: Dimension): Map<string, InsightIssue[]> {
  const groups = new Map<string, InsightIssue[]>()
  for (const issue of issues) {
    for (const key of keysOf(issue, dimension)) {
      const group = groups.get(key) ?? []
      group.push(issue)
      groups.set(key, group)
    }
  }
  return groups
}

interface Bucket {
  key: string
  issues: InsightIssue[]
  total: number
  count: number
}

function rankedBuckets (issues: InsightIssue[], dimension: Dimension, measure: Measure): Bucket[] {
  return [...groupBy(issues, dimension)]
    .map(([key, members]) => ({ key, issues: members, total: measureOf(members, measure), count: members.length }))
    .sort(byShare)
}

function distinct (issues: InsightIssue[]): InsightIssue[] {
  return [...new Map(issues.map((issue) => [issue._id, issue])).values()]
}

export interface Segment {
  key: string
  amount: number
}

export interface Bar {
  key: string
  /** Count, points, or the median in days for a time measure. */
  amount: number
  /** Time measures only, in days. */
  p85: number | undefined
  segments: Segment[]
}

export function insightBars (completed: InsightIssue[], query: Pick<InsightsQuery, 'measure' | 'slice' | 'segment'>): Bar[] {
  const { measure } = query
  const issues = counted(completed).filter((issue) => issue.statusKind === 'done')
  const ranked = rankedBuckets(issues, query.slice, measure)
  const named = ranked.filter((bucket) => bucket.key !== '')
  const kept: Array<Pick<Bucket, 'key' | 'issues'>> = named.slice(0, MAX_BARS)
  if (named.length > MAX_BARS) kept.push({ key: OTHER_KEY, issues: distinct(named.slice(MAX_BARS).flatMap((bucket) => bucket.issues)) })
  kept.push(...ranked.filter((bucket) => bucket.key === ''))

  const segment = isTimeMeasure(measure) ? null : query.segment
  const shown = segment === null ? [] : rankedBuckets(issues, segment, measure).slice(0, MAX_SEGMENTS).map((bucket) => bucket.key)
  return kept.map(({ key, issues: members }) => ({
    key,
    amount: measureOf(members, measure),
    p85: isTimeMeasure(measure) ? percentile(durations(bucketStats(members), measure), P85) : undefined,
    segments: segment === null ? [] : segmentsOf(members, segment, shown, measure)
  }))
}

function segmentsOf (issues: InsightIssue[], segment: Dimension, shown: string[], measure: Measure): Segment[] {
  const groups = groupBy(issues, segment)
  const segments: Segment[] = []
  for (const key of shown) {
    const members = groups.get(key)
    if (members !== undefined) segments.push({ key, amount: measureOf(members, measure) })
  }
  const rest = distinct([...groups].filter(([key]) => !shown.includes(key)).flatMap(([, members]) => members))
  if (rest.length > 0) segments.push({ key: OTHER_KEY, amount: measureOf(rest, measure) })
  return segments
}

export interface SummaryRow {
  slice: string
  segment: string | null
  stats: BucketStats
}

/** Every bucket, none folded: the CSV is for auditing. */
export function summaryRows (completed: InsightIssue[], slice: Dimension, segment: Dimension | null): SummaryRow[] {
  const issues = counted(completed).filter((issue) => issue.statusKind === 'done')
  const rows: SummaryRow[] = []
  for (const bucket of rankedBuckets(issues, slice, 'count')) {
    if (segment === null) {
      rows.push({ slice: bucket.key, segment: null, stats: bucketStats(bucket.issues) })
      continue
    }
    for (const part of rankedBuckets(bucket.issues, segment, 'count')) {
      rows.push({ slice: bucket.key, segment: part.key, stats: bucketStats(part.issues) })
    }
  }
  return rows
}

export function totalStats (completed: InsightIssue[]): BucketStats {
  return bucketStats(counted(completed).filter((issue) => issue.statusKind === 'done'))
}

export interface Cell {
  count: number
  points: number
}

export interface StatusColumn {
  name: string
  kind: StatusKind
}

export interface TableRow {
  assignee: string
  cells: Cell[]
  total: Cell
}

export interface StatusTable {
  columns: StatusColumn[]
  rows: TableRow[]
  totals: Cell[]
  total: Cell
}

const KIND_ORDER: StatusKind[] = ['unstarted', 'todo', 'active', 'done']

function add (cell: Cell, issue: InsightIssue): void {
  cell.count++
  cell.points += issue.points ?? 0
}

const emptyCell = (): Cell => ({ count: 0, points: 0 })

export function statusTable (open: InsightIssue[], completed: InsightIssue[]): StatusTable {
  const issues = panelIssues(open, completed)
  const columns: StatusColumn[] = []
  for (const issue of issues) {
    if (!columns.some((column) => column.name === issue.statusName)) columns.push({ name: issue.statusName, kind: issue.statusKind })
  }
  columns.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
  const index = new Map(columns.map((column, position) => [column.name, position]))

  const rows = new Map<string, TableRow>()
  const totals = columns.map(emptyCell)
  const total = emptyCell()
  for (const issue of issues) {
    const assignee = issue.assignee ?? ''
    const row = rows.get(assignee) ?? { assignee, cells: columns.map(emptyCell), total: emptyCell() }
    const position = index.get(issue.statusName) ?? 0
    add(row.cells[position], issue)
    add(row.total, issue)
    add(totals[position], issue)
    add(total, issue)
    rows.set(assignee, row)
  }
  const ranked = [...rows.values()].sort((a, b) =>
    byShare({ key: a.assignee, total: a.total.points, count: a.total.count }, { key: b.assignee, total: b.total.points, count: b.total.count })
  )
  return { columns, rows: ranked, totals, total }
}
