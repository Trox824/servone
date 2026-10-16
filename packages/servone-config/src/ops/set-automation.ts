import type { MasterTag } from '@hcengineering/card'
import core, { type Data, type Doc, generateId, getDiffUpdate, type Ref, type TxCUD, type TxFactory } from '@hcengineering/core'
import process, { ExecutionStatus, type Process, type State, type Transition } from '@hcengineering/process'
import { makeRank } from '@hcengineering/rank'
import { allActions, isSensitiveAutomation, parseSetAutomation, readRule } from '../automation'
import { type CompiledRule, compileRule } from '../automation-compile'
import { ruleSentences } from '../automation-text'
import { loadEmployees, ruleAccounts, ruleIssues } from '../automation-validate'
import { fieldKindOf } from '../fields'
import type { AutomationSpec, SetAutomationOp } from '../operations'
import type { OperationModule, StepContext } from '../registry'
import { readServone, withServone } from '../servone-fields'
import type { ModelState } from '../state'
import type { DiffLine, RiskLevel } from '../types'
import { countedLine, line, mustType, quote, unquote } from './common'

function previousRule (state: ModelState, op: SetAutomationOp): AutomationSpec | null {
  const existing = state.resolveRule(mustType(state, op.type)._id, op.key)
  return existing !== undefined ? readRule(readServone(existing).servoneRule) : null
}

function linkedTypes (spec: AutomationSpec | null): string[] {
  if (spec === null) return []
  return allActions(spec).flatMap((action) => (action.kind === 'createLinked' ? [action.type] : []))
}

function isMoneyField (state: ModelState, typeKey: string, fieldKey: string): boolean {
  const owner = state.resolveType(typeKey)
  const attr = owner !== undefined ? state.resolveField(owner, fieldKey) : undefined
  return attr !== undefined && fieldKindOf(attr, state).kind === 'money'
}

function ruleRisk (state: ModelState, op: SetAutomationOp, affected: number): RiskLevel {
  const specs = [op.automation, previousRule(state, op)]
  const isSensitive = specs.some(
    (spec) => spec !== null && isSensitiveAutomation(op.type, spec, (typeKey, fieldKey) => isMoneyField(state, typeKey, fieldKey))
  )
  if (isSensitive) return 'sensitive'
  return affected > 0 ? 'destructive' : 'safe'
}

async function compileFor (ctx: StepContext, type: MasterTag, spec: AutomationSpec): Promise<CompiledRule> {
  const employees = await loadEmployees(ctx.client, ruleAccounts(ctx.state, type, spec))
  return compileRule({ state: ctx.state, type, employees }, spec)
}

async function stoppedExecutions (op: SetAutomationOp, ctx: StepContext): Promise<number> {
  const type = mustType(ctx.state, op.type)
  const existing = ctx.state.resolveRule(type._id, op.key)
  if (existing === undefined) return 0
  const compiled: CompiledRule = op.automation === null ? { states: [], transitions: [] } : await compileFor(ctx, type, op.automation)
  const kept = new Set(compiled.states.map((it) => it.role))
  const triggers = new Map(compiled.transitions.map((it) => [it.role, it.trigger]))
  // A kept state whose way out now waits for another event (date to field change) strands the records parked in it.
  const retriggered = new Set(
    ctx.state.transitionsOf(existing._id).flatMap((it) => {
      const next = triggers.get(ctx.state.keyOf(it))
      return it.from !== null && next !== undefined && next !== it.trigger ? [it.from] : []
    })
  )
  const stopped = ctx.state
    .statesOf(existing._id)
    .filter((it) => !kept.has(ctx.state.keyOf(it)) || retriggered.has(it._id))
    .map((it) => it._id)
  if (stopped.length === 0) return 0
  const running = await ctx.client.findAll(
    process.class.Execution,
    { process: existing._id, status: ExecutionStatus.Active, currentState: { $in: stopped } },
    { limit: 1, total: true }
  )
  return running.total
}

function stateRef (ids: Map<string, Ref<State>>, role: string): Ref<State> {
  const id = ids.get(role)
  if (id === undefined) throw new Error(`State ${role} was not compiled`)
  return id
}

function removeTxes (factory: TxFactory, docs: Doc[]): Array<TxCUD<Doc>> {
  return docs.map((doc) => factory.createTxRemoveDoc<Doc>(doc._class, core.space.Model, doc._id))
}

