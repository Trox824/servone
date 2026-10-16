import type { FieldInfo } from '@servone/config'
import type { FieldDraft, KindId } from '../fields'
import { text, type StringKey } from '../strings'
import { questionKindLabel } from './phrases'

export type QuestionKind = Exclude<KindId, 'money'>
export const QUESTION_KINDS: QuestionKind[] = ['text', 'longText', 'number', 'person', 'date', 'boolean', 'select', 'multiSelect', 'autoNumber']

const HINT_KEY: Record<QuestionKind, StringKey> = {
  text: 'HintText',
  longText: 'HintLongText',
  number: 'HintNumber',
  person: 'HintPerson',
  date: 'HintDate',
  boolean: 'HintBoolean',
  select: 'HintSelect',
  multiSelect: 'HintMultiSelect',
  autoNumber: 'HintAutoNumber'
}
const NEW_ROW_KEY = ''

export interface PreviewRow {
  key: string
  name: string
  kindLabel: string
  isRequired: boolean
  isEdited: boolean
}

export function kindHint (kind: QuestionKind): string {
  return text(HINT_KEY[kind])
}

export function previewRows (siblings: FieldInfo[], field: FieldInfo | undefined, draft: FieldDraft): PreviewRow[] {
  const name = draft.name.trim()
  const edited: PreviewRow = {
    key: field?.key ?? NEW_ROW_KEY,
    name: name === '' ? text('QuestionUntitled') : name,
    kindLabel: questionKindLabel(draft.kind.kind),
    isRequired: draft.isRequired,
    isEdited: true
  }
  const rows = siblings.map((sibling): PreviewRow =>
    sibling.key === field?.key
      ? edited
      : { key: sibling.key, name: sibling.name, kindLabel: questionKindLabel(sibling.kind.kind), isRequired: sibling.isRequired, isEdited: false }
  )
  return field === undefined ? [...rows, edited] : rows
}

export function questionNodeId (typeKey: string, owner: string, fieldKey: string): string {
  return owner === typeKey ? `q:${fieldKey}` : `gq:${owner}:${fieldKey}`
}
