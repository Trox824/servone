import type { Ref, Status, StatusCategory } from '@hcengineering/core'
import type { ProjectStatusGroup, ProjectStatusRow } from '@servone/config'
import { deleteBlock, dropIndex } from '../statuses'

function row (name: string, isDefault = false): ProjectStatusRow {
  return { status: name as Ref<Status>, name, isDefault, issueCount: 0 }
}

function group (...rows: ProjectStatusRow[]): ProjectStatusGroup {
  return { category: 'todo' as Ref<StatusCategory>, rows }
}

describe('deleteBlock', () => {
  it('protects the default status', () => {
    const todo = row('Todo', true)
    expect(deleteBlock(group(todo, row('Next')), todo)).toBe('default')
  })

  it('protects the last status of a group', () => {
    const done = row('Done')
    expect(deleteBlock(group(done), done)).toBe('last')
  })

  it('allows any other status', () => {
    const next = row('Next')
    expect(deleteBlock(group(row('Todo', true), next), next)).toBeUndefined()
  })
})

describe('dropIndex', () => {
  it('moves a row down past the hovered one', () => {
    expect(dropIndex(0, 2, true)).toBe(2) // A after C: B C A D
    expect(dropIndex(0, 3, false)).toBe(2) // A before D: B C A D
  })

  it('moves a row up', () => {
    expect(dropIndex(3, 1, false)).toBe(1) // D before B: A D B C
    expect(dropIndex(3, 0, true)).toBe(1) // D after A: A D B C
  })

  it('reports no move when the row lands where it was', () => {
    expect(dropIndex(1, 2, false)).toBeUndefined()
    expect(dropIndex(1, 0, true)).toBeUndefined()
    expect(dropIndex(1, 1, true)).toBeUndefined()
  })
})
