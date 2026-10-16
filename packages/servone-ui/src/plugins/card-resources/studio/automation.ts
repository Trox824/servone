import type { AccountUuid } from '@hcengineering/core'
import type {
  AccessPreset,
  AutomationAction,
  AutomationInfo,
  AutomationSpec,
  AutomationTrigger,
  ConfigSnapshot,
  FieldInfo,
  FieldKindInfo,
  FieldValue,
  PersonTarget,
  RecordTypeInfo,
  SetAutomationOp
} from '@servone/config'
import { PRESETS } from './access'
import { fieldsWithInherited } from './fields'
import { text, type StringKey } from './strings'
import { normalizeName } from './type-list'

export type TriggerKind = AutomationTrigger['kind']
export type ActionKind = AutomationAction['kind']
export type TargetKind = PersonTarget['kind']
export type FieldUse = 'change' | 'date' | 'set' | 'person' | 'lock'

export const TRIGGER_KINDS: TriggerKind[] = ['created', 'fieldChanged', 'date']
export const ACTION_KINDS: ActionKind[] = ['requestApproval', 'setField', 'createLinked', 'createTodo', 'lockField', 'lockRecord']
const TARGET_KINDS: TargetKind[] = ['field', 'linked', 'initiator', 'people', 'preset']
const WAITING_KINDS: ActionKind[] = ['requestApproval', 'createTodo']

const USE_KINDS: Record<Exclude<FieldUse, 'lock'>, Array<FieldKindInfo['kind']>> = {
  change: ['select', 'boolean'],
  date: ['date'],
  set: ['text', 'number', 'money', 'boolean', 'select', 'person'],
  person: ['person']
}

const TRIGGER_KEY: Record<TriggerKind, StringKey> = {
  created: 'TriggerCreated',
  fieldChanged: 'TriggerFieldChanged',
  date: 'TriggerDate'
}

const ACTION_KEY: Record<ActionKind, StringKey> = {
  requestApproval: 'ActionRequestApproval',
  setField: 'ActionSetField',
  createLinked: 'ActionCreateLinked',
  createTodo: 'ActionCreateTodo',
  lockField: 'ActionLockField',
  lockRecord: 'ActionLockRecord'
}

const TARGET_KEY: Record<TargetKind, StringKey> = {
  field: 'TargetField',
  linked: 'TargetLinked',
  initiator: 'TargetInitiator',
  people: 'TargetPeople',
  preset: 'TargetPreset'
}

export function triggerLabel (kind: TriggerKind): string {
  return text(TRIGGER_KEY[kind])
}

export function actionLabel (kind: ActionKind): string {
  return text(ACTION_KEY[kind])
}

export function targetLabel (kind: TargetKind): string {
  return text(TARGET_KEY[kind])
}

export function isTriggerKind (raw: string): raw is TriggerKind {
  return TRIGGER_KINDS.some((it) => it === raw)
}

export function isActionKind (raw: string): raw is ActionKind {
  return ACTION_KINDS.some((it) => it === raw)
}

export function isTargetKind (raw: string): raw is TargetKind {
  return TARGET_KINDS.some((it) => it === raw)
}

export function isPreset (raw: string): raw is AccessPreset {
  return PRESETS.some((it) => it === raw)
}

export interface RuleRow {
  key: string
  name: string
  sentences: string[]
  isEditable: boolean
}

function plain (sentence: string): string {
  return sentence.replace(/\*/g, '')
}

export function ruleRows (type: RecordTypeInfo): RuleRow[] {
  return type.automations.map((it) => ({
    key: it.key,
    name: it.name,
    sentences: it.sentences.map(plain),
    isEditable: it.automation !== null
  }))
}

export interface RuleDraft {
  key: string | undefined
  name: string
  trigger: AutomationTrigger
  actions: AutomationAction[]
  onApproved: AutomationAction[]
  onRejected: AutomationAction[]
}

export function newRuleDraft (): RuleDraft {
  return { key: undefined, name: '', trigger: { kind: 'created' }, actions: [], onApproved: [], onRejected: [] }
}

export function draftOf (rule: AutomationInfo): RuleDraft | undefined {
  if (rule.automation === null) return undefined
  return {
    key: rule.key,
    name: rule.automation.name,
    trigger: rule.automation.trigger,
    actions: rule.automation.actions,
    onApproved: rule.automation.onApproved ?? [],
    onRejected: rule.automation.onRejected ?? []
  }
}