async function ruleTxes (op: SetAutomationOp, ctx: StepContext): Promise<Array<TxCUD<Doc>>> {
  const { state, factory } = ctx
  const type = mustType(state, op.type)
  const existing = state.resolveRule(type._id, op.key)
  if (op.automation === null) {
    return existing !== undefined ? removeTxes(factory, [...state.transitionsOf(existing._id), ...state.statesOf(existing._id), existing]) : []
  }

  const spec = op.automation
  const compiled = await compileFor(ctx, type, spec)
  const oldStates = existing !== undefined ? state.statesOf(existing._id) : []
  const oldTransitions = existing !== undefined ? state.transitionsOf(existing._id) : []
  const txes: Array<TxCUD<Doc>> = []

  // automationOnly hides the rule from Huly's run menus and the card Processes section, so nobody starts it by hand.
  const fields = withServone(
    { name: spec.name.trim(), description: unquote(ruleSentences(state, type, spec).join(' ')), autoStart: true, automationOnly: true },
    { servoneRule: JSON.stringify(spec) }
  )
  const ruleId = existing?._id ?? generateId<Process>()
  if (existing === undefined) {
    const base: Data<Process> = { ...fields, masterTag: type._id, context: {} }
    txes.push(factory.createTxCreateDoc(process.class.Process, core.space.Model, withServone(base, { servoneKey: op.key }), ruleId))
  } else {
    const update = getDiffUpdate(existing, fields)
    if (Object.keys(update).length > 0) txes.push(factory.createTxUpdateDoc(process.class.Process, core.space.Model, ruleId, update))
  }

  const stateIds = new Map<string, Ref<State>>()
  let stateRank = oldStates.map((it) => it.rank).sort().at(-1)
  for (const planned of compiled.states) {
    const old = oldStates.find((it) => state.keyOf(it) === planned.role)
    if (old !== undefined) {
      stateIds.set(planned.role, old._id)
      const update = getDiffUpdate(old, { title: planned.title })
      if (Object.keys(update).length > 0) txes.push(factory.createTxUpdateDoc(process.class.State, core.space.Model, old._id, update))
      continue
    }
    stateRank = makeRank(stateRank, undefined)
    const id = generateId<State>()
    stateIds.set(planned.role, id)
    const base: Data<State> = { process: ruleId, title: planned.title, rank: stateRank }
    txes.push(factory.createTxCreateDoc(process.class.State, core.space.Model, withServone(base, { servoneKey: planned.role }), id))
  }

  let transitionRank = oldTransitions.map((it) => it.rank).sort().at(-1)
  for (const planned of compiled.transitions) {
    const wanted = {
      from: planned.from === null ? null : stateRef(stateIds, planned.from),
      to: stateRef(stateIds, planned.to),
      trigger: planned.trigger,
      triggerParams: planned.triggerParams,
      actions: planned.actions
    }
    const old = oldTransitions.find((it) => state.keyOf(it) === planned.role)
    if (old === undefined) {
      transitionRank = makeRank(transitionRank, undefined)
      const base: Data<Transition> = { ...wanted, process: ruleId, rank: transitionRank }
      txes.push(factory.createTxCreateDoc(process.class.Transition, core.space.Model, withServone(base, { servoneKey: planned.role })))
      continue
    }
    const update = getDiffUpdate(old, wanted)
    if (Object.keys(update).length > 0) txes.push(factory.createTxUpdateDoc(process.class.Transition, core.space.Model, old._id, update))
  }

  // Removals last: a transition must go before the state it points at.
  const keptTransitions = new Set(compiled.transitions.map((it) => it.role))
  const keptStates = new Set(compiled.states.map((it) => it.role))
  txes.push(
    ...removeTxes(factory, [
      ...oldTransitions.filter((it) => !keptTransitions.has(state.keyOf(it))),
      ...oldStates.filter((it) => !keptStates.has(state.keyOf(it)))
    ])
  )
  return txes
}

function ruleDiff (state: ModelState, op: SetAutomationOp, affected: number): DiffLine[] {
  const type = mustType(state, op.type)
  const typeName = quote(state.nameOf(type))
  const risk = ruleRisk(state, op, affected)
  const existing = state.resolveRule(type._id, op.key)
  const lines: DiffLine[] = []
  if (op.automation === null) {
    lines.push(line(`Xóa quy tắc ${quote(existing?.name ?? op.key)} khỏi ${typeName}`, risk))
  } else {
    const name = quote(op.automation.name.trim())
    lines.push(line(existing === undefined ? `Thêm quy tắc ${name} cho ${typeName}` : `Sửa quy tắc ${name} của ${typeName}`, risk))
    lines.push(...ruleSentences(state, type, op.automation).map((text) => line(text, risk)))
  }
  // Always destructive, even on a sensitive rule: maxRisk would fold it into sensitive and skip the confirm dialog.
  if (affected > 0) lines.push(countedLine(`${affected} hồ sơ đang chạy quy tắc này sẽ dừng ở bước bị bỏ hoặc đổi điều kiện`, 'destructive', affected))
  return lines
}

export const setAutomation: OperationModule<'setAutomation'> = {
  parse: parseSetAutomation,
  validate: async (op, ctx) => await ruleIssues(ctx, op),
  measure: async (op, ctx) => await stoppedExecutions(op, ctx),
  inverse: (op, { state }) => [{ op: 'setAutomation', type: op.type, key: op.key, automation: previousRule(state, op) }],
  diff: (op, { state }, affected) => ruleDiff(state, op, affected),
  risk: (op, { state }, affected) => ruleRisk(state, op, affected),
  expand: async (op, ctx) => await ruleTxes(op, ctx),
  typeKeys: (op, { state }) => [op.type, ...linkedTypes(op.automation), ...linkedTypes(previousRule(state, op))]
}
