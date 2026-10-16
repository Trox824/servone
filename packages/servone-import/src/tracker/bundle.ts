import type { ExportFile, ImportBundle, IssueImport, PersonRef } from '../types'

export const MS_PER_HOUR = 3_600_000

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const JIRA_DATE = /^(\d{1,2})\/([a-z]{3})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap]m)?)?$/i
const TWO_DIGIT_YEAR_BASE = 2000

export function parseDate (text: string): number | undefined {
  if (/^\d+$/.test(text)) return Number(text)
  const jira = JIRA_DATE.exec(text)
  if (jira !== null) {
    const [, day, monthName, yearText, hourText = '0', minute = '0', meridiem = ''] = jira
    const month = MONTHS.indexOf(monthName.toLowerCase())
    if (month < 0) return undefined
    const year = yearText.length === 2 ? TWO_DIGIT_YEAR_BASE + Number(yearText) : Number(yearText)
    const isPm = meridiem.toLowerCase() === 'pm'
    const hour = meridiem === '' ? Number(hourText) : (Number(hourText) % 12) + (isPm ? 12 : 0)
    return new Date(year, month, Number(day), hour, Number(minute)).getTime()
  }
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? undefined : ms
}

export function person (text: string): PersonRef | undefined {
  const raw = text.trim()
  if (raw === '') return undefined
  return raw.includes('@') ? { email: raw } : { name: raw }
}

export function nonEmpty (text: string): string | undefined {
  return text === '' ? undefined : text
}

export function splitList (text: string): string[] {
  return text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export function checklistMarkdown (title: string, checks: Array<{ text: string, isDone: boolean }>): string {
  return [`**${title}**`, ...checks.map((check) => `- [${check.isDone ? 'x' : ' '}] ${check.text}`)].join('\n')
}

export function joinBlocks (blocks: string[]): string {
  return blocks.filter((block) => block.trim() !== '').join('\n\n')
}

export function fileTitle (file: ExportFile): string {
  return file.name.replace(/\.[^.]+$/, '')
}

export class TrackerBundle {
  private readonly projects = new Map<string, IssueImport[]>()
  private readonly keys = new Set<string>()
  private readonly counts = new Map<string, number>()

  count (message: string): void {
    this.counts.set(message, (this.counts.get(message) ?? 0) + 1)
  }

  date (text: string): number | undefined {
    const raw = text.trim()
    if (raw === '') return undefined
    const ms = parseDate(raw)
    if (ms === undefined) this.count('Dates that could not be read were left empty')
    return ms
  }

  add (project: string, issue: IssueImport): void {
    if (issue.title === '') {
      this.count('Rows without a title were skipped')
      return
    }
    if (this.keys.has(issue.key)) {
      this.count('Rows repeating an issue ID were skipped')
      return
    }
    this.keys.add(issue.key)
    const issues = this.projects.get(project)
    if (issues === undefined) this.projects.set(project, [issue])
    else issues.push(issue)
  }

  build (): ImportBundle {
    for (const issues of this.projects.values()) {
      for (const issue of issues) {
        if (issue.parentKey === undefined || this.keys.has(issue.parentKey)) continue
        delete issue.parentKey
        this.count('Issues whose parent is not in the export were kept at the top level')
      }
    }
    return {
      projects: [...this.projects].map(([name, issues]) => ({ name, issues })),
      channels: [],
      teamspaces: [],
      warnings: [...this.counts].map(([message, n]) => `${message}: ${n}`)
    }
  }
}