export function fieldsFor (snapshot: ConfigSnapshot, type: RecordTypeInfo, use: FieldUse): FieldInfo[] {
  const fields = fieldsWithInherited(snapshot, type)
  if (use === 'lock') return fields
  const kinds = USE_KINDS[use]
  return fields.filter((it) => kinds.includes(it.kind.kind))
}

export function fieldByKey (fields: FieldInfo[], key: string): FieldInfo | undefined {
  return fields.find((it) => it.key === key)
}

export function moneyFieldLookup (snapshot: ConfigSnapshot): (typeKey: string, fieldKey: string) => boolean {
  return (typeKey, fieldKey) => {
    const owner = snapshot.types.find((it) => it.key === typeKey)
    if (owner === undefined) return false
    return fieldByKey(fieldsWithInherited(snapshot, owner), fieldKey)?.kind.kind === 'money'
  }
}

export function defaultValue (field: FieldInfo): FieldValue {
  switch (field.kind.kind) {
    case 'select':
      return field.kind.options[0] ?? null
    case 'boolean':
      return true
    case 'number':
    case 'money':
      return 0
    case 'person':
      return null
    default:
      return ''
  }
}

export function defaultTrigger (kind: TriggerKind, snapshot: ConfigSnapshot, type: RecordTypeInfo): AutomationTrigger | undefined {
  if (kind === 'created') return { kind: 'created' }
  const field = fieldsFor(snapshot, type, kind === 'date' ? 'date' : 'change')[0]
  if (field === undefined) return undefined
  return kind === 'date'
    ? { kind: 'date', field: field.key, offsetDays: 0 }
    : { kind: 'fieldChanged', field: field.key, to: defaultValue(field) }
}

export function triggerFieldOf (snapshot: ConfigSnapshot, type: RecordTypeInfo, trigger: AutomationTrigger): FieldInfo | undefined {
  return trigger.kind === 'created' ? undefined : fieldByKey(fieldsWithInherited(snapshot, type), trigger.field)
}

export function withTriggerField (trigger: AutomationTrigger, field: FieldInfo): AutomationTrigger {
  if (trigger.kind === 'fieldChanged') return { kind: 'fieldChanged', field: field.key, to: defaultValue(field) }
  if (trigger.kind === 'date') return { kind: 'date', field: field.key, offsetDays: trigger.offsetDays }
  return trigger
}

export function withTriggerValue (trigger: AutomationTrigger, to: FieldValue): AutomationTrigger {
  return trigger.kind === 'fieldChanged' ? { ...trigger, to } : trigger
}

export interface OffsetParts {
  days: number
  isBefore: boolean
}

export function offsetParts (trigger: AutomationTrigger): OffsetParts | undefined {
  if (trigger.kind !== 'date') return undefined
  return { days: Math.abs(trigger.offsetDays), isBefore: trigger.offsetDays < 0 }
}

export function wholeDays (days: number): number {
  return Number.isFinite(days) ? Math.abs(Math.trunc(days)) : 0
}

export function withOffset (trigger: AutomationTrigger, days: number, isBefore: boolean): AutomationTrigger {
  if (trigger.kind !== 'date') return trigger
  const whole = wholeDays(days)
  return { ...trigger, offsetDays: isBefore ? -whole : whole }
}

export interface LinkTarget {
  link: string
  type: string
  name: string
  label: string
}

export function linkTargets (snapshot: ConfigSnapshot, type: RecordTypeInfo): LinkTarget[] {
  const targets: LinkTarget[] = []
  for (const link of snapshot.links) {
    const isFrom = link.from === type.key
    if (!isFrom && link.to !== type.key) continue
    const otherKey = isFrom ? link.to : link.from
    const other = snapshot.types.find((it) => it.key === otherKey && !it.isArchived)
    if (other === undefined) continue
    const fieldName = isFrom ? link.fromName : link.toName
    targets.push({ link: link.key, type: other.key, name: other.name, label: `${other.name} (${fieldName})` })
  }
  return targets
}

export interface LinkedPerson {
  id: string
  link: string
  field: string
  form: string
  label: string
}

