import card, { type MasterTag, type Role } from '@hcengineering/card'
import type { Employee } from '@hcengineering/contact'
import core, { type AccountUuid, type AnyAttribute, type Association, type Doc, type Ref } from '@hcengineering/core'
import process, {
  type ContextId,
  createContext,
  type Func,
  type MethodParams,
  type SelectedRelation,
  type Step,
  type Transition,
  type Trigger
} from '@hcengineering/process'
import { linkDirection, linkedEnd } from './automation-link'
import { fieldKindOf } from './fields'
import { toAccountUuid, toContextId, toStepId } from './keys'
import type { AccessPreset, AutomationAction, AutomationSpec, AutomationTrigger, FieldValue, PersonTarget } from './operations'
import { mustField, mustType } from './ops/common'
import type { ModelState } from './state'

export const START = 'start'
export const MAIN = 'main'
export const WAIT = 'wait'
export const DONE = 'done'

export interface StateSpec {
  role: string
  title: string
}

export interface TransitionSpec {
  role: string
  from: string | null
  to: string
  trigger: Ref<Trigger>
  triggerParams: Transition['triggerParams']
  actions: Array<Step<Doc>>
}

export interface CompiledRule {
  states: StateSpec[]
  transitions: TransitionSpec[]
}

export interface CompileScope {
  state: ModelState
  type: MasterTag
  employees: Map<AccountUuid, Ref<Employee>>
}

interface LinkEnd {
  association: Ref<Association>
  direction: 'A' | 'B'
}

function mustLink ({ state, type }: CompileScope, key: string, target: MasterTag): LinkEnd {
  const link = state.resolveLink(key)
  if (link === undefined) throw new Error(`Link "${key}" disappeared after validation`)
  const direction = linkDirection(state, link, type, target)
  if (direction === undefined) throw new Error(`Link "${key}" no longer joins the rule's types`)
  return { association: link._id, direction }
}

function mustEmployee ({ employees }: CompileScope, account: AccountUuid): Ref<Employee> {
  const employee = employees.get(account)
  if (employee === undefined) throw new Error(`Employee "${account}" disappeared after validation`)
  return employee
}

function mustRole ({ state, type }: CompileScope, preset: AccessPreset): Ref<Role> {
  const role = state.roleFor(type._id, preset)
  if (role === undefined) throw new Error(`Role "${preset}" disappeared after validation`)
  return role._id
}

// Derived from the role, not random: re-saving a rule keeps the ids that running executions already hold.
function contextId (role: string, name: string): ContextId {
  return toContextId(`${role}_${name}`)
}

function contextRef (id: ContextId): string {
  return createContext({ type: 'context', id, key: '' })
}

// Person fields hold Employee refs while rules store account ids.
function fieldParam (scope: CompileScope, attr: AnyAttribute, fieldValue: FieldValue): FieldValue {
  if (typeof fieldValue !== 'string' || fieldKindOf(attr, scope.state).kind !== 'person') return fieldValue
  return mustEmployee(scope, toAccountUuid(fieldValue))
}

// Same reduce the stock editor picks (plugins/process-resources/src/utils.ts:431-441); a todo goes to one person, so it always takes the first card.
function relationReduce (link: Association, direction: 'A' | 'B', isSingle: boolean): Func | undefined {
  if (link.type === '1:1') return undefined
  if (link.type === '1:N' && direction === 'A' && !isSingle) return undefined
  return { func: process.function.FirstValue, props: {} }
}

function linkedUser ({ state, type }: CompileScope, target: Extract<PersonTarget, { kind: 'linked' }>, isSingle: boolean): string {
  const link = state.resolveLink(target.link)
  if (link === undefined) throw new Error(`Link "${target.link}" disappeared after validation`)
  const end = linkedEnd(state, link, type)
  if (end === undefined) throw new Error(`Link "${target.link}" no longer joins the rule's type`)
  const attr = mustField(state, end.type, target.field)
  const relation: SelectedRelation = {
    type: 'relation',
    key: attr.name,
    association: link._id,
    direction: end.direction,
    name: end.direction === 'A' ? link.nameA : link.nameB,
    functions: []
  }
  const reduce = relationReduce(link, end.direction, isSingle)
  if (reduce !== undefined) relation.sourceFunction = reduce
  return createContext(relation)
}

// key 'user' is the approval/todo attribute ContextSelectorPopup.svelte:73-79 writes for a function context.
function initiatorUser (): string {
  return createContext({ type: 'function', func: process.function.ExecutionEmployeeInitiator, key: 'user', props: {} })
}

