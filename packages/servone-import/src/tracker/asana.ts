import { CsvTable } from '../csv'
import type { ExportFile, ImportBundle } from '../types'
import { decodeText } from '../zip'
import { TrackerBundle, fileTitle, person, splitList } from './bundle'
import { statusCategory } from './status'

export function parseAsana (file: ExportFile): ImportBundle {
  const table = new CsvTable(decodeText(file.bytes))
  table.require('Task ID', 'Name')
  const bundle = new TrackerBundle()
  const keyByName = new Map<string, string | null>()
  for (const row of table.rows) {
    const name = table.first(row, 'Name')
    keyByName.set(name, keyByName.has(name) ? null : table.first(row, 'Task ID'))
  }
  for (const row of table.rows) {
    const cell = (name: string): string => table.first(row, name)
    const section = cell('Section/Column')
    const parentName = cell('Parent task')
    const parentKey = parentName === '' ? undefined : keyByName.get(parentName) ?? undefined
    if (parentName !== '' && parentKey === undefined) {
      bundle.count('Asana subtasks whose parent name is missing or not unique were kept at the top level')
    }
    const assignee = person(cell('Assignee'))
    const email = cell('Assignee Email')
    bundle.add(splitList(cell('Projects'))[0] ?? fileTitle(file), {
      key: cell('Task ID'),
      parentKey,
      title: cell('Name'),
      description: cell('Notes'),
      status: statusCategory(section, cell('Completed At') !== '' ? 'done' : undefined),
      sourceStatus: section,
      priority: 'none',
      assignee: email === '' ? assignee : { ...assignee, email },
      labels: splitList(cell('Tags')),
      dueDate: bundle.date(cell('Due Date')),
      createdOn: bundle.date(cell('Created At')),
      comments: []
    })
  }
  return bundle.build()
}
