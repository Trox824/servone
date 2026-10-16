import { slugify, type ConfigSnapshot, type Operation, type RecordTypeInfo } from '@servone/config'
import { addLinkOp, defaultFarName } from '../links'
import { text } from '../strings'
import { createTypeOp, findType, isNameTaken, takenKeys, uniqueKey } from '../type-list'
import type { Drop } from './flow'
import { connectPanel, typeKeyOfNode, type GraphPanel } from './panel'

export interface ConnectedType {
  typeKey: string
  ops: Operation[]
}

export function dropPanel (snapshot: ConfigSnapshot, sourceId: string, drop: Drop): GraphPanel {
  if (drop.kind === 'node' && drop.nodeId !== sourceId) return connectPanel(snapshot, sourceId, drop.nodeId)
  const key = typeKeyOfNode(sourceId)
  const type = key === undefined ? undefined : findType(snapshot, key)
  return type === undefined ? { kind: 'none' } : { kind: 'newConnectedType', type }
}

export function connectedTypeIssues (snapshot: ConfigSnapshot, name: string): string[] {
  if (name.trim() === '') return [text('IssueFormName')]
  if (isNameTaken(snapshot, name)) return [text('IssueFormTaken')]
  return []
}

export function connectedType (snapshot: ConfigSnapshot, source: RecordTypeInfo, name: string): ConnectedType {
  const trimmed = name.trim()
  const typeKey = uniqueKey(slugify(trimmed), takenKeys(snapshot))
  const linkKey = uniqueKey(slugify(`${source.name} ${trimmed}`), new Set(snapshot.links.map((it) => it.key)))
  const link = addLinkOp(
    source.key,
    { targetKey: typeKey, fieldName: trimmed, farFieldName: defaultFarName(source.name), isMany: false, isFarMany: true },
    linkKey
  )
  return { typeKey, ops: [createTypeOp(typeKey, trimmed, undefined, source.spaces), link] }
}