function approvalParams (scope: CompileScope, target: PersonTarget): MethodParams<Doc> {
  const params: MethodParams<Doc> = {}
  switch (target.kind) {
    case 'field': {
      const attr = mustField(scope.state, scope.type, target.field)
      params.user = createContext({ type: 'attribute', key: attr.name })
      // The editor's "sync with field" toggle: the server re-targets open requests when the field changes.
      params.field = attr.name
      break
    }
    case 'people':
      params.user = target.people.map((it) => mustEmployee(scope, it))
      break
    case 'preset':
      // key '' is what RoleEditor writes for the approvers mock attribute; the server ignores it.
      params.user = createContext({
        type: 'function',
        func: process.function.RoleContext,
        key: '',
        functions: [],
        props: { target: mustRole(scope, target.preset) }
      })
      break
    case 'linked':
      params.user = linkedUser(scope, target, false)
      break
    case 'initiator':
      params.user = initiatorUser()
  }
  return params
}

function todoParams (scope: CompileScope, title: string, target: PersonTarget): MethodParams<Doc> {
  // A closed or deleted todo must not roll back the record changes made before it.
  const params: MethodParams<Doc> = { title: title.trim(), withRollback: false }
  switch (target.kind) {
    case 'field': {
      const attr = mustField(scope.state, scope.type, target.field)
      params.user = createContext({ type: 'attribute', key: attr.name })
      params.field = attr.name
      break
    }
    case 'people':
      params.user = mustEmployee(scope, target.people[0])
      break
    case 'preset':
      throw new Error('Todos go to one person; validation refuses presets')
    case 'linked':
      params.user = linkedUser(scope, target, true)
      break
    case 'initiator':
      params.user = initiatorUser()
      break
  }
  return params
}

function actionSteps (scope: CompileScope, role: string, index: number, action: AutomationAction): Array<Step<Doc>> {
  const id = toStepId(`${role}_${index}`)
  switch (action.kind) {
    case 'requestApproval':
      return [
        {
          _id: id,
          context: { _id: contextId(role, 'approval'), _class: process.class.ApproveRequest },
          methodId: process.method.RequestApproval,
          params: approvalParams(scope, action.from)
        }
      ]
    case 'setField': {
      const attr = mustField(scope.state, scope.type, action.field)
      const params: MethodParams<Doc> = {}
      params[attr.name] = fieldParam(scope, attr, action.value)
      return [{ _id: id, context: null, methodId: process.method.UpdateCard, params }]
    }
    case 'createLinked': {
      const target = mustType(scope.state, action.type)
      const created = contextId(role, `card${index}`)
      // targetClass mirrors CreateCardEditor, which reads it back to list the new record's fields.
      const params: MethodParams<Doc> = { _class: target._id, targetClass: target._id, title: action.title.trim() }
      for (const assignment of action.values) {
        const attr = mustField(scope.state, target, assignment.field)
        params[attr.name] = fieldParam(scope, attr, assignment.value)
      }
      const link = mustLink(scope, action.link, target)
      return [
        { _id: id, context: { _id: created, _class: card.class.Card }, methodId: process.method.CreateCard, params },
        {
          _id: toStepId(`${role}_${index}_link`),
          context: { _id: contextId(role, `link${index}`), _class: core.class.Relation },
          methodId: process.method.AddRelation,
          params: { association: link.association, direction: link.direction, _id: contextRef(created) }
        }
      ]
    }
    case 'createTodo':
      return [
        {
          _id: id,
          context: { _id: contextId(role, 'todo'), _class: process.class.ProcessToDo },
          methodId: process.method.CreateToDo,
          params: todoParams(scope, action.title, action.assignee)
        }
      ]
    case 'lockField':
      return [
        {
          _id: id,
          context: null,
          methodId: process.method.LockField,
          params: { value: action.fields.map((it) => mustField(scope.state, scope.type, it).name) }
        }
      ]
    case 'lockRecord':
      return [{ _id: id, context: null, methodId: process.method.LockCard, params: {} }]
  }
}

function triggerParamsOf (
  scope: CompileScope,
  trigger: Exclude<AutomationTrigger, { kind: 'created' }>
): Transition['triggerParams'] {
  const attr = mustField(scope.state, scope.type, trigger.field)
  const params: Transition['triggerParams'] = {}
  if (trigger.kind === 'date') {
    // Same props and key order DateOffsetEditor writes, so Huly's editor shows the offset unchanged.
    params.value = createContext({
      type: 'attribute',
      key: attr.name,
      functions: [
        {
          func: process.function.Offset,
          props: {
            offset: Math.abs(trigger.offsetDays),
            offsetType: 'days',
            direction: trigger.offsetDays < 0 ? 'before' : 'after'
          }
        }
      ]
    })
    return params
  }
  // FieldChangedCheck reads only the first key as the watched attribute.
  params[attr.name] = fieldParam(scope, attr, trigger.to)
  return params
}

interface Segment {
  role: string
  from: string | null
  trigger: Ref<Trigger>
  triggerParams: Transition['triggerParams']
  actions: AutomationAction[]
  next: string
  onApproved: AutomationAction[]
  onRejected: AutomationAction[]
}

