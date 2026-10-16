import type { AddLinkOp, ConfigSnapshot, RecordTypeInfo, RemoveLinkOp } from '@servone/config'
import { text } from './strings'

export interface LinkRow {
  key: string
  targetKey: string
  targetName: string
  fieldName: string
  farFieldName: string
  isMany: boolean
  isFarMany: boolean
  isReadOnly: boolean
}

export function linkRows (snapshot: ConfigSnapshot, type: RecordTypeInfo): LinkRow[] {
  const nameOf = (key: string): string => snapshot.types.find((it) => it.key === key)?.name ?? key
  const links = snapshot.links.flatMap((link): LinkRow[] => {
    if (link.from === type.key) {
      return [
        {
          key: link.key,
          targetKey: link.to,
          targetName: nameOf(link.to),
          fieldName: link.fromName,
          farFieldName: link.toName,
          isMany: link.fromMany,
          isFarMany: link.toMany,
          isReadOnly: false
        }
      ]
    }
    if (link.to === type.key) {
      return [
        {
          key: link.key,
          targetKey: link.from,
          targetName: nameOf(link.from),
          fieldName: link.toName,
          farFieldName: link.fromName,
          isMany: link.toMany,
          isFarMany: link.fromMany,
          isReadOnly: false
        }
      ]
    }
    return []
  })
  const references = type.fields.flatMap((field): LinkRow[] => {
    const { kind } = field
    if (kind.kind !== 'reference') return []
    return [
      {
        key: `ref:${field.key}`,
        targetKey: kind.to,
        targetName: nameOf(kind.to),
        fieldName: field.name,
        farFieldName: '',
        isMany: false,
        isFarMany: false,
        isReadOnly: true
      }
    ]
  })
  return [...links, ...references]
}

export function howManyQuestion (from: string, to: string): string {
  return text('HowMany', { from, to })
}

export function defaultFarName (typeName: string): string {
  return text('LinkedFrom', { name: typeName })
}

export interface LinkDraft {
  targetKey: string
  fieldName: string
  farFieldName: string
  isMany: boolean
  isFarMany: boolean
}

export function addLinkOp (typeKey: string, draft: LinkDraft, key: string): AddLinkOp {
  return {
    op: 'addLink',
    key,
    from: typeKey,
    to: draft.targetKey,
    fromName: draft.fieldName.trim(),
    toName: draft.farFieldName.trim(),
    fromMany: draft.isMany,
    toMany: draft.isFarMany
  }
}

export function removeLinkOp (row: LinkRow): RemoveLinkOp {
  return { op: 'removeLink', link: row.key }
}

export function linkDraftIssues (draft: LinkDraft): string[] {
  const issues: string[] = []
  if (draft.targetKey === '') issues.push(text('IssueNoTarget'))
  if (draft.fieldName.trim() === '' || draft.farFieldName.trim() === '') issues.push(text('IssueLinkName'))
  return issues
}
