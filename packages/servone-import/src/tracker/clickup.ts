import { CsvTable } from '../csv'
import type { CommentImport, ExportFile, ImportBundle } from '../types'
import { decodeText } from '../zip'
import {
  MS_PER_HOUR,
  TrackerBundle,
  checklistMarkdown,
  fileTitle,
  joinBlocks,
  nonEmpty,
  person,
  splitList
} from './bundle'
import { priority, statusCategory } from './status'

const BAD_JSON = 'ClickUp comment or checklist cells that could not be read were ignored'

function readJson (text: string, bundle: TrackerBundle): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    bundle.count(BAD_JSON)
    return undefined
  }
}

function readComments (text: string, bundle: TrackerBundle): CommentImport[] {
  const parsed = readJson(text, bundle)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((comment) => typeof comment?.text === 'string' && comment.text.trim() !== '')
    .map((comment) => ({
      author: person(String(comment.by ?? '')),
      date: bundle.date(String(comment.date ?? '')),
      text: comment.text.trim()
    }))
}

function readChecklists (text: string, bundle: TrackerBundle): string {
  const parsed = readJson(text, bundle)
  if (typeof parsed !== 'object' || parsed === null) return ''
  return joinBlocks(
    Object.entries(parsed).map(([title, checks]) =>
      checklistMarkdown(
        title,
        (Array.isArray(checks) ? checks : []).map((check) => ({ text: String(check), isDone: false }))
      )
    )
  )
}

export function parseClickup (file: ExportFile): ImportBundle {
  const table = new CsvTable(decodeText(file.bytes))
  table.require('Task ID', 'Task Name', 'Status')
  const bundle = new TrackerBundle()
  for (const row of table.rows) {
    const cell = (name: string): string => {
      const text = table.first(row, name)
      return text === 'null' ? '' : text
    }
    const status = cell('Status')
    const estimateMs = Number(cell('Time Estimated'))
    const project = nonEmpty(cell('Space Name')) ?? nonEmpty(cell('List Name')) ?? fileTitle(file)
    bundle.add(project, {
      key: cell('Task ID'),
      parentKey: nonEmpty(cell('Parent ID')),
      title: cell('Task Name'),
      description: joinBlocks([
        cell('Task Content').replaceAll('\\n', '\n'),
        readChecklists(cell('Checklists'), bundle)
      ]),
      status: statusCategory(status),
      sourceStatus: status,
      priority: priority(cell('Priority')),
      assignee: person(splitList(cell('Assignees'))[0] ?? ''),
      labels: splitList(cell('Tags')),
      estimateHours: estimateMs > 0 ? estimateMs / MS_PER_HOUR : undefined,
      dueDate: bundle.date(cell('Due Date')),
      createdOn: bundle.date(cell('Date Created')),
      comments: readComments(cell('Comments'), bundle)
    })
  }
  return bundle.build()
}
