import { DAY } from '../../../sprints/lib/types'
import { bucketStats } from '../aggregate'
import { csvDate, csvFileName, issuesCsv, slug, summaryCsv, toCsv, wholeHours, type CsvNames } from '../csv'
import type { InsightIssue } from '../types'

const HOUR = 60 * 60 * 1000
const T0 = new Date(2026, 8, 1, 9, 5).getTime()

function issue (_id: string, over: Partial<InsightIssue> = {}): InsightIssue {
  return {
    _id,
    identifier: `SRV-${_id}`,
    title: `Issue ${_id}`,
    project: 'p',
    status: 'st-done',
    statusName: 'Done',
    statusKind: 'done',
    isEpic: false,
    assignee: 'huong',
    points: 3,
    labels: ['ui', 'api'],
    epic: 'e1',
    sprint: 's1',
    createdOn: T0,
    startedOn: T0 + DAY,
    completedOn: T0 + DAY + 26 * HOUR + 20 * 60 * 1000,
    ...over
  }
}

const names: CsvNames = (field, key) => {
  if (key === '') return `No ${field}`
  const known: Record<string, string> = { huong: 'Nguyễn Thị Hương', p: 'Servone', e1: 'Billing', s1: 'Sprint 1', ui: 'UI', api: 'API' }
  return known[key] ?? key
}

function parseCsv (text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else field += ch
  }
  return rows
}

describe('toCsv', () => {
  it('starts with a BOM, ends lines with CRLF and quotes commas, quotes and newlines', () => {
    const text = toCsv([
      ['a', 'b,c'],
      ['say "hi"', 'two\nlines']
    ])
    expect(text).toBe('﻿a,"b,c"\r\n"say ""hi""","two\nlines"\r\n')
  })

  it('round-trips Vietnamese names', () => {
    const text = toCsv([['Nguyễn Thị Hương', 'Việc, gấp']])
    expect(parseCsv(text.slice(1))).toEqual([['Nguyễn Thị Hương', 'Việc, gấp']])
  })
})

describe('csv values', () => {
  it('writes local dates Sheets parses in every locale', () => {
    expect(csvDate(T0)).toBe('2026-09-01 09:05')
    expect(csvDate(null)).toBe('')
  })

  it('writes durations as whole hours', () => {
    expect(wholeHours(26 * HOUR + 20 * 60 * 1000)).toBe('26')
    expect(wholeHours(90 * 60 * 1000)).toBe('2')
    expect(wholeHours(undefined)).toBe('')
  })

  it('keeps file names ASCII', () => {
    expect(slug('Việc của Đội / Q3')).toBe('viec-cua-doi-q3')
    expect(slug('Công việc')).toBe('cong-viec')
    expect(slug('!!!')).toBe('view')
    expect(csvFileName('Tất cả', { from: new Date(2026, 8, 1).getTime(), to: new Date(2026, 9, 1).getTime() }, 'issues')).toBe(
      'insights-tat-ca-2026-09-01-2026-09-30-issues.csv'
    )
  })
})

describe('summaryCsv', () => {
  it('writes one row per bucket and a Total over distinct issues', () => {
    const issues = [issue('a', { labels: ['ui', 'api'] }), issue('b', { labels: ['ui'], points: null, startedOn: null })]
    const text = summaryCsv(
      [
        { slice: 'ui', segment: null, stats: bucketStats(issues) },
        { slice: 'api', segment: null, stats: bucketStats([issues[0]]) }
      ],
      bucketStats(issues),
      { slice: 'label', segment: null },
      names,
      ['Slice', 'Segment', 'Issues', 'Story points', 'Unestimated', 'Median cycle time (h)', 'Median lead time (h)', 'Never started'],
      'Total'
    )
    expect(parseCsv(text.slice(1))).toEqual([
      ['Slice', 'Segment', 'Issues', 'Story points', 'Unestimated', 'Median cycle time (h)', 'Median lead time (h)', 'Never started'],
      ['UI', '', '2', '3', '1', '26', '50', '1'],
      ['API', '', '1', '3', '0', '26', '50', '0'],
      ['Total', '', '2', '3', '1', '26', '50', '1']
    ])
  })
})

describe('issuesCsv', () => {
  it('writes one row per issue with its dates and times, open work without completion', () => {
    const text = issuesCsv(
      [issue('1'), issue('2', { statusKind: 'active', statusName: 'In Progress', completedOn: null, labels: [], title: 'Fix "login", now' })],
      names,
      ['ID', 'Title', 'Project', 'Assignee', 'Status', 'Story points', 'Epic', 'Sprint', 'Labels', 'Created', 'Started', 'Completed', 'Cycle time (h)', 'Lead time (h)']
    )
    const rows = parseCsv(text.slice(1))
    expect(rows[1]).toEqual([
      'SRV-1',
      'Issue 1',
      'Servone',
      'Nguyễn Thị Hương',
      'Done',
      '3',
      'Billing',
      'Sprint 1',
      'UI; API',
      '2026-09-01 09:05',
      '2026-09-02 09:05',
      '2026-09-03 11:25',
      '26',
      '50'
    ])
    expect(rows[2].slice(0, 2)).toEqual(['SRV-2', 'Fix "login", now'])
    expect(rows[2].slice(8)).toEqual(['', '2026-09-01 09:05', '2026-09-02 09:05', '', '', ''])
  })
})

describe('formula injection', () => {
  const HEADERS = ['ID', 'Title', 'Project', 'Assignee', 'Status', 'Story points', 'Epic', 'Sprint', 'Labels', 'Created', 'Started', 'Completed', 'Cycle time (h)', 'Lead time (h)']
  const hostile: CsvNames = (field, key) => {
    const known: Record<string, string> = { p: '@x', huong: '+1', e1: '-2', ui: '\tui', api: '\rapi', s1: 'Sprint 1' }
    return known[key] ?? `No ${field}`
  }

  it('neutralises text cells that a spreadsheet would run as a formula', () => {
    const rows = parseCsv(
      issuesCsv([issue('1', { title: '=HYPERLINK("http://evil.example","click")', statusName: '=cmd' })], hostile, HEADERS).slice(1)
    )
    expect(rows[1].slice(0, 5)).toEqual(['SRV-1', '\'=HYPERLINK("http://evil.example","click")', '\'@x', '\'+1', '\'=cmd'])
    expect(rows[1][6]).toBe('\'-2')
    expect(rows[1][8]).toBe('\'\tui; \rapi')
  })

  it('keeps numbers numeric, negative ones included', () => {
    const rows = parseCsv(issuesCsv([issue('1', { points: -2 })], hostile, HEADERS).slice(1))
    expect(rows[1][5]).toBe('-2')
    expect(rows[1].slice(12)).toEqual(['26', '50'])
  })

  it('neutralises bucket names in the summary but not its counts', () => {
    const text = summaryCsv(
      [{ slice: 'huong', segment: 'e1', stats: bucketStats([issue('a', { points: -2 })]) }],
      bucketStats([issue('a', { points: -2 })]),
      { slice: 'assignee', segment: 'epic' },
      hostile,
      ['Slice', 'Segment', 'Issues', 'Story points', 'Unestimated', 'Median cycle time (h)', 'Median lead time (h)', 'Never started'],
      '=Total'
    )
    const rows = parseCsv(text.slice(1))
    expect(rows[1]).toEqual(['\'+1', '\'-2', '1', '-2', '0', '26', '50', '0'])
    expect(rows[2].slice(0, 2)).toEqual(['\'=Total', ''])
  })
})
