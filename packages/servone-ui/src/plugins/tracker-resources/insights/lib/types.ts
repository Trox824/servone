import type { StatusKind } from '../../sprints/lib/types'

export const MEASURES = ['count', 'points', 'cycleTime', 'leadTime'] as const
export type Measure = (typeof MEASURES)[number]

export const DIMENSIONS = ['assignee', 'status', 'label', 'epic', 'sprint'] as const
export type Dimension = (typeof DIMENSIONS)[number]

export const RANGE_PRESETS = ['thisWeek', 'last2Weeks', 'thisMonth', 'last30Days'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

/** Custom ranges are `[from, to)`: `to` is the start of the day after the last one. */
export type DateRange = { preset: RangePreset } | { preset: 'custom', from: number, to: number }

export interface InsightsQuery {
  measure: Measure
  slice: Dimension
  /** Always null for time measures: medians don't stack. */
  segment: Dimension | null
  range: DateRange
}

export const DEFAULT_QUERY: InsightsQuery = {
  measure: 'count',
  slice: 'assignee',
  segment: null,
  range: { preset: 'last30Days' }
}

export function isTimeMeasure (measure: Measure): boolean {
  return measure === 'cycleTime' || measure === 'leadTime'
}

export interface InsightIssue {
  _id: string
  identifier: string
  title: string
  /** Project (space) id. */
  project: string
  /** Status ref; the table and the status dimension group by `statusName`. */
  status: string
  statusName: string
  statusKind: StatusKind
  isEpic: boolean
  assignee: string | null
  points: number | null
  labels: string[]
  /** Nearest ancestor of the Epic type. */
  epic: string | null
  sprint: string | null
  createdOn: number
  startedOn: number | null
  completedOn: number | null
}

interface StoredQuery {
  measure?: string
  slice?: string
  segment?: string | null
  range?: { preset?: string, from?: number | string, to?: number | string }
}

function member<T extends string> (list: readonly T[], candidate: string | null | undefined): T | undefined {
  return list.find((entry) => entry === candidate)
}

function parseRange (stored: StoredQuery['range']): DateRange | undefined {
  if (stored === undefined) return undefined
  const preset = member(RANGE_PRESETS, stored.preset)
  if (preset !== undefined) return { preset }
  if (stored.preset !== 'custom') return undefined
  const { from, to } = stored
  if (typeof from !== 'number' || typeof to !== 'number' || from >= to) return undefined
  return { preset: 'custom', from, to }
}

/** A query saved with `JSON.stringify`, or undefined when it no longer fits. */
export function parseInsightsQuery (raw: string | null): InsightsQuery | undefined {
  if (raw === null) return undefined
  let stored: StoredQuery | string | number | boolean | null
  try {
    stored = JSON.parse(raw)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
  if (stored === null || typeof stored !== 'object') return undefined
  const measure = member(MEASURES, stored.measure)
  const slice = member(DIMENSIONS, stored.slice)
  const range = parseRange(stored.range)
  if (measure === undefined || slice === undefined || range === undefined) return undefined
  const segment = member(DIMENSIONS, stored.segment) ?? null
  return { measure, slice, segment: isTimeMeasure(measure) || segment === slice ? null : segment, range }
}
