import { isJsonObject, JsonReader, parseJsonText } from './json'
import { toAccountUuid } from './keys'
import { ACCESS_PRESETS } from './servone-fields'
import type {
  AutomationAction,
  AutomationSpec,
  AutomationTrigger,
  FieldAssignment,
  PersonTarget,
  SetAutomationOp
} from './operations'

function parseTarget (input: JsonReader): PersonTarget {
  const kind = input.string('kind')
  if (kind === 'field') return { kind: 'field', field: input.string('field') }
  if (kind === 'people') return { kind: 'people', people: input.stringArray('people').map(toAccountUuid) }
  if (kind === 'preset') {
    const raw = input.string('preset')
    const preset = ACCESS_PRESETS.find((it) => it === raw)
    if (preset !== undefined) return { kind: 'preset', preset }
    input.problem('preset', '"viewer", "editor" hoặc "manager"')
    return { kind: 'people', people: [] }
  }
  if (kind === 'linked') return { kind: 'linked', link: input.string('link'), field: input.string('field') }
  if (kind === 'initiator') return { kind: 'initiator' }
  if (input.has('kind')) input.problem('kind', '"field", "people", "preset", "linked" hoặc "initiator"')
  return { kind: 'people', people: [] }
}

function parseTrigger (input: JsonReader): AutomationTrigger {
  const kind = input.string('kind')
  if (kind === 'fieldChanged') return { kind: 'fieldChanged', field: input.string('field'), to: input.scalar('to') }
  if (kind === 'date') return { kind: 'date', field: input.string('field'), offsetDays: input.number('offsetDays') }
  if (kind !== 'created' && input.has('kind')) input.problem('kind', '"created", "fieldChanged" hoặc "date"')
  return { kind: 'created' }
}

function parseAssignment (input: JsonReader): FieldAssignment {
  return { field: input.string('field'), value: input.scalar('value') }
}

function parseAction (input: JsonReader): AutomationAction {
  const kind = input.string('kind')
  switch (kind) {
    case 'requestApproval':
      return { kind: 'requestApproval', from: parseTarget(input.object('from')) }
    case 'setField':
      return { kind: 'setField', field: input.string('field'), value: input.scalar('value') }
    case 'createLinked':
      return {
        kind: 'createLinked',
        type: input.string('type'),
        link: input.string('link'),
        title: input.string('title'),
        values: input.has('values') ? input.objects('values').map(parseAssignment) : []
      }
    case 'createTodo':
      return { kind: 'createTodo', title: input.string('title'), assignee: parseTarget(input.object('assignee')) }
    case 'lockField':
      return { kind: 'lockField', fields: input.stringArray('fields') }
    case 'lockRecord':
      return { kind: 'lockRecord' }
  }
  if (input.has('kind')) {
    input.problem('kind', '"requestApproval", "setField", "createLinked", "createTodo", "lockField" hoặc "lockRecord"')
  }
  return { kind: 'lockRecord' }
}

export function parseAutomation (input: JsonReader): AutomationSpec {
  const spec: AutomationSpec = {
    name: input.string('name'),
    trigger: parseTrigger(input.object('trigger')),
    actions: input.objects('actions').map(parseAction)
  }
  if (input.has('onApproved')) spec.onApproved = input.objects('onApproved').map(parseAction)
  if (input.has('onRejected')) spec.onRejected = input.objects('onRejected').map(parseAction)
  return spec
}

export function parseSetAutomation (input: JsonReader): SetAutomationOp {
  return {
    op: 'setAutomation',
    type: input.string('type'),
    key: input.string('key'),
    automation: input.isNull('automation') ? null : parseAutomation(input.object('automation'))
  }
}

// Unreadable rule text means the process was built outside Studio, which Studio shows but never edits.
export function readRule (text: string | undefined): AutomationSpec | null {
  if (text === undefined) return null
  const parsed = parseJsonText(text)
  if (parsed.kind === 'invalid' || !isJsonObject(parsed.json)) return null
  const reader = new JsonReader(parsed.json)
  const spec = parseAutomation(reader)
  return reader.problems.length === 0 ? spec : null
}

export function allActions (spec: AutomationSpec): AutomationAction[] {
  return [...spec.actions, ...(spec.onApproved ?? []), ...(spec.onRejected ?? [])]
}

export function targetOf (action: AutomationAction): PersonTarget | undefined {
  if (action.kind === 'requestApproval') return action.from
  if (action.kind === 'createTodo') return action.assignee
  return undefined
}

// Huly's engine parks the record in a state until these finish, so they must close their list.
export function isWaiting (action: AutomationAction): boolean {
  return action.kind === 'requestApproval' || action.kind === 'createTodo'
}

// Spec risk table: a rule that asks for approval or writes a money field needs a second maintainer.
// Studio calls this too, so its "needs approval" hint and core's risk never disagree.
export function isSensitiveAutomation (
  typeKey: string,
  spec: AutomationSpec,
  isMoneyField: (typeKey: string, fieldKey: string) => boolean
): boolean {
  return allActions(spec).some((action) => {
    if (action.kind === 'requestApproval') return true
    if (action.kind === 'setField') return isMoneyField(typeKey, action.field)
    if (action.kind === 'createLinked') return action.values.some((it) => isMoneyField(action.type, it.field))
    return false
  })
}
