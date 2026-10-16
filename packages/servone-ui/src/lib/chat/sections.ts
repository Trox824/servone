import type { Doc, Ref } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'

export const SECTION_ATTACHED_TO = 'servone:chat-section'

export const MAX_SECTION_NAME = 80

export interface ChatSection {
  _id: Ref<Doc>
  name: string
  order: number
}

export type MoveDirection = 'up' | 'down'

export function parseSection (doc: Doc): ChatSection | undefined {
  if (!('servoneName' in doc) || typeof doc.servoneName !== 'string') return undefined
  const order = 'servoneOrder' in doc && typeof doc.servoneOrder === 'number' ? doc.servoneOrder : 0
  return { _id: doc._id, name: doc.servoneName, order }
}

export function sortSections (sections: ChatSection[]): ChatSection[] {
  return [...sections].sort((a, b) => a.order - b.order || a._id.localeCompare(b._id))
}

export function nextSectionOrder (sections: ChatSection[]): number {
  return sections.reduce((max, section) => Math.max(max, section.order + 1), 0)
}

export function parseSectionName (raw: string): string | undefined {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > MAX_SECTION_NAME) return undefined
  return name
}

export function readSectionId (context: DocNotifyContext): Ref<Doc> | undefined {
  if (!('servoneSectionId' in context) || typeof context.servoneSectionId !== 'string') return undefined
  return context.servoneSectionId as Ref<Doc>
}

export function liveSectionId (context: DocNotifyContext, liveIds: ReadonlySet<Ref<Doc>>): Ref<Doc> | undefined {
  const id = readSectionId(context)
  return id !== undefined && liveIds.has(id) ? id : undefined
}

export function reorderSections (
  sections: ChatSection[],
  id: Ref<Doc>,
  direction: MoveDirection
): Array<{ _id: Ref<Doc>, order: number }> {
  const sorted = sortSections(sections)
  const from = sorted.findIndex((section) => section._id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= sorted.length) return []
  const [moved] = sorted.splice(from, 1)
  sorted.splice(to, 0, moved)
  return sorted
    .map((section, index) => ({ _id: section._id, order: index, previous: section.order }))
    .filter((section) => section.order !== section.previous)
    .map(({ _id, order }) => ({ _id, order }))
}
