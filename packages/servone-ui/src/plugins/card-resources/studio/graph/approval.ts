import type { AccessPreset, AutomationTrigger, ConfigSnapshot, PersonTarget, RecordTypeInfo } from '@servone/config'
import { accessRows, presetLabel, PRESETS } from '../access'
import { defaultTrigger, fieldsFor, linkedPeople, TRIGGER_KINDS, type RuleDraft } from '../automation'
import { text } from '../strings'
import { triggerPhrase } from './phrases'

export type ApproverGroup = 'question' | 'linked' | 'role' | 'people'
export const APPROVER_GROUPS: ApproverGroup[] = ['question', 'linked', 'role', 'people']

export interface ApproverChoice {
  id: string
  group: ApproverGroup
  label: string
  hint: string
  target: PersonTarget
}

export interface TriggerChoice {
  id: string
  label: string
  trigger: AutomationTrigger
}

export function choiceIdOf (target: PersonTarget): string {
  switch (target.kind) {
    case 'field':
      return `field:${target.field}`
    case 'linked':
      return `linked:${target.link}:${target.field}`
    case 'preset':
      return `preset:${target.preset}`
    case 'people':
      return 'people'
    case 'initiator':
      return 'initiator'
  }
}

function choiceOf (group: ApproverGroup, label: string, hint: string, target: PersonTarget): ApproverChoice {
  return { id: choiceIdOf(target), group, label, hint, target }
}

function presetCount (snapshot: ConfigSnapshot, type: RecordTypeInfo, preset: AccessPreset): number {
  return new Set(accessRows(snapshot, type).flatMap((row) => row[preset])).size
}

export function approverChoices (snapshot: ConfigSnapshot, type: RecordTypeInfo): ApproverChoice[] {
  const questions = fieldsFor(snapshot, type, 'person').map((field) =>
    choiceOf('question', field.name, text('ApproverHintQuestion'), { kind: 'field', field: field.key })
  )
  const linked = linkedPeople(snapshot, type).map((person) =>
    choiceOf('linked', person.label, person.form, { kind: 'linked', link: person.link, field: person.field })
  )
  const roles = PRESETS.map((preset) =>
    choiceOf('role', presetLabel(preset), text('ApproverHintPeople', { count: presetCount(snapshot, type, preset) }), { kind: 'preset', preset })
  )
  return [...questions, ...linked, ...roles, choiceOf('people', text('ApproverPickPeople'), '', { kind: 'people', people: [] })]
}

export function approverGroupLabel (group: ApproverGroup, type: RecordTypeInfo): string {
  switch (group) {
    case 'question':
      return text('ApproverFromQuestion', { form: type.name.toLocaleLowerCase('vi') })
    case 'linked':
      return text('ApproverFromLinked')
    case 'role':
      return text('ApproverFromRole')
    case 'people':
      return text('ApproverFromPeople')
  }
}

export function approverOf (draft: RuleDraft): PersonTarget | undefined {
  const last = draft.actions.at(-1)
  return last?.kind === 'requestApproval' ? last.from : undefined
}

export function withApproverChoice (draft: RuleDraft, target: PersonTarget): RuleDraft {
  const last = draft.actions.at(-1)
  if (last?.kind !== 'requestApproval') return draft
  return { ...draft, actions: [...draft.actions.slice(0, -1), { ...last, from: target }] }
}

export function triggerChoices (snapshot: ConfigSnapshot, type: RecordTypeInfo): TriggerChoice[] {
  return TRIGGER_KINDS.flatMap((kind) => {
    const trigger = defaultTrigger(kind, snapshot, type)
    return trigger === undefined ? [] : [{ id: kind, label: triggerPhrase(snapshot, type, trigger), trigger }]
  })
}