export function linkedPeople (snapshot: ConfigSnapshot, type: RecordTypeInfo): LinkedPerson[] {
  return linkTargets(snapshot, type).flatMap((target) => {
    const other = snapshot.types.find((it) => it.key === target.type)
    if (other === undefined) return []
    return fieldsFor(snapshot, other, 'person').map((field) => ({
      id: `${target.link}:${field.key}`,
      link: target.link,
      field: field.key,
      form: other.name,
      label: text('LinkedPerson', { field: field.name, form: other.name.toLocaleLowerCase('vi') })
    }))
  })
}

export function targetFieldsOf (snapshot: ConfigSnapshot, typeKey: string): FieldInfo[] {
  const target = snapshot.types.find((it) => it.key === typeKey)
  return target !== undefined ? fieldsFor(snapshot, target, 'set') : []
}

export function withSetField (field: FieldInfo): AutomationAction {
  return { kind: 'setField', field: field.key, value: defaultValue(field) }
}

export function withLinkTarget (target: LinkTarget): AutomationAction {
  return { kind: 'createLinked', type: target.type, link: target.link, title: target.name, values: [] }
}

export function defaultAction (kind: ActionKind, snapshot: ConfigSnapshot, type: RecordTypeInfo): AutomationAction | undefined {
  switch (kind) {
    case 'requestApproval':
      return { kind, from: { kind: 'people', people: [] } }
    case 'setField': {
      const field = fieldsFor(snapshot, type, 'set')[0]
      return field !== undefined ? withSetField(field) : undefined
    }
    case 'createLinked': {
      const target = linkTargets(snapshot, type)[0]
      return target !== undefined ? withLinkTarget(target) : undefined
    }
    case 'createTodo':
      return { kind, title: '', assignee: { kind: 'people', people: [] } }
    case 'lockField':
      return fieldsWithInherited(snapshot, type).length > 0 ? { kind, fields: [] } : undefined
    case 'lockRecord':
      return { kind }
  }
}

function isWaiting (action: AutomationAction): boolean {
  return WAITING_KINDS.includes(action.kind)
}

export function endsWithApproval (actions: AutomationAction[]): boolean {
  return actions.at(-1)?.kind === 'requestApproval'
}

export function actionChoices (actions: AutomationAction[], isBranch: boolean): ActionKind[] {
  const hasWaiting = actions.some(isWaiting)
  return ACTION_KINDS.filter((kind) => {
    if (kind === 'requestApproval' && isBranch) return false
    return !(hasWaiting && WAITING_KINDS.includes(kind))
  })
}

export function withAction (actions: AutomationAction[], action: AutomationAction): AutomationAction[] {
  const last = actions.at(-1)
  if (last !== undefined && isWaiting(last) && !isWaiting(action)) return [...actions.slice(0, -1), action, last]
  return [...actions, action]
}

export function replaceAt (actions: AutomationAction[], index: number, action: AutomationAction): AutomationAction[] {
  return actions.map((it, at) => (at === index ? action : it))
}

export function removeAt (actions: AutomationAction[], index: number): AutomationAction[] {
  return actions.filter((_, at) => at !== index)
}

export function withActions (draft: RuleDraft, actions: AutomationAction[]): RuleDraft {
  if (endsWithApproval(actions)) return { ...draft, actions }
  return { ...draft, actions, onApproved: [], onRejected: [] }
}

export function targetOf (action: AutomationAction): PersonTarget | undefined {
  if (action.kind === 'requestApproval') return action.from
  if (action.kind === 'createTodo') return action.assignee
  return undefined
}

export function withTarget (action: AutomationAction, target: PersonTarget): AutomationAction {
  if (action.kind === 'requestApproval') return { ...action, from: target }
  if (action.kind === 'createTodo') return { ...action, assignee: target }
  return action
}

export function targetChoices (action: AutomationAction, snapshot: ConfigSnapshot, type: RecordTypeInfo): TargetKind[] {
  const choices: TargetKind[] = []
  if (fieldsFor(snapshot, type, 'person').length > 0) choices.push('field')
  if (linkedPeople(snapshot, type).length > 0) choices.push('linked')
  if (action.kind === 'createTodo') choices.push('initiator')
  choices.push('people')
  if (action.kind === 'requestApproval') choices.push('preset')
  return choices
}

