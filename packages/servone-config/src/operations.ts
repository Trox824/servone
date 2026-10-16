import type { AccountUuid } from '@hcengineering/core'

export type FieldKind =
  | { kind: 'text' }
  | { kind: 'longText' }
  | { kind: 'number', min?: number, max?: number, isInteger?: boolean }
  | { kind: 'money', currency: string }
  | { kind: 'date', hasTime?: boolean }
  | { kind: 'boolean' }
  | { kind: 'select', options: string[] }
  | { kind: 'multiSelect', options: string[] }
  | { kind: 'person' }
  | { kind: 'autoNumber', prefix: string }

export type OptionChange =
  | { add: string, at?: number }
  | { rename: string, to: string }
  | { reorder: string[] }
  | { remove: string, mapTo?: string }

export interface ViewSpec {
  columns?: string[]
  groupBy?: string | null
}

export type AccessPreset = 'viewer' | 'editor' | 'manager'

export interface SpaceAccess {
  space: string
  isRestricted?: boolean
  viewer?: AccountUuid[]
  editor?: AccountUuid[]
  manager?: AccountUuid[]
}

export interface AccessSpec {
  spaces: SpaceAccess[]
}

export interface CreateTypeOp {
  op: 'createType'
  key: string
  name: string
  basedOn?: string
  spaces?: string[]
  // Set by pack installs: a doc that already carries this pack key turns the op into a no-op.
  packKey?: string
}

export interface CopyTypeOp {
  op: 'copyType'
  from: string
  key: string
  name: string
}

export interface UpdateTypeOp {
  op: 'updateType'
  type: string
  name?: string
  icon?: string
  color?: number
  spaces?: string[]
}

export interface ArchiveTypeOp {
  op: 'archiveType'
  type: string
}

export interface UnarchiveTypeOp {
  op: 'unarchiveType'
  type: string
}

export interface AddFieldOp {
  op: 'addField'
  type: string
  key: string
  name: string
  kind: FieldKind
  required?: boolean
  packKey?: string
}

export interface RestoreFieldOp extends Omit<AddFieldOp, 'op'> {
  op: 'restoreField'
  attributeId: string
  attributeName: string
  enumId?: string
  sequenceId?: string
}

export interface UpdateFieldOp {
  op: 'updateField'
  type: string
  field: string
  name?: string
  required?: boolean
}

export interface RemoveFieldOp {
  op: 'removeField'
  type: string
  field: string
}

export interface SetOptionsOp {
  op: 'setOptions'
  type: string
  field: string
  options: OptionChange[]
}

export interface AddLinkOp {
  op: 'addLink'
  key?: string
  from: string
  to: string
  fromName: string
  toName: string
  fromMany: boolean
  toMany: boolean
  packKey?: string
}

export interface RestoreLinkOp extends Omit<AddLinkOp, 'op' | 'key'> {
  op: 'restoreLink'
  key: string
  linkId: string
}

export interface RemoveLinkOp {
  op: 'removeLink'
  link: string
}

export interface CreateGroupOp {
  op: 'createGroup'
  key: string
  name: string
  types: string[]
  packKey?: string
}

export interface RemoveGroupOp {
  op: 'removeGroup'
  group: string
}

export interface SetViewOp {
  op: 'setView'
  type: string
  view: ViewSpec
}

export interface SetAccessOp {
  op: 'setAccess'
  type: string
  access: AccessSpec
}

export type PersonTarget =
  | { kind: 'field', field: string }
  | { kind: 'people', people: AccountUuid[] }
  | { kind: 'preset', preset: AccessPreset }
  // A person field on the record joined by this link; the stock engine reads it through a relation context.
  | { kind: 'linked', link: string, field: string }
  // Whoever created the record (stock ExecutionEmployeeInitiator).
  | { kind: 'initiator' }

export type FieldValue = string | number | boolean | null

export type AutomationTrigger =
  | { kind: 'created' }
  | { kind: 'fieldChanged', field: string, to: FieldValue }
  | { kind: 'date', field: string, offsetDays: number }

export interface FieldAssignment {
  field: string
  value: FieldValue
}

export type AutomationAction =
  | { kind: 'requestApproval', from: PersonTarget }
  | { kind: 'setField', field: string, value: FieldValue }
  | { kind: 'createLinked', type: string, link: string, title: string, values: FieldAssignment[] }
  | { kind: 'createTodo', title: string, assignee: PersonTarget }
  | { kind: 'lockField', fields: string[] }
  | { kind: 'lockRecord' }

export interface AutomationSpec {
  name: string
  trigger: AutomationTrigger
  actions: AutomationAction[]
  onApproved?: AutomationAction[]
  onRejected?: AutomationAction[]
}

// One rule per key and type; null removes the rule.
export interface SetAutomationOp {
  op: 'setAutomation'
  type: string
  key: string
  automation: AutomationSpec | null
}

// unarchiveType, restoreField, restoreLink and removeGroup exist so undo can be stored as plain operations.
export interface OperationMap {
  createType: CreateTypeOp
  copyType: CopyTypeOp
  updateType: UpdateTypeOp
  archiveType: ArchiveTypeOp
  unarchiveType: UnarchiveTypeOp
  addField: AddFieldOp
  restoreField: RestoreFieldOp
  updateField: UpdateFieldOp
  removeField: RemoveFieldOp
  setOptions: SetOptionsOp
  addLink: AddLinkOp
  restoreLink: RestoreLinkOp
  removeLink: RemoveLinkOp
  createGroup: CreateGroupOp
  removeGroup: RemoveGroupOp
  setView: SetViewOp
  setAccess: SetAccessOp
  setAutomation: SetAutomationOp
}

export type OperationKind = keyof OperationMap

export type Operation = OperationMap[OperationKind]
