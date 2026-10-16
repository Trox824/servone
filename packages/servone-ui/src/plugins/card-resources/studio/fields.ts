import type {
  AddFieldOp,
  ConfigSnapshot,
  FieldInfo,
  FieldKind,
  FieldKindInfo,
  Operation,
  OptionChange,
  RecordTypeInfo,
  RemoveFieldOp,
  UpdateFieldOp
} from '@servone/config'
import { text, type StringKey } from './strings'
import { normalizeName } from './type-list'

export type KindId = FieldKind['kind']
export type RowKind = FieldKindInfo['kind'] | 'link'

const KIND_LABEL: Record<RowKind, StringKey> = {
  text: 'KindText',
  longText: 'KindLongText',
  number: 'KindNumber',
  money: 'KindMoney',
  date: 'KindDate',
  boolean: 'KindBoolean',
  select: 'KindSelect',
  multiSelect: 'KindMultiSelect',
  person: 'KindPerson',
  autoNumber: 'KindAutoNumber',
  reference: 'KindReference',
  other: 'KindOther',
  link: 'KindLink'
}

const DEFAULT_CURRENCY = 'VND'
const DEFAULT_PREFIX = 'HS-'

export function kindLabel (kind: RowKind): string {
  return text(KIND_LABEL[kind])
}

export function defaultKind (kind: KindId): FieldKind {
  switch (kind) {
    case 'text':
      return { kind: 'text' }
    case 'longText':
      return { kind: 'longText' }
    case 'number':
      return { kind: 'number' }
    case 'money':
      return { kind: 'money', currency: DEFAULT_CURRENCY }
    case 'date':
      return { kind: 'date' }
    case 'boolean':
      return { kind: 'boolean' }
    case 'select':
      return { kind: 'select', options: [] }
    case 'multiSelect':
      return { kind: 'multiSelect', options: [] }
    case 'person':
      return { kind: 'person' }
    case 'autoNumber':
      return { kind: 'autoNumber', prefix: DEFAULT_PREFIX }
  }
}

export interface OptionEdit {
  id: number
  original: string | undefined
  label: string
  isRemoved: boolean
  mapToId: number | undefined
}

export interface FieldDraft {
  name: string
  kind: FieldKind
  isRequired: boolean
  options: OptionEdit[]
}

export function hasOptions (kind: FieldKind): boolean {
  return kind.kind === 'select' || kind.kind === 'multiSelect'
}

export function isEditableKind (kind: FieldKindInfo): kind is FieldKind {
  return kind.kind !== 'reference' && kind.kind !== 'other'
}

export function newDraft (): FieldDraft {
  return { name: '', kind: { kind: 'text' }, isRequired: false, options: [] }
}

export function draftOf (field: FieldInfo): FieldDraft | undefined {
  const { kind } = field
  if (!isEditableKind(kind)) return undefined
  const labels = kind.kind === 'select' || kind.kind === 'multiSelect' ? kind.options : []
  const options = labels.map((label, id): OptionEdit => ({ id, original: label, label, isRemoved: false, mapToId: undefined }))
  return { name: field.name, kind, isRequired: field.isRequired, options }
}

export function addOption (edits: OptionEdit[]): OptionEdit[] {
  const id = edits.reduce((max, it) => Math.max(max, it.id), -1) + 1
  return [...edits, { id, original: undefined, label: '', isRemoved: false, mapToId: undefined }]
}

export function renameOption (edits: OptionEdit[], id: number, label: string): OptionEdit[] {
  return edits.map((it) => (it.id === id ? { ...it, label } : it))
}

export function removeOption (edits: OptionEdit[], id: number): OptionEdit[] {
  const target = edits.find((it) => it.id === id)
  if (target === undefined) return edits
  const unmapped = edits.map((it) => (it.mapToId === id ? { ...it, mapToId: undefined } : it))
  if (target.original === undefined) return unmapped.filter((it) => it.id !== id)
  return unmapped.map((it) => (it.id === id ? { ...it, isRemoved: true, mapToId: undefined } : it))
}

export function restoreOption (edits: OptionEdit[], id: number): OptionEdit[] {
  return edits.map((it) => (it.id === id ? { ...it, isRemoved: false, mapToId: undefined } : it))
}

export function mapOption (edits: OptionEdit[], id: number, mapToId: number | undefined): OptionEdit[] {
  return edits.map((it) => (it.id === id ? { ...it, mapToId } : it))
}

export function moveOption (edits: OptionEdit[], id: number, delta: -1 | 1): OptionEdit[] {
  const from = edits.findIndex((it) => it.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= edits.length) return edits
  const moved = [...edits]
  ;[moved[from], moved[to]] = [moved[to], moved[from]]
  return moved
}

export function keptOptions (edits: OptionEdit[]): OptionEdit[] {
  return edits.filter((it) => !it.isRemoved && (it.original !== undefined || it.label.trim() !== ''))
}

function isSameList (a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((it, index) => it === b[index])
}

