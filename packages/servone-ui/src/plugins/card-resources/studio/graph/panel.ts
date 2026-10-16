import type { ConfigSnapshot, FieldInfo, RecordTypeInfo } from '@servone/config'
import { draftOf as ruleDraftOf, newRuleDraft, type RuleDraft } from '../automation'
import { linkRows, type LinkRow } from '../links'
import { findType } from '../type-list'
import type { NodeTarget } from './model'

export type GraphPanel =
  | { kind: 'none' }
  | { kind: 'field', type: RecordTypeInfo, owner: string, ownerName: string, field: FieldInfo | undefined, siblings: FieldInfo[], canLink: boolean }
  | { kind: 'rule', type: RecordTypeInfo, draft: RuleDraft }
  | { kind: 'link', type: RecordTypeInfo, row: LinkRow }
  | { kind: 'newLink', type: RecordTypeInfo, targetKey: string }
  | { kind: 'access', type: RecordTypeInfo }
  | { kind: 'createType' }
  | { kind: 'newConnectedType', type: RecordTypeInfo }

const NONE: GraphPanel = { kind: 'none' }
const TYPE_PREFIX = 'type:'

function fieldPanel (snapshot: ConfigSnapshot, type: RecordTypeInfo, owner: string, fieldKey: string | undefined): GraphPanel {
  const group = snapshot.groups.find((it) => it.key === owner)
  const ownerName = owner === type.key ? type.name : group?.name
  const siblings = owner === type.key ? type.fields : group?.fields
  if (ownerName === undefined || siblings === undefined) return NONE
  const field = fieldKey === undefined ? undefined : siblings.find((it) => it.key === fieldKey)
  if (fieldKey !== undefined && field === undefined) return NONE
  return { kind: 'field', type, owner, ownerName, field, siblings, canLink: field === undefined && owner === type.key }
}

export function panelFor (snapshot: ConfigSnapshot, typeKey: string | undefined, target: NodeTarget): GraphPanel {
  if (target.kind === 'createType') return { kind: 'createType' }
  const type = typeKey === undefined ? undefined : findType(snapshot, typeKey)
  if (type === undefined) return NONE
  switch (target.kind) {
    case 'question':
      return fieldPanel(snapshot, type, target.owner, target.fieldKey)
    case 'rule': {
      if (target.ruleKey === undefined) return { kind: 'rule', type, draft: newRuleDraft() }
      const rule = type.automations.find((it) => it.key === target.ruleKey)
      const draft = rule === undefined ? undefined : ruleDraftOf(rule)
      return draft === undefined ? NONE : { kind: 'rule', type, draft }
    }
    case 'link': {
      if (target.linkKey === undefined) return { kind: 'newLink', type, targetKey: '' }
      const row = linkRows(snapshot, type).find((it) => it.key === target.linkKey)
      return row === undefined ? NONE : { kind: 'link', type, row }
    }
    case 'access':
      return { kind: 'access', type }
    case 'none':
    case 'openForm':
    case 'hulyProcess':
      return NONE
  }
}

export function typeKeyOfNode (nodeId: string): string | undefined {
  return nodeId.startsWith(TYPE_PREFIX) ? nodeId.slice(TYPE_PREFIX.length) : undefined
}

export function connectPanel (snapshot: ConfigSnapshot, source: string, target: string): GraphPanel {
  const fromKey = typeKeyOfNode(source)
  const toKey = typeKeyOfNode(target)
  if (fromKey === undefined || toKey === undefined || fromKey === toKey) return NONE
  const type = findType(snapshot, fromKey)
  return type === undefined ? NONE : { kind: 'newLink', type, targetKey: toKey }
}
