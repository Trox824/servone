import type { Class, Doc, Ref, Space } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import {
  MAX_SECTION_NAME,
  liveSectionId,
  nextSectionOrder,
  parseSection,
  parseSectionName,
  reorderSections,
  sortSections,
  type ChatSection
} from '../sections'

function section (id: string, order: number): ChatSection {
  return { _id: id as Ref<Doc>, name: id, order }
}

function context (servoneSectionId?: string | null): DocNotifyContext {
  const base: DocNotifyContext = {
    _id: 'ctx' as Ref<DocNotifyContext>,
    _class: 'notification:class:DocNotifyContext' as Ref<Class<DocNotifyContext>>,
    space: 'space' as DocNotifyContext['space'],
    modifiedOn: 0,
    modifiedBy: 'sid' as DocNotifyContext['modifiedBy'],
    user: 'acc' as DocNotifyContext['user'],
    objectId: 'obj' as Ref<Doc>,
    objectClass: 'chunter:class:Channel' as Ref<Class<Doc>>,
    objectSpace: 'space' as Ref<Space>,
    isPinned: false,
    hidden: false
  }
  return servoneSectionId === undefined ? base : Object.assign(base, { servoneSectionId })
}

describe('chat sections', () => {
  it('parses stored docs and skips foreign preferences', () => {
    const doc: Doc = {
      _id: 's1' as Ref<Doc>,
      _class: 'c' as Ref<Class<Doc>>,
      space: 'w' as Ref<Space>,
      modifiedOn: 0,
      modifiedBy: 'sid' as Doc['modifiedBy']
    }
    expect(parseSection(Object.assign({ ...doc }, { servoneName: 'Sales', servoneOrder: 2 }))).toEqual({
      _id: 's1',
      name: 'Sales',
      order: 2
    })
    expect(parseSection(doc)).toBeUndefined()
  })

  it('sorts by order, then id', () => {
    const sorted = sortSections([section('b', 1), section('c', 0), section('a', 1)])
    expect(sorted.map((s) => s._id)).toEqual(['c', 'a', 'b'])
  })

  it('appends new sections after the last one', () => {
    expect(nextSectionOrder([])).toBe(0)
    expect(nextSectionOrder([section('a', 0), section('b', 4)])).toBe(5)
  })

  it('trims names and rejects empty or long ones', () => {
    expect(parseSectionName('  Sales   team ')).toBe('Sales team')
    expect(parseSectionName('   ')).toBeUndefined()
    expect(parseSectionName('x'.repeat(MAX_SECTION_NAME))).toHaveLength(MAX_SECTION_NAME)
    expect(parseSectionName('x'.repeat(MAX_SECTION_NAME + 1))).toBeUndefined()
  })

  it('treats ids of deleted sections as unsectioned', () => {
    const live = new Set(['s1' as Ref<Doc>])
    expect(liveSectionId(context('s1'), live)).toBe('s1')
    expect(liveSectionId(context('gone'), live)).toBeUndefined()
    expect(liveSectionId(context(null), live)).toBeUndefined()
    expect(liveSectionId(context(), live)).toBeUndefined()
  })

  it('swaps neighbours and renumbers only what changed', () => {
    const sections = [section('a', 0), section('b', 1), section('c', 2)]
    expect(reorderSections(sections, 'c' as Ref<Doc>, 'up')).toEqual([
      { _id: 'c', order: 1 },
      { _id: 'b', order: 2 }
    ])
    expect(reorderSections(sections, 'a' as Ref<Doc>, 'up')).toEqual([])
    expect(reorderSections(sections, 'c' as Ref<Doc>, 'down')).toEqual([])
  })

  it('renumbers tied orders into a strict sequence', () => {
    const sections = [section('a', 0), section('b', 0)]
    expect(reorderSections(sections, 'b' as Ref<Doc>, 'up')).toEqual([{ _id: 'a', order: 1 }])
  })
})