export function optionChanges (edits: OptionEdit[]): OptionChange[] {
  const changes: OptionChange[] = []
  const existing = edits.filter((it) => it.original !== undefined).sort((a, b) => a.id - b.id)
  for (const edit of existing) {
    const label = edit.label.trim()
    if (edit.original !== undefined && !edit.isRemoved && label !== edit.original) changes.push({ rename: edit.original, to: label })
  }
  const added = edits.filter((it) => it.original === undefined && !it.isRemoved && it.label.trim() !== '').map((it) => it.label.trim())
  for (const label of added) changes.push({ add: label })
  for (const edit of existing) {
    if (edit.original === undefined || !edit.isRemoved) continue
    const target = edits.find((it) => it.id === edit.mapToId && !it.isRemoved)
    const removal: { remove: string, mapTo?: string } = { remove: edit.original }
    if (target !== undefined) removal.mapTo = target.label.trim()
    changes.push(removal)
  }
  const coreOrder = [...existing.filter((it) => !it.isRemoved).map((it) => it.label.trim()), ...added]
  const finalOrder = keptOptions(edits).map((it) => it.label.trim())
  if (!isSameList(coreOrder, finalOrder)) changes.push({ reorder: finalOrder })
  return changes
}

function withOptions (kind: FieldKind, options: string[]): FieldKind {
  if (kind.kind === 'select' || kind.kind === 'multiSelect') return { kind: kind.kind, options }
  return kind
}

export function fieldOps (owner: string, field: FieldInfo | undefined, draft: FieldDraft, key: string): Operation[] {
  const name = draft.name.trim()
  if (field === undefined) {
    const kind = withOptions(draft.kind, keptOptions(draft.options).map((it) => it.label.trim()))
    const add: AddFieldOp = { op: 'addField', type: owner, key, name, kind }
    if (draft.isRequired) add.required = true
    return [add]
  }
  const ops: Operation[] = []
  const update: UpdateFieldOp = { op: 'updateField', type: owner, field: field.key }
  if (name !== field.name) update.name = name
  if (draft.isRequired !== field.isRequired) update.required = draft.isRequired
  if (update.name !== undefined || update.required !== undefined) ops.push(update)
  if (hasOptions(draft.kind)) {
    const options = optionChanges(draft.options)
    if (options.length > 0) ops.push({ op: 'setOptions', type: owner, field: field.key, options })
  }
  return ops
}

export function removeFieldOp (owner: string, field: FieldInfo): RemoveFieldOp {
  return { op: 'removeField', type: owner, field: field.key }
}

export function draftIssues (draft: FieldDraft, siblings: FieldInfo[], field: FieldInfo | undefined): string[] {
  const issues: string[] = []
  const name = normalizeName(draft.name)
  if (name === '') issues.push(text('IssueNameEmpty'))
  else if (siblings.some((it) => it.key !== field?.key && normalizeName(it.name) === name)) issues.push(text('IssueNameTaken'))
  if (hasOptions(draft.kind)) {
    const labels = draft.options.filter((it) => !it.isRemoved).map((it) => normalizeName(it.label))
    if (labels.length === 0) issues.push(text('IssueNoOptions'))
    else if (labels.includes('')) issues.push(text('IssueOptionEmpty'))
    else if (new Set(labels).size !== labels.length) issues.push(text('IssueOptionDuplicate'))
  }
  return issues
}

export function parentChain (snapshot: ConfigSnapshot, type: RecordTypeInfo): RecordTypeInfo[] {
  const chain: RecordTypeInfo[] = []
  const seen = new Set([type.key])
  let basedOn = type.basedOn
  while (basedOn !== undefined && !seen.has(basedOn)) {
    const parent = snapshot.types.find((it) => it.key === basedOn)
    if (parent === undefined) break
    seen.add(basedOn)
    chain.push(parent)
    basedOn = parent.basedOn
  }
  return chain
}

export function takenFieldKeys (snapshot: ConfigSnapshot, type: RecordTypeInfo): Set<string> {
  const keys = new Set(type.fields.map((it) => it.key))
  for (const parent of parentChain(snapshot, type)) {
    for (const parentField of parent.fields) keys.add(parentField.key)
  }
  return keys
}

export function fieldsWithInherited (snapshot: ConfigSnapshot, type: RecordTypeInfo): FieldInfo[] {
  const fields = [...type.fields]
  const keys = new Set(fields.map((it) => it.key))
  for (const parent of parentChain(snapshot, type)) {
    for (const parentField of parent.fields) {
      if (!keys.has(parentField.key)) {
        keys.add(parentField.key)
        fields.push(parentField)
      }
    }
  }
  return fields
}

export interface FieldRow {
  rowId: string
  key: string
  name: string
  kind: RowKind
  detail: string
  isRequired: boolean
  isBuiltIn: boolean
  isEditable: boolean
}

function linkRow (key: string, name: string, targetName: string): FieldRow {
  return {
    rowId: `link:${key}`,
    key,
    name,
    kind: 'link',
    detail: text('LinkedField', { name: targetName }),
    isRequired: false,
    isBuiltIn: false,
    isEditable: false
  }
}

export function fieldRows (snapshot: ConfigSnapshot, type: RecordTypeInfo): FieldRow[] {
  const nameOf = (key: string): string => snapshot.types.find((it) => it.key === key)?.name ?? key
  const fields = type.fields.map((field): FieldRow => {
    const { kind } = field
    return {
      rowId: `field:${field.key}`,
      key: field.key,
      name: field.name,
      kind: kind.kind,
      detail: kind.kind === 'reference' ? text('ReferenceField', { name: nameOf(kind.to) }) : kindLabel(kind.kind),
      isRequired: field.isRequired,
      isBuiltIn: field.isBuiltIn,
      isEditable: isEditableKind(kind)
    }
  })
  const links = snapshot.links.flatMap((link): FieldRow[] => {
    if (link.from === type.key) return [linkRow(link.key, link.fromName, nameOf(link.to))]
    if (link.to === type.key) return [linkRow(link.key, link.toName, nameOf(link.from))]
    return []
  })
  return [...fields, ...links]
}
