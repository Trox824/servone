// A tracker form: questions on an issue template whose answers fill a new issue. Stored as JSON in the
// template's `servoneForm` attribute (packages/servone-ui .../forms/template.ts) and read by services/servone.
import { IssuePriority } from '@hcengineering/tracker'

export const FORM_VERSION = 1
export const MAX_FIELDS = 30
export const MAX_LABEL_LENGTH = 120
export const MAX_HELP_LENGTH = 300
export const MAX_OPTIONS = 200
export const MAX_OPTION_LENGTH = 120
const FIELD_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

export const FORM_FIELD_KINDS = ['text', 'longText', 'number', 'date', 'email', 'select'] as const
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number]

export const TARGETS = ['title', 'description', 'append', 'priority', 'dueDate', 'attribute'] as const
export type TargetName = (typeof TARGETS)[number]

export type FieldTarget =
  | { to: 'title' }
  | { to: 'description' }
  | { to: 'append' }
  | { to: 'priority' }
  | { to: 'dueDate' }
  | { to: 'attribute', key: string }

export interface FormField {
  id: string
  label: string
  help?: string
  isRequired: boolean
  kind: FormFieldKind
  options?: string[]
  target: FieldTarget
}

export interface FormDefinition {
  version: typeof FORM_VERSION
  fields: FormField[]
}

// A priority field offers exactly these options; the public page has no i18n, so they stay English.
export const PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low'] as const
export const PRIORITY_BY_OPTION: Record<(typeof PRIORITY_OPTIONS)[number], IssuePriority> = {
  Urgent: IssuePriority.Urgent,
  High: IssuePriority.High,
  Medium: IssuePriority.Medium,
  Low: IssuePriority.Low
}

export type DefinitionProblem =
  | 'invalid_json'
  | 'invalid_shape'
  | 'unknown_version'
  | 'too_many_fields'
  | 'invalid_id'
  | 'duplicate_id'
  | 'missing_label'
  | 'label_too_long'
  | 'help_too_long'
  | 'missing_options'
  | 'too_many_options'
  | 'invalid_option'
  | 'target_mismatch'
  | 'duplicate_target'

export interface DefinitionIssue {
  problem: DefinitionProblem
  // Index into `fields`; absent for problems with the whole form.
  field?: number
}

export type ParsedDefinition = { isValid: true, definition: FormDefinition } | { isValid: false, issue: DefinitionIssue }

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = Record<string, Json>

export function isObject (json: Json | undefined): json is JsonObject {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

export function isKind (candidate: string): candidate is FormFieldKind {
  return FORM_FIELD_KINDS.some((kind) => kind === candidate)
}

export function isTargetName (candidate: string): candidate is TargetName {
  return TARGETS.some((target) => target === candidate)
}

function readTarget (json: Json | undefined): FieldTarget | undefined {
  if (!isObject(json) || typeof json.to !== 'string' || !isTargetName(json.to)) return undefined
  if (json.to !== 'attribute') return { to: json.to }
  return typeof json.key === 'string' && json.key !== '' ? { to: 'attribute', key: json.key } : undefined
}

function readField (json: Json): FormField | undefined {
  if (!isObject(json)) return undefined
  const { id, label, help, isRequired, kind, options } = json
  const target = readTarget(json.target)
  if (typeof id !== 'string' || typeof label !== 'string' || typeof isRequired !== 'boolean') return undefined
  if (typeof kind !== 'string' || !isKind(kind) || target === undefined) return undefined
  if (help !== undefined && typeof help !== 'string') return undefined
  const field: FormField = { id, label, isRequired, kind, target }
  if (help !== undefined) field.help = help
  if (options !== undefined) {
    if (!Array.isArray(options)) return undefined
    const texts = options.filter((option): option is string => typeof option === 'string')
    if (texts.length !== options.length) return undefined
    field.options = texts
  }
  return field
}

export function targetFits (kind: FormFieldKind, target: FieldTarget): boolean {
  switch (target.to) {
    case 'title':
      return kind === 'text'
    case 'description':
      return kind === 'text' || kind === 'longText'
    case 'priority':
      return kind === 'select'
    case 'dueDate':
      return kind === 'date'
    case 'append':
    case 'attribute':
      return true
  }
}

function targetKey (target: FieldTarget): string | undefined {
  if (target.to === 'append') return undefined
  return target.to === 'attribute' ? `attribute:${target.key}` : target.to
}

function optionsProblem (field: FormField): DefinitionProblem | undefined {
  if (field.kind !== 'select') return field.options === undefined ? undefined : 'invalid_option'
  const options = field.options ?? []
  if (options.length === 0) return 'missing_options'
  if (options.length > MAX_OPTIONS) return 'too_many_options'
  const trimmed = options.map((option) => option.trim())
  if (trimmed.some((option, i) => option === '' || option !== options[i] || option.length > MAX_OPTION_LENGTH)) {
    return 'invalid_option'
  }
  if (new Set(trimmed).size !== trimmed.length) return 'invalid_option'
  if (field.target.to === 'priority') {
    const isPriorityList = options.length === PRIORITY_OPTIONS.length && PRIORITY_OPTIONS.every((p, i) => options[i] === p)
    if (!isPriorityList) return 'invalid_option'
  }
  return undefined
}

function fieldProblem (field: FormField): DefinitionProblem | undefined {
  if (!FIELD_ID_PATTERN.test(field.id)) return 'invalid_id'
  const label = field.label.trim()
  if (label === '') return 'missing_label'
  if (label.length > MAX_LABEL_LENGTH) return 'label_too_long'
  if ((field.help ?? '').length > MAX_HELP_LENGTH) return 'help_too_long'
  if (!targetFits(field.kind, field.target)) return 'target_mismatch'
  return optionsProblem(field)
}

export function checkFormDefinition (definition: FormDefinition): DefinitionIssue | undefined {
  if (definition.fields.length > MAX_FIELDS) return { problem: 'too_many_fields' }
  const ids = new Set<string>()
  const targets = new Set<string>()
  for (const [index, field] of definition.fields.entries()) {
    const problem = fieldProblem(field)
    if (problem !== undefined) return { problem, field: index }
    if (ids.has(field.id)) return { problem: 'duplicate_id', field: index }
    ids.add(field.id)
    const key = targetKey(field.target)
    if (key !== undefined) {
      if (targets.has(key)) return { problem: 'duplicate_target', field: index }
      targets.add(key)
    }
  }
  return undefined
}

export function parseFormDefinition (text: string): ParsedDefinition {
  let json: Json
  try {
    json = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return { isValid: false, issue: { problem: 'invalid_json' } }
    throw error
  }
  if (!isObject(json) || !Array.isArray(json.fields)) return { isValid: false, issue: { problem: 'invalid_shape' } }
  if (json.version !== FORM_VERSION) return { isValid: false, issue: { problem: 'unknown_version' } }
  const fields: FormField[] = []
  for (const [index, entry] of json.fields.entries()) {
    const field = readField(entry)
    if (field === undefined) return { isValid: false, issue: { problem: 'invalid_shape', field: index } }
    fields.push(field)
  }
  const definition: FormDefinition = { version: FORM_VERSION, fields }
  const issue = checkFormDefinition(definition)
  return issue === undefined ? { isValid: true, definition } : { isValid: false, issue }
}

export function serializeFormDefinition (definition: FormDefinition): string {
  return JSON.stringify(definition)
}
