import core, { type Class, type Doc, type Ref, type TxOperations } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import type { IntlString } from '@hcengineering/platform'
import preference, { type Preference } from '@hcengineering/preference'
import { showPopup } from '@hcengineering/ui'
import {
  SECTION_ATTACHED_TO,
  nextSectionOrder,
  readSectionId,
  reorderSections,
  type ChatSection,
  type MoveDirection
} from '../../../lib/chat/sections'
import SectionNamePopup from './SectionNamePopup.svelte'

interface StoredSection extends Preference {
  servoneName: string
  servoneOrder: number
}

interface SectionedNotifyContext extends DocNotifyContext {
  servoneSectionId?: Ref<Doc> | null
}

const sectionClass = preference.class.Preference as Ref<Class<StoredSection>>

function storedRef (id: Ref<Doc>): Ref<StoredSection> {
  return id as Ref<StoredSection>
}

export async function createSection (
  client: TxOperations,
  name: string,
  sections: ChatSection[]
): Promise<Ref<Doc>> {
  return await client.createDoc(sectionClass, core.space.Workspace, {
    attachedTo: SECTION_ATTACHED_TO,
    servoneName: name,
    servoneOrder: nextSectionOrder(sections)
  })
}

export async function renameSection (client: TxOperations, id: Ref<Doc>, name: string): Promise<void> {
  await client.updateDoc(sectionClass, core.space.Workspace, storedRef(id), { servoneName: name })
}

export async function moveSection (
  client: TxOperations,
  sections: ChatSection[],
  id: Ref<Doc>,
  direction: MoveDirection
): Promise<void> {
  const updates = reorderSections(sections, id, direction)
  if (updates.length === 0) return
  const ops = client.apply(undefined, 'servone-move-chat-section')
  for (const { _id, order } of updates) {
    await ops.updateDoc(sectionClass, core.space.Workspace, storedRef(_id), { servoneOrder: order })
  }
  await ops.commit()
}

export async function deleteSection (
  client: TxOperations,
  id: Ref<Doc>,
  contexts: DocNotifyContext[]
): Promise<void> {
  const ops = client.apply(undefined, 'servone-delete-chat-section')
  for (const context of contexts) {
    if (readSectionId(context) !== id) continue
    const sectioned: SectionedNotifyContext = context
    await ops.update(sectioned, { servoneSectionId: null })
  }
  await ops.removeDoc(sectionClass, core.space.Workspace, storedRef(id))
  await ops.commit()
}

export async function moveToSection (client: TxOperations, context: DocNotifyContext, id: Ref<Doc>): Promise<void> {
  const sectioned: SectionedNotifyContext = context
  await client.update(sectioned, { servoneSectionId: id, isPinned: false })
}

export async function removeFromSection (client: TxOperations, context: DocNotifyContext): Promise<void> {
  const sectioned: SectionedNotifyContext = context
  await client.update(sectioned, { servoneSectionId: null })
}

export async function askSectionName (label: IntlString, name = ''): Promise<string | undefined> {
  return await new Promise((resolve) => {
    showPopup(SectionNamePopup, { label, name }, 'top', (result?: string) => {
      resolve(result)
    })
  })
}
