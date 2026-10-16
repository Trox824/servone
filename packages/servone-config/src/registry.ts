import type { Account, Doc, TxCUD, TxFactory } from '@hcengineering/core'
import type { ConfigClient } from './client'
import type { JsonReader } from './json'
import type { Operation, OperationKind, OperationMap } from './operations'
import type { ModelState } from './state'
import type { ChangeRecord, DiffLine, Issue, RiskLevel } from './types'
import { addField, restoreField } from './ops/add-field'
import { archiveType, unarchiveType } from './ops/archive-type'
import { copyType } from './ops/copy-type'
import { createType } from './ops/create-type'
import { createGroup, removeGroup } from './ops/groups'
import { addLink, removeLink, restoreLink } from './ops/links'
import { removeField } from './ops/remove-field'
import { setAccess } from './ops/set-access'
import { setAutomation } from './ops/set-automation'
import { setOptions } from './ops/set-options'
import { setView } from './ops/set-view'
import { updateField } from './ops/update-field'
import { updateType } from './ops/update-type'

export interface StepContext {
  state: ModelState
  factory: TxFactory
  client: ConfigClient
  account: Account
  replanning?: ChangeRecord
}

export interface OperationModule<K extends OperationKind> {
  parse: (input: JsonReader) => OperationMap[K]
  // Checked before validate: validate can only refuse, and a pack re-install must plan nothing instead.
  isInstalled?: (op: OperationMap[K], ctx: StepContext) => boolean
  validate: (op: OperationMap[K], ctx: StepContext) => Issue[] | Promise<Issue[]>
  measure?: (op: OperationMap[K], ctx: StepContext) => Promise<number>
  inverse: (op: OperationMap[K], ctx: StepContext) => Operation[]
  diff: (op: OperationMap[K], ctx: StepContext, affected: number) => DiffLine[]
  risk: (op: OperationMap[K], ctx: StepContext, affected: number) => RiskLevel
  expand: (op: OperationMap[K], ctx: StepContext) => Array<TxCUD<Doc>> | Promise<Array<TxCUD<Doc>>>
  typeKeys: (op: OperationMap[K], ctx: StepContext) => string[]
}

export interface StepOutcome {
  isSkipped: boolean
  issues: Issue[]
  txes: Array<TxCUD<Doc>>
  inverse: Operation[]
  diff: DiffLine[]
  risk: RiskLevel
  typeKeys: string[]
}

export const OPERATIONS: { [K in OperationKind]: OperationModule<K> } = {
  createType,
  copyType,
  updateType,
  archiveType,
  unarchiveType,
  addField,
  restoreField,
  updateField,
  removeField,
  setOptions,
  addLink,
  restoreLink,
  removeLink,
  createGroup,
  removeGroup,
  setView,
  setAccess,
  setAutomation
}

export function isOperationKind (kind: string): kind is OperationKind {
  return Object.hasOwn(OPERATIONS, kind)
}

function emptyStep (isSkipped: boolean, issues: Issue[]): StepOutcome {
  return { isSkipped, issues, txes: [], inverse: [], diff: [], risk: 'safe', typeKeys: [] }
}

export async function runStep<K extends OperationKind> (kind: K, op: OperationMap[K], ctx: StepContext): Promise<StepOutcome> {
  const module: OperationModule<K> = OPERATIONS[kind]
  if (module.isInstalled?.(op, ctx) === true) return emptyStep(true, [])
  const issues = await module.validate(op, ctx)
  if (issues.length > 0) return emptyStep(false, issues)
  const affected = module.measure !== undefined ? await module.measure(op, ctx) : 0
  const inverse = module.inverse(op, ctx)
  const diff = module.diff(op, ctx, affected)
  const risk = module.risk(op, ctx, affected)
  const txes = await module.expand(op, ctx)
  return { isSkipped: false, issues: [], txes, inverse, diff, risk, typeKeys: module.typeKeys(op, ctx) }
}