// Person-field targets resolve when the step runs; an empty field fails the execution for good, so the step waits for a value.
// A field the same step sets first is skipped: waiting on it would never end.
function fieldTargets (scope: CompileScope, actions: AutomationAction[]): string[] {
  const written = new Set(actions.flatMap((action) => (action.kind === 'setField' ? [action.field] : [])))
  return actions.flatMap((action) => {
    const target = action.kind === 'requestApproval' ? action.from : action.kind === 'createTodo' ? action.assignee : undefined
    if (target?.kind !== 'field' || written.has(target.field)) return []
    return [mustField(scope.state, scope.type, target.field).name]
  })
}

function filledParams (fields: string[]): Transition['triggerParams'] {
  const params: Transition['triggerParams'] = {}
  for (const name of fields) params[name] = { $ne: null }
  return params
}

export function compileRule (scope: CompileScope, spec: AutomationSpec): CompiledRule {
  const states: StateSpec[] = []
  const transitions: TransitionSpec[] = []
  const ensure = (role: string, title: string): string => {
    if (!states.some((it) => it.role === role)) states.push({ role, title })
    return role
  }
  const nextState = (role: string): string => (role === DONE ? ensure(DONE, 'Xong') : role)
  // The original role keeps its from and trigger, so re-saving an old rule strands no running record.
  // OnCardUpdate is an auto trigger: the engine checks it on entering the state, so a filled field passes at once.
  const gated = (base: Omit<TransitionSpec, 'actions'>, actions: Array<Step<Doc>>, fields: string[]): void => {
    if (fields.length === 0) {
      transitions.push({ ...base, actions })
      return
    }
    const filling = ensure(`${base.role}_fill`, 'Chờ điền thông tin')
    transitions.push({ ...base, to: filling, actions: [] })
    transitions.push({
      role: `${base.role}_ready`,
      from: filling,
      to: base.to,
      trigger: process.trigger.OnCardUpdate,
      triggerParams: filledParams(fields),
      actions
    })
  }
  const segment = (part: Segment): void => {
    const move = (to: string): void => {
      gated(
        { role: part.role, from: part.from, to, trigger: part.trigger, triggerParams: part.triggerParams },
        part.actions.flatMap((action, index) => actionSteps(scope, part.role, index, action)),
        fieldTargets(scope, part.actions)
      )
    }
    const last = part.actions.at(-1)
    if (last?.kind === 'requestApproval') {
      const review = ensure(`${part.role}_review`, 'Chờ duyệt')
      move(review)
      const group = contextRef(contextId(part.role, 'approval'))
      const branch = (suffix: string, trigger: Ref<Trigger>, actions: AutomationAction[]): void => {
        segment({
          role: `${part.role}_${suffix}`,
          from: review,
          trigger,
          triggerParams: { _id: group },
          actions,
          next: part.next,
          onApproved: [],
          onRejected: []
        })
      }
      branch('approved', process.trigger.OnApproveRequestApproved, part.onApproved)
      branch('rejected', process.trigger.OnApproveRequestRejected, part.onRejected)
      return
    }
    if (last?.kind === 'createTodo') {
      // Parks the execution until the todo closes, so OnExecutionDone does not delete it early.
      // No OnToDoRemove branch: checkNext fires it at once for an open todo (CheckToDoCancelled sees doneOn === null).
      const waiting = ensure(`${part.role}_todo`, 'Chờ việc xong')
      move(waiting)
      transitions.push({
        role: `${part.role}_closed`,
        from: waiting,
        to: nextState(part.next),
        trigger: process.trigger.OnToDoClose,
        triggerParams: { _id: contextRef(contextId(part.role, 'todo')) },
        actions: []
      })
      return
    }
    move(nextState(part.next))
  }

  const trigger = spec.trigger
  const onApproved = spec.onApproved ?? []
  const onRejected = spec.onRejected ?? []
  if (trigger.kind === 'created') {
    segment({
      role: START,
      from: null,
      trigger: process.trigger.OnExecutionStart,
      triggerParams: {},
      actions: spec.actions,
      next: DONE,
      onApproved,
      onRejected
    })
    return { states, transitions }
  }
  const wait = ensure(WAIT, trigger.kind === 'date' ? 'Chờ đến ngày' : 'Chờ thay đổi')
  // OnTime is an auto trigger that reads the date on entering wait; an empty date fails the execution there.
  const dateFields = trigger.kind === 'date' ? [mustField(scope.state, scope.type, trigger.field).name] : []
  gated({ role: START, from: null, to: wait, trigger: process.trigger.OnExecutionStart, triggerParams: {} }, [], dateFields)
  segment({
    role: MAIN,
    from: wait,
    trigger: trigger.kind === 'date' ? process.trigger.OnTime : process.trigger.WhenFieldChanges,
    triggerParams: triggerParamsOf(scope, trigger),
    actions: spec.actions,
    // A date passes once; a field can change again, so field rules go back to waiting.
    next: trigger.kind === 'date' ? DONE : WAIT,
    onApproved,
    onRejected
  })
  return { states, transitions }
}
