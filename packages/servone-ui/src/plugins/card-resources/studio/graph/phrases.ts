import type {
  AutomationAction,
  AutomationTrigger,
  ConfigSnapshot,
  FieldInfo,
  FieldValue,
  PersonTarget,
  RecordTypeInfo
} from '@servone/config'
import { presetLabel } from '../access'
import { linkedPeople } from '../automation'
import { fieldsWithInherited, type RowKind } from '../fields'
import { text, type StringKey } from '../strings'

const QUESTION_KIND: Record<RowKind, StringKey> = {
  text: 'AnswerText',
  longText: 'AnswerLongText',
  number: 'AnswerNumber',
  money: 'AnswerNumber',
  person: 'AnswerPerson',
  date: 'AnswerDate',
  boolean: 'AnswerBoolean',
  select: 'AnswerSelect',
  multiSelect: 'AnswerMultiSelect',
  autoNumber: 'AnswerAutoNumber',
  reference: 'AnswerReference',
  other: 'AnswerOther',
  link: 'AnswerLink'
}

export function questionKindLabel (kind: RowKind): string {
  return text(QUESTION_KIND[kind])
}

function fieldOf (snapshot: ConfigSnapshot, type: RecordTypeInfo, key: string): FieldInfo | undefined {
  return fieldsWithInherited(snapshot, type).find((it) => it.key === key)
}

function fieldName (snapshot: ConfigSnapshot, type: RecordTypeInfo, key: string): string {
  return fieldOf(snapshot, type, key)?.name ?? key
}

export function valuePhrase (field: FieldInfo | undefined, fieldValue: FieldValue): string {
  if (fieldValue === null) return text('PhraseEmpty')
  if (typeof fieldValue === 'boolean') return text(fieldValue ? 'PhraseYes' : 'PhraseNo')
  if (field?.kind.kind === 'person') return text('PhrasePicked')
  return typeof fieldValue === 'number' ? String(fieldValue) : `"${fieldValue}"`
}

export function approverPhrase (snapshot: ConfigSnapshot, type: RecordTypeInfo, target: PersonTarget): string {
  switch (target.kind) {
    case 'field':
      return fieldName(snapshot, type, target.field)
    case 'people':
      return text('PhrasePeople', { count: target.people.length })
    case 'preset':
      return presetLabel(target.preset)
    case 'linked':
      return linkedPeople(snapshot, type).find((it) => it.link === target.link && it.field === target.field)?.label ?? target.field
    case 'initiator':
      return text('PhraseInitiator')
  }
}

export function triggerPhrase (snapshot: ConfigSnapshot, type: RecordTypeInfo, trigger: AutomationTrigger): string {
  switch (trigger.kind) {
    case 'created':
      return text('PhraseCreated', { name: type.name })
    case 'fieldChanged': {
      const field = fieldOf(snapshot, type, trigger.field)
      return text('PhraseChanged', { field: field?.name ?? trigger.field, value: valuePhrase(field, trigger.to) })
    }
    case 'date': {
      const field = fieldName(snapshot, type, trigger.field)
      if (trigger.offsetDays === 0) return text('PhraseOnDate', { field })
      const days = Math.abs(trigger.offsetDays)
      return text(trigger.offsetDays < 0 ? 'PhraseDaysBefore' : 'PhraseDaysAfter', { days, field })
    }
  }
}

export function actionPhrase (snapshot: ConfigSnapshot, type: RecordTypeInfo, action: AutomationAction): string {
  switch (action.kind) {
    case 'requestApproval':
      return text('PhraseApproval', { who: approverPhrase(snapshot, type, action.from) })
    case 'setField': {
      const field = fieldOf(snapshot, type, action.field)
      const name = field?.name ?? action.field
      if (action.value === null) return text('PhraseClear', { field: name })
      return text('PhraseSet', { field: name, value: valuePhrase(field, action.value) })
    }
    case 'createLinked': {
      const target = snapshot.types.find((it) => it.key === action.type)?.name ?? action.type
      return text('PhraseCreate', { target, title: action.title.trim() })
    }
    case 'createTodo':
      return text('PhraseTodo', { title: action.title.trim(), who: approverPhrase(snapshot, type, action.assignee) })
    case 'lockField':
      return text('PhraseLockFields', { fields: action.fields.map((key) => fieldName(snapshot, type, key)).join(', ') })
    case 'lockRecord':
      return text('PhraseLockRecord', { name: type.name })
  }
}

export function landingState (trigger: AutomationTrigger, actions: AutomationAction[]): string {
  const last = actions.at(-1)
  if (last?.kind === 'requestApproval') return text('StateReview')
  if (last?.kind === 'createTodo') return text('StateTodo')
  return text(trigger.kind === 'fieldChanged' ? 'StateWaitChange' : 'StateDone')
}

export function waitingState (trigger: AutomationTrigger): string | undefined {
  if (trigger.kind === 'created') return undefined
  return text(trigger.kind === 'date' ? 'StateWaitDate' : 'StateWaitChange')
}
