import { notEmpty } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import preference from '@hcengineering/preference'
import { createQuery } from '@hcengineering/presentation'
import { getContext, setContext } from 'svelte'
import { readable, writable, type Readable } from 'svelte/store'
import { SECTION_ATTACHED_TO, parseSection, sortSections, type ChatSection } from '../../../lib/chat/sections'

export const sectionString = {
  NewSection: 'chunter:string:ServoneNewSection' as IntlString,
  NewSectionEllipsis: 'chunter:string:ServoneNewSectionEllipsis' as IntlString,
  SectionName: 'chunter:string:ServoneSectionName' as IntlString,
  RenameSection: 'chunter:string:ServoneRenameSection' as IntlString,
  DeleteSection: 'chunter:string:ServoneDeleteSection' as IntlString,
  DeleteSectionHint: 'chunter:string:ServoneDeleteSectionHint' as IntlString,
  DragChannelsHere: 'chunter:string:ServoneDragChannelsHere' as IntlString,
  MoveToSection: 'chunter:string:ServoneMoveToSection' as IntlString,
  RemoveFromSection: 'chunter:string:ServoneRemoveFromSection' as IntlString,
  MoveUp: 'chunter:string:ServoneMoveUp' as IntlString,
  MoveDown: 'chunter:string:ServoneMoveDown' as IntlString
}

export const CONTEXT_DRAG_TYPE = 'application/x-servone-notify-context'

const SECTIONS_KEY = 'servone:chat-sections'

export function provideSections (): Readable<ChatSection[]> {
  const store = writable<ChatSection[]>([])
  createQuery().query(preference.class.Preference, { attachedTo: SECTION_ATTACHED_TO }, (docs) => {
    store.set(sortSections(docs.map(parseSection).filter(notEmpty)))
  })
  setContext(SECTIONS_KEY, store)
  return store
}

export function sectionsContext (): Readable<ChatSection[]> {
  return getContext<Readable<ChatSection[]> | undefined>(SECTIONS_KEY) ?? readable([])
}
