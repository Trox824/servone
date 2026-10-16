import { median, type BucketStats, type SummaryRow } from './aggregate'
import type { Dimension, InsightIssue, InsightsQuery } from './types'

const HOUR = 60 * 60 * 1000
const BOM = '﻿'
const NEEDS_QUOTES = /[",\r\n]/
const FORMULA_START = /^[=+\-@\t\r]/

/** Display name of a bucket key; '' is the none bucket. */
export type CsvNames = (field: Dimension | 'project', key: string) => string

function cell (text: string): string {
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** For user-written text only; numeric columns stay unprefixed so they still sum. */
function textCell (text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text
}

export function toCsv (rows: string[][]): string {
  return BOM + rows.map((row) => row.map(cell).join(',') + '\r\n').join('')
}

const pad = (n: number): string => String(n).padStart(2, '0')

function day (t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `YYYY-MM-DD HH:mm` in local time: Sheets reads it as a date whatever the locale. */
export function csvDate (t: number | null): string {
  if (t === null) return ''
  const d = new Date(t)
  return `${day(t)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function wholeHours (ms: number | undefined): string {
  return ms === undefined ? '' : String(Math.round(ms / HOUR))
}

export function slug (text: string): string {
  const ascii = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii === '' ? 'view' : ascii
}

export function csvFileName (view: string, bounds: { from: number, to: number }, kind: 'summary' | 'issues'): string {
  return `insights-${slug(view)}-${day(bounds.from)}-${day(bounds.to - 1)}-${kind}.csv`
}

function statsCells (stats: BucketStats): string[] {
  return [
    String(stats.issues),
    String(stats.points),
    String(stats.unestimated),
    wholeHours(median(stats.cycleMs)),
    wholeHours(median(stats.leadMs)),
    String(stats.neverStarted)
  ]
}

/** `total` comes from distinct issues: a multi-label issue sits in several rows but counts once. */
export function summaryCsv (
  rows: SummaryRow[],
  total: BucketStats,
  query: Pick<InsightsQuery, 'slice' | 'segment'>,
  names: CsvNames,
  headers: string[],
  totalLabel: string
): string {
  const { segment } = query
  return toCsv([
    headers.map(textCell),
    ...rows.map((row) => [
      textCell(names(query.slice, row.slice)),
      segment === null || row.segment === null ? '' : textCell(names(segment, row.segment)),
      ...statsCells(row.stats)
    ]),
    [textCell(totalLabel), '', ...statsCells(total)]
  ])
}

export function issuesCsv (issues: InsightIssue[], names: CsvNames, headers: string[]): string {
  return toCsv([
    headers.map(textCell),
    ...issues.map((issue) => {
      const { startedOn, completedOn } = issue
      const cycleMs = startedOn !== null && completedOn !== null && startedOn <= completedOn ? completedOn - startedOn : undefined
      const leadMs = completedOn !== null ? completedOn - issue.createdOn : undefined
      return [
        textCell(issue.identifier),
        textCell(issue.title),
        textCell(names('project', issue.project)),
        textCell(names('assignee', issue.assignee ?? '')),
        textCell(issue.statusName),
        issue.points === null ? '' : String(issue.points),
        textCell(names('epic', issue.epic ?? '')),
        textCell(names('sprint', issue.sprint ?? '')),
        textCell(issue.labels.map((label) => names('label', label)).join('; ')),
        csvDate(issue.createdOn),
        csvDate(startedOn),
        csvDate(completedOn),
        wholeHours(cycleMs),
        wholeHours(leadMs)
      ]
    })
  ])
}
