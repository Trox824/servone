import { CsvTable } from '../csv'
import type { ExportFile, ImportBundle } from '../types'
import { decodeText } from '../zip'
import { TrackerBundle, fileTitle, nonEmpty, person, splitList } from './bundle'
import { priority, statusCategory } from './status'

export function parseLinear (file: ExportFile): ImportBundle {
  const table = new CsvTable(decodeText(file.bytes))
  table.require('ID', 'Title', 'Status')
  const bundle = new TrackerBundle()
  for (const row of table.rows) {
    const cell = (name: string): string => table.first(row, name)
    const status = cell('Status')
    const isCanceled = cell('Canceled') !== ''
    const isCompleted = cell('Completed') !== ''
    const known = isCanceled ? 'canceled' : isCompleted ? 'done' : undefined
    bundle.add(nonEmpty(cell('Team')) ?? fileTitle(file), {
      key: cell('ID'),
      parentKey: nonEmpty(cell('Parent issue')),
      title: cell('Title'),
      description: cell('Description'),
      status: statusCategory(status, known),
      sourceStatus: status,
      priority: priority(cell('Priority')),
      assignee: person(cell('Assignee')),
      creator: person(cell('Creator')),
      labels: splitList(cell('Labels')),
      dueDate: bundle.date(cell('Due Date')),
      createdOn: bundle.date(cell('Created')),
      comments: []
    })
  }
  return bundle.build()
}
