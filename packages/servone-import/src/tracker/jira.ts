import { CsvTable } from '../csv'
import type { CommentImport, ExportFile, ImportBundle } from '../types'
import { decodeText } from '../zip'
import { MS_PER_HOUR, TrackerBundle, fileTitle, nonEmpty, person } from './bundle'
import { matchStatus, priority, statusCategory } from './status'

const MS_PER_SECOND = 1000
const JIRA_COMMENT = /^([^;]*);([^;]*);([\s\S]*)$/
const PEOPLE_COLUMNS = ['Assignee', 'Reporter', 'Creator']

export function jiraToMarkdown (wiki: string): string {
  return wiki
    .replace(/\r\n/g, '\n')
    .replace(/\{code(?::([\w+-]+))?[^}]*\}([\s\S]*?)\{code\}/g, (_, lang: string | undefined, code: string) => `\`\`\`${lang ?? ''}\n${code.trim()}\n\`\`\``)
    .replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, (_, code: string) => `\`\`\`\n${code.trim()}\n\`\`\``)
    .replace(/^# /gm, '1. ')
    .replace(/^h([1-6])\.\s*/gm, (_, level: string) => `${'#'.repeat(Number(level))} `)
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s.,;:!?)]|$)/gm, '$1**$2**')
    .replace(/\{\{([^}]+)\}\}/g, '`$1`')
    .replace(/\[([^|\]\n]+)\|([^\]\n]+)\]/g, '[$1]($2)')
}

export function parseJira (file: ExportFile): ImportBundle {
  const table = new CsvTable(decodeText(file.bytes))
  table.require('Summary', 'Issue id', 'Status')
  const bundle = new TrackerBundle()
  const nameById = new Map<string, string>()
  for (const row of table.rows) {
    for (const column of PEOPLE_COLUMNS) {
      const id = table.first(row, `${column} Id`)
      const name = table.first(row, column)
      if (id !== '' && name !== '') nameById.set(id, name)
    }
  }
  const readComment = (raw: string): CommentImport => {
    const match = JIRA_COMMENT.exec(raw)
    if (match === null) return { text: raw }
    const [, when, who, text] = match
    return { author: person(nameById.get(who) ?? who), date: bundle.date(when), text: jiraToMarkdown(text.trim()) }
  }
  for (const row of table.rows) {
    const cell = (name: string): string => table.first(row, name)
    const status = cell('Status')
    const estimateSeconds = Number(cell('Original Estimate'))
    bundle.add(nonEmpty(cell('Project name')) ?? fileTitle(file), {
      key: cell('Issue id'),
      parentKey: nonEmpty(cell('Parent id')) ?? nonEmpty(cell('Parent')),
      title: cell('Summary'),
      description: jiraToMarkdown(cell('Description')),
      status: statusCategory(status, matchStatus(cell('Status Category'))),
      sourceStatus: status,
      priority: priority(cell('Priority')),
      assignee: person(cell('Assignee')),
      creator: person(cell('Reporter')),
      labels: table.all(row, 'Labels'),
      estimateHours: estimateSeconds > 0 ? (estimateSeconds * MS_PER_SECOND) / MS_PER_HOUR : undefined,
      dueDate: bundle.date(cell('Due date')),
      createdOn: bundle.date(cell('Created')),
      comments: table.all(row, 'Comment').map(readComment)
    })
  }
  return bundle.build()
}
