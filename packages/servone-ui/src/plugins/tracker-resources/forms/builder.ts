import { generateId, type AnyAttribute } from '@hcengineering/core'
import {
  FORM_FIELD_KINDS,
  kindsForAttribute,
  PRIORITY_OPTIONS,
  type AnswerProblem,
  type DefinitionProblem,
  type FieldTarget,
  type FormDefinition,
  type FormField,
  type FormFieldKind
} from '@servone/forms'
import type { StringKey } from '../sprints/strings'

export const KIND_TEXT: Record<FormFieldKind, StringKey> = {
  text: 'KindText',
  longText: 'KindLongText',
  number: 'KindNumber',
  date: 'KindDate',
  email: 'KindEmail',
  select: 'KindSelect'
}

export const TARGET_TEXT: Record<Exclude<FieldTarget['to'], 'attribute'>, StringKey> = {
  title: 'TargetTitle',
  description: 'TargetDescription',
  append: 'TargetAppend',
  priority: 'TargetPriority',
  dueDate: 'TargetDueDate'
}

export const DEFINITION_PROBLEM_TEXT: Record<DefinitionProblem, StringKey> = {
  missing_label: 'ProblemMissingLabel',
  label_too_long: 'ProblemLabelTooLong',
  help_too_long: 'ProblemHelpTooLong',
  missing_options: 'ProblemMissingOptions',
  too_many_options: 'ProblemInvalidOption',
  invalid_option: 'ProblemInvalidOption',
  duplicate_target: 'ProblemDuplicateTarget',
  too_many_fields: 'ProblemTooManyFields',
  invalid_json: 'ProblemOther',
  invalid_shape: 'ProblemOther',
  unknown_version: 'ProblemOther',
  invalid_id: 'ProblemOther',
  duplicate_id: 'ProblemOther',
  target_mismatch: 'ProblemOther'
}

export const ANSWER_PROBLEM_TEXT: Record<Exclude<AnswerProblem, 'required'>, StringKey> = {
  too_long: 'AnswerTooLong',
  invalid_number: 'AnswerInvalidNumber',
  invalid_date: 'AnswerInvalidDate',
  invalid_email: 'AnswerInvalidEmail',
  invalid_option: 'AnswerInvalidOption'
}

export function missingRequired (
  definition: FormDefinition,
  problems: ReadonlyMap<string, AnswerProblem>,
  language: string
): string | undefined {
  const labels = definition.fields.filter((field) => problems.get(field.id) === 'required').map((field) => field.label)
  return labels.length === 0 ? undefined : new Intl.ListFormat(language, { type: 'conjunction' }).format(labels)
}

export function newField (): FormField {
  return { id: generateId(), label: '', isRequired: false, kind: 'text', target: { to: 'append' } }
}

export function kindsForTarget (target: FieldTarget, attributes: AnyAttribute[]): readonly FormFieldKind[] {
  switch (target.to) {
    case 'title':
      return ['text']
    case 'description':
      return ['text', 'longText']
    case 'priority':
      return ['select']
    case 'dueDate':
      return ['date']
    case 'append':
      return FORM_FIELD_KINDS
    case 'attribute': {
      const attribute = attributes.find((candidate) => candidate.name === target.key)
      return attribute === undefined ? FORM_FIELD_KINDS : kindsForAttribute(attribute)
    }
  }
}

export function targetValue (target: FieldTarget): string {
  return target.to === 'attribute' ? `attribute:${target.key}` : target.to
}

export function parseTargetValue (value: string): FieldTarget {
  if (value.startsWith('attribute:')) return { to: 'attribute', key: value.slice('attribute:'.length) }
  switch (value) {
    case 'title':
    case 'description':
    case 'priority':
    case 'dueDate':
      return { to: value }
    default:
      return { to: 'append' }
  }
}

export function targetsForKind (kind: FormFieldKind, targets: FieldTarget[], attributes: AnyAttribute[]): FieldTarget[] {
  return targets.filter((target) => kindsForTarget(target, attributes).includes(kind))
}

export function rekind (field: FormField, kind: FormFieldKind, attributes: AnyAttribute[]): FormField {
  const fits = kindsForTarget(field.target, attributes).includes(kind)
  return withKind(fits ? field : { ...field, target: { to: 'append' } }, kind)
}

export function withKind (field: FormField, kind: FormFieldKind): FormField {
  const { options, ...rest } = field
  return kind === 'select' ? { ...rest, kind, options: options ?? [] } : { ...rest, kind }
}

export function withTarget (field: FormField, target: FieldTarget, attributes: AnyAttribute[]): FormField {
  const kinds = kindsForTarget(target, attributes)
  const kind = kinds.includes(field.kind) ? field.kind : kinds[0]
  const retyped = withKind({ ...field, target }, kind)
  return target.to === 'priority' ? { ...retyped, options: [...PRIORITY_OPTIONS] } : retyped
}

export function optionsFromText (text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

export function moveField (fields: FormField[], index: number, offset: -1 | 1): FormField[] {
  const target = index + offset
  if (target < 0 || target >= fields.length) return fields
  const moved = [...fields]
  ;[moved[index], moved[target]] = [moved[target], moved[index]]
  return moved
}