export function defaultTarget (kind: TargetKind, snapshot: ConfigSnapshot, type: RecordTypeInfo): PersonTarget {
  const person = fieldsFor(snapshot, type, 'person')[0]
  const linked = linkedPeople(snapshot, type)[0]
  if (kind === 'field' && person !== undefined) return { kind: 'field', field: person.key }
  if (kind === 'linked' && linked !== undefined) return { kind: 'linked', link: linked.link, field: linked.field }
  if (kind === 'initiator') return { kind: 'initiator' }
  if (kind === 'preset') return { kind: 'preset', preset: 'manager' }
  return { kind: 'people', people: [] }
}

export function withPeople (people: AccountUuid[], isSingle: boolean): PersonTarget {
  return { kind: 'people', people: isSingle ? people.slice(-1) : people }
}

export function withTitle (action: AutomationAction, title: string): AutomationAction {
  if (action.kind === 'createTodo' || action.kind === 'createLinked') return { ...action, title }
  return action
}

export function withValue (action: AutomationAction, fieldValue: FieldValue): AutomationAction {
  return action.kind === 'setField' ? { ...action, value: fieldValue } : action
}

export function withNewValue (action: AutomationAction, field: FieldInfo): AutomationAction {
  if (action.kind !== 'createLinked') return action
  return { ...action, values: [...action.values, { field: field.key, value: defaultValue(field) }] }
}

export function withValueAt (action: AutomationAction, index: number, fieldValue: FieldValue): AutomationAction {
  if (action.kind !== 'createLinked') return action
  return { ...action, values: action.values.map((it, at) => (at === index ? { ...it, value: fieldValue } : it)) }
}

export function withoutValueAt (action: AutomationAction, index: number): AutomationAction {
  if (action.kind !== 'createLinked') return action
  return { ...action, values: action.values.filter((_, at) => at !== index) }
}

export function toggleLock (action: AutomationAction, key: string, isOn: boolean): AutomationAction {
  if (action.kind !== 'lockField') return action
  const fields = action.fields.filter((it) => it !== key)
  return { ...action, fields: isOn ? [...fields, key] : fields }
}

export function numberValue (raw: string): FieldValue {
  const parsed = Number(raw)
  return raw.trim() === '' || !Number.isFinite(parsed) ? null : parsed
}

function toAccount (raw: string): AccountUuid {
  return raw as AccountUuid
}

export function accountValue (fieldValue: FieldValue): AccountUuid[] {
  return typeof fieldValue === 'string' && fieldValue !== '' ? [toAccount(fieldValue)] : []
}

function hasNoPeople (action: AutomationAction): boolean {
  const target = targetOf(action)
  return target?.kind === 'people' && target.people.length === 0
}

export function draftIssues (draft: RuleDraft, siblings: RuleRow[]): StringKey[] {
  const issues: StringKey[] = []
  const name = draft.name.trim()
  if (name === '') issues.push('IssueRuleName')
  else if (siblings.some((it) => it.key !== draft.key && normalizeName(it.name) === normalizeName(name))) issues.push('IssueRuleNameTaken')
  if (draft.actions.length === 0) issues.push('IssueNoActions')
  const all = [...draft.actions, ...draft.onApproved, ...draft.onRejected]
  if (all.some(hasNoPeople)) issues.push('IssueNoPeople')
  if (all.some((it) => it.kind === 'createTodo' && it.title.trim() === '')) issues.push('IssueTodoTitle')
  if (all.some((it) => it.kind === 'lockField' && it.fields.length === 0)) issues.push('IssueNoLockFields')
  return issues
}

export function ruleSpec (draft: RuleDraft): AutomationSpec {
  const spec: AutomationSpec = { name: draft.name.trim(), trigger: draft.trigger, actions: draft.actions }
  const hasApproval = endsWithApproval(draft.actions)
  if (hasApproval && draft.onApproved.length > 0) spec.onApproved = draft.onApproved
  if (hasApproval && draft.onRejected.length > 0) spec.onRejected = draft.onRejected
  return spec
}

export function ruleOp (typeKey: string, key: string, draft: RuleDraft): SetAutomationOp {
  return { op: 'setAutomation', type: typeKey, key, automation: ruleSpec(draft) }
}
