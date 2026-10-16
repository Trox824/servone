import card, { type CardSpace, type MasterTag, type Tag } from '@hcengineering/card'
import type { AccountUuid, AnyAttribute, Association, Class, Obj, Ref } from '@hcengineering/core'
import { readRule } from './automation'
import { ruleSentences } from './automation-text'
import type { ConfigSession } from './client'
import { fieldKindOf } from './fields'
import { labelText } from './keys'
import type { AccessPreset } from './operations'
import { readServone } from './servone-fields'
import { loadState, type ModelState } from './state'
import type { AutomationInfo, ConfigSnapshot, FieldInfo, GroupInfo, LinkInfo, RecordTypeInfo, TypeAccessInfo } from './types'

export async function describe (session: ConfigSession, filter: { type?: string } = {}): Promise<ConfigSnapshot> {
  return snapshotOf(await loadState(session.client), filter.type)
}

function fieldInfo (state: ModelState, attr: AnyAttribute): FieldInfo {
  return {
    key: state.fieldKey(attr),
    name: labelText(attr.label),
    kind: fieldKindOf(attr, state),
    isRequired: attr.required === true,
    isBuiltIn: attr.isCustom !== true,
    packKey: readServone(attr).servonePackKey
  }
}

function visibleFields (state: ModelState, owner: Ref<Class<Obj>>): FieldInfo[] {
  return state
    .fieldsOf(owner)
    .filter((it) => it.hidden !== true)
    .map((it) => fieldInfo(state, it))
}

function accessOf (state: ModelState, type: MasterTag): TypeAccessInfo[] {
  const assigned = (space: CardSpace, preset: AccessPreset): AccountUuid[] => {
    const role = state.roleFor(type._id, preset)
    return role !== undefined ? state.assignment(space, role._id) : []
  }
  const hasRoles = (['viewer', 'editor', 'manager'] as const).some((preset) => state.roleFor(type._id, preset) !== undefined)
  if (!hasRoles) return []
  return state.spacesOf(type._id).map((space) => ({
    space: space._id,
    viewer: assigned(space, 'viewer'),
    editor: assigned(space, 'editor'),
    manager: assigned(space, 'manager')
  }))
}

function automationsOf (state: ModelState, type: MasterTag): AutomationInfo[] {
  return state
    .processesOf(type._id)
    .map((doc) => {
      const automation = readRule(readServone(doc).servoneRule)
      const sentences =
        automation !== null ? ruleSentences(state, type, automation) : [doc.description].filter((it) => it.trim() !== '')
      return { key: state.keyOf(doc), name: doc.name, automation, sentences }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

function typeInfo (state: ModelState, type: MasterTag): RecordTypeInfo {
  const parent = state.types().find((it) => it._id === type.extends)
  return {
    key: state.keyOf(type),
    name: state.nameOf(type),
    isSystem: state.isSystem(type),
    isArchived: state.isArchived(type),
    basedOn: parent !== undefined ? state.keyOf(parent) : undefined,
    spaces: state.spacesOf(type._id).map((it) => it._id),
    fields: visibleFields(state, type._id),
    access: accessOf(state, type),
    packKey: readServone(type).servonePackKey,
    automations: automationsOf(state, type)
  }
}

function groupInfo (state: ModelState, group: Tag): GroupInfo {
  return {
    key: state.keyOf(group),
    name: state.nameOf(group),
    type: state.ownerKey(group.extends ?? card.class.Card),
    fields: visibleFields(state, group._id),
    packKey: readServone(group).servonePackKey
  }
}

function linkInfo (state: ModelState, link: Association): LinkInfo {
  return {
    key: state.keyOf(link),
    from: state.ownerKey(link.classA),
    to: state.ownerKey(link.classB),
    // nameB labels the field on A records: RelationsEditor lists classA's associations under nameB.
    fromName: link.nameB,
    toName: link.nameA,
    fromMany: link.type !== '1:1',
    toMany: link.type === 'N:N',
    packKey: readServone(link).servonePackKey
  }
}

export function snapshotOf (state: ModelState, typeKey?: string): ConfigSnapshot {
  const types = state.types().filter((it) => typeKey === undefined || state.keyOf(it) === typeKey)
  const cardTypes = new Set<string>(state.types().map((it) => it._id))
  const shown = new Set<string>(types.map((it) => it._id))
  const links = state
    .links()
    .filter((it) => cardTypes.has(it.classA) || cardTypes.has(it.classB))
    .filter((it) => typeKey === undefined || shown.has(it.classA) || shown.has(it.classB))
  const groups = state.groups().filter((it) => typeKey === undefined || shown.has(it.extends ?? ''))
  return {
    version: state.version(),
    types: types.map((it) => typeInfo(state, it)),
    groups: groups.map((it) => groupInfo(state, it)),
    links: links.map((it) => linkInfo(state, it)),
    spaces: state.spaces().map((it) => ({ id: it._id, name: it.name, isRestricted: it.restricted === true, isArchived: it.archived }))
  }
}
