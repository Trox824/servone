import type { MasterTag } from '@hcengineering/card'
import contact, { type Employee } from '@hcengineering/contact'
import type { AccountUuid, AnyAttribute, Ref } from '@hcengineering/core'
import { allActions, isWaiting, readRule, targetOf } from './automation'
import { linkDirection, linkedEnd } from './automation-link'
import { presetName } from './automation-text'
import { findChanges } from './change-log'
import type { ConfigClient } from './client'
import { fieldKindOf } from './fields'
import { isValidKey, labelText, sameName, toAccountUuid } from './keys'
import type { AutomationAction, AutomationSpec, AutomationTrigger, FieldValue, PersonTarget, SetAutomationOp } from './operations'
import { activeTypeIssues, issue, mustType, nameIssues, quote } from './ops/common'
import type { StepContext } from './registry'
import { readServone } from './servone-fields'
import type { ModelState } from './state'
import type { Issue } from './types'

// A year covers probation, contract and leave reminders; a larger offset is almost always a typo.
export const MAX_OFFSET_DAYS = 365
// Huly's field-change criteria compare values; a dropdown or yes/no is the only kind admins set to one exact value.
const CHANGE_KINDS = new Set(['select', 'boolean'])

interface Scope {
  state: ModelState
  type: MasterTag
}

function missingField (state: ModelState, owner: MasterTag, key: string): Issue {
  return issue('not-found', `Không tìm thấy trường "${key}" trong ${quote(state.nameOf(owner))}`)
}

function valueIssues (state: ModelState, attr: AnyAttribute, fieldValue: FieldValue): Issue[] {
  if (fieldValue === null) return []
  const kind = fieldKindOf(attr, state)
  const name = quote(labelText(attr.label))
  switch (kind.kind) {
    case 'text':
      return typeof fieldValue === 'string' ? [] : [issue('invalid-input', `${name} cần một đoạn chữ`)]
    case 'number':
    case 'money':
      return typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? [] : [issue('invalid-input', `${name} cần một số`)]
    case 'boolean':
      return typeof fieldValue === 'boolean' ? [] : [issue('invalid-input', `${name} cần Có hoặc Không`)]
    case 'person':
      return typeof fieldValue === 'string' ? [] : [issue('invalid-input', `${name} cần một người`)]
    case 'select':
      if (typeof fieldValue !== 'string') return [issue('invalid-input', `${name} cần một lựa chọn`)]
      return kind.options.includes(fieldValue) ? [] : [issue('bad-option', `Không có lựa chọn "${fieldValue}" trong ${name}`)]
    default:
      return [issue('unsupported', `Chưa đặt được giá trị cho trường ${name}`)]
  }
}

function assignmentIssues (state: ModelState, owner: MasterTag, key: string, fieldValue: FieldValue): Issue[] {
  const attr = state.resolveField(owner, key)
  return attr === undefined ? [missingField(state, owner, key)] : valueIssues(state, attr, fieldValue)
}

function targetIssues ({ state, type }: Scope, target: PersonTarget, isTodo: boolean): Issue[] {
  switch (target.kind) {
    case 'field': {
      const attr = state.resolveField(type, target.field)
      if (attr === undefined) return [missingField(state, type, target.field)]
      if (fieldKindOf(attr, state).kind === 'person') return []
      return [issue('invalid-input', `Trường ${quote(labelText(attr.label))} không phải kiểu Người`)]
    }
    case 'people':
      if (isTodo && target.people.length !== 1) return [issue('invalid-input', 'Việc cần làm giao cho đúng một người')]
      return target.people.length === 0 ? [issue('invalid-input', 'Chọn ít nhất một người duyệt')] : []
    case 'preset':
      if (isTodo) return [issue('unsupported', 'Việc cần làm giao cho một người, không giao theo quyền')]
      if (state.roleFor(type._id, target.preset) !== undefined) return []
      return [
        issue(
          'not-found',
          `Chưa ai có quyền ${quote(presetName(target.preset))} cho ${quote(state.nameOf(type))}; hãy đặt Quyền trước`
        )
      ]
    case 'linked': {
      const link = state.resolveLink(target.link)
      if (link === undefined) return [issue('not-found', `Không tìm thấy liên kết "${target.link}"`)]
      const end = linkedEnd(state, link, type)
      if (end === undefined) return [issue('not-allowed', `Liên kết "${target.link}" không nối với ${quote(state.nameOf(type))}`)]
      const attr = state.resolveField(end.type, target.field)
      if (attr === undefined) return [missingField(state, end.type, target.field)]
      if (fieldKindOf(attr, state).kind === 'person') return []
      return [issue('invalid-input', `Trường ${quote(labelText(attr.label))} không phải kiểu Người`)]
    }
    case 'initiator':
      return []
  }
}

function actionIssues (scope: Scope, action: AutomationAction): Issue[] {
  const { state, type } = scope
  switch (action.kind) {
    case 'requestApproval':
      return targetIssues(scope, action.from, false)
    case 'createTodo':
      return [...nameIssues(action.title, 'việc cần làm'), ...targetIssues(scope, action.assignee, true)]
    case 'setField':
      return assignmentIssues(state, type, action.field, action.value)
    case 'createLinked': {
      const typeIssues = activeTypeIssues(state, action.type)
      if (typeIssues.length > 0) return typeIssues
      const target = mustType(state, action.type)
      const link = state.resolveLink(action.link)
      if (link === undefined) return [issue('not-found', `Không tìm thấy liên kết "${action.link}"`)]
      if (linkDirection(state, link, type, target) === undefined) {
        return [
          issue(
            'not-allowed',
            `Liên kết "${action.link}" không nối ${quote(state.nameOf(type))} với ${quote(state.nameOf(target))}`
          )
        ]
      }
      return [
        ...nameIssues(action.title, 'hồ sơ mới'),
        ...action.values.flatMap((it) => assignmentIssues(state, target, it.field, it.value))
      ]
    }
    case 'lockField':
      if (action.fields.length === 0) return [issue('invalid-input', 'Chọn ít nhất một trường cần khóa')]
      return action.fields.flatMap((key) => (state.resolveField(type, key) === undefined ? [missingField(state, type, key)] : []))
    case 'lockRecord':
      return []
  }
}

function listIssues (scope: Scope, actions: AutomationAction[], isBranch: boolean): Issue[] {
  const issues: Issue[] = []
  if (actions.length === 0 && !isBranch) issues.push(issue('invalid-input', 'Cần ít nhất một việc sau "thì"'))
  for (const [index, action] of actions.entries()) {
    if (isWaiting(action) && index !== actions.length - 1) {
      issues.push(issue('not-allowed', 'Gửi duyệt và tạo việc cần làm phải là việc cuối cùng của câu'))
    }
    if (isBranch && action.kind === 'requestApproval') {
      issues.push(issue('not-allowed', 'Chưa hỗ trợ duyệt nhiều cấp; mỗi quy tắc gửi duyệt một lần'))
    }
    issues.push(...actionIssues(scope, action))
  }
  return issues
}

function triggerIssues ({ state, type }: Scope, trigger: AutomationTrigger): Issue[] {
  if (trigger.kind === 'created') return []
  const attr = state.resolveField(type, trigger.field)
  if (attr === undefined) return [missingField(state, type, trigger.field)]
  const name = quote(labelText(attr.label))
  const kind = fieldKindOf(attr, state).kind
  if (trigger.kind === 'date') {
    if (kind !== 'date') return [issue('unsupported', `${name} không phải trường Ngày`)]
    if (!Number.isInteger(trigger.offsetDays) || Math.abs(trigger.offsetDays) > MAX_OFFSET_DAYS) {
      return [issue('invalid-input', `Số ngày phải là số nguyên từ -${MAX_OFFSET_DAYS} đến ${MAX_OFFSET_DAYS}`)]
    }
    return []
  }
  if (!CHANGE_KINDS.has(kind)) {
    return [issue('unsupported', `Chỉ theo dõi được trường Danh sách chọn hoặc Có / Không; ${name} không thuộc hai kiểu này`)]
  }
  if (trigger.to === null) return [issue('invalid-input', `Hãy chọn giá trị cho ${name}`)]
  return valueIssues(state, attr, trigger.to)
}

// A rule that resets its own trigger field to the value it watches re-queues WhenFieldChanges forever, one event at a time.
function selfTriggerIssues (spec: AutomationSpec): Issue[] {
  const trigger = spec.trigger
  if (trigger.kind !== 'fieldChanged') return []
  const loops = allActions(spec).some(
    (action) => action.kind === 'setField' && action.field === trigger.field && action.value === trigger.to
  )
  return loops ? [issue('not-allowed', 'Quy tắc tự đặt lại trường đang theo dõi sẽ chạy lặp vô hạn')] : []
}

export function ruleAccounts (state: ModelState, type: MasterTag, spec: AutomationSpec): AccountUuid[] {
  const accounts = new Set<AccountUuid>()
  const addValue = (owner: MasterTag | undefined, key: string, fieldValue: FieldValue): void => {
    const attr = owner !== undefined ? state.resolveField(owner, key) : undefined
    if (attr !== undefined && typeof fieldValue === 'string' && fieldKindOf(attr, state).kind === 'person') {
      accounts.add(toAccountUuid(fieldValue))
    }
  }
  for (const action of allActions(spec)) {
    const target = targetOf(action)
    if (target?.kind === 'people') for (const account of target.people) accounts.add(account)
    if (action.kind === 'setField') addValue(type, action.field, action.value)
    if (action.kind === 'createLinked') {
      for (const assignment of action.values) addValue(state.resolveType(action.type), assignment.field, assignment.value)
    }
  }
  return [...accounts]
}

interface FieldUse {
  owner: MasterTag | undefined
  field: string
  fieldValue?: FieldValue
}

function fieldUses (state: ModelState, type: MasterTag, spec: AutomationSpec): FieldUse[] {
  const trigger = spec.trigger
  const uses: FieldUse[] = []
  if (trigger.kind === 'fieldChanged') uses.push({ owner: type, field: trigger.field, fieldValue: trigger.to })
  if (trigger.kind === 'date') uses.push({ owner: type, field: trigger.field })
  for (const action of allActions(spec)) {
    const target = targetOf(action)
    if (target?.kind === 'field') uses.push({ owner: type, field: target.field })
    if (target?.kind === 'linked') {
      // Blocks removing the field on the connected form while this rule reads it.
      const link = state.resolveLink(target.link)
      uses.push({ owner: link === undefined ? undefined : linkedEnd(state, link, type)?.type, field: target.field })
    }
    if (action.kind === 'setField') uses.push({ owner: type, field: action.field, fieldValue: action.value })
    if (action.kind === 'lockField') uses.push(...action.fields.map((field) => ({ owner: type, field })))
    if (action.kind === 'createLinked') {
      const linked = state.resolveType(action.type)
      uses.push(...action.values.map((it) => ({ owner: linked, field: it.field, fieldValue: it.value })))
    }
  }
  return uses
}

export interface RuleUse {
  rule: string
  fieldValue?: FieldValue
}

// Matched by attribute id, so a rule on a child type or one creating linked records counts for the parent's field.
export function ruleUsesOf (state: ModelState, attr: AnyAttribute): RuleUse[] {
  return state.types().flatMap((type) =>
    state.processesOf(type._id).flatMap((doc) => {
      const spec = readRule(readServone(doc).servoneRule)
      if (spec === null) return []
      return fieldUses(state, type, spec)
        .filter((use) => use.owner !== undefined && state.resolveField(use.owner, use.field)?._id === attr._id)
        .map((use) => ({ rule: doc.name, fieldValue: use.fieldValue }))
    })
  )
}

export function ruleNames (uses: RuleUse[]): string {
  return [...new Set(uses.map((it) => quote(it.rule)))].join(', ')
}

export async function loadEmployees (client: ConfigClient, accounts: AccountUuid[]): Promise<Map<AccountUuid, Ref<Employee>>> {
  const employees = new Map<AccountUuid, Ref<Employee>>()
  if (accounts.length === 0) return employees
  const found = await client.findAll(contact.mixin.Employee, { personUuid: { $in: accounts }, active: true })
  for (const employee of found) {
    if (employee.personUuid !== undefined) employees.set(employee.personUuid, employee._id)
  }
  return employees
}

// Two new rules with one name share a slug key, so approving both turns the second into an edit of the first.
// Only earlier changes count: approving the first of two such changes must not be blocked by the second.
async function hasPendingNamesake (ctx: StepContext, typeKey: string, name: string): Promise<boolean> {
  const pending = await findChanges({ client: ctx.client, account: ctx.account }, { status: 'pending', type: typeKey })
  const replanning = ctx.replanning
  return pending
    .filter((change) => replanning === undefined || (change.id !== replanning.id && change.createdOn < replanning.createdOn))
    .some((change) =>
      change.ops.some((it) => it.op === 'setAutomation' && it.type === typeKey && it.automation !== null && sameName(it.automation.name, name))
    )
}

export async function ruleIssues (ctx: StepContext, op: SetAutomationOp): Promise<Issue[]> {
  const { state } = ctx
  const typeIssues = activeTypeIssues(state, op.type)
  if (typeIssues.length > 0) return typeIssues
  const type = mustType(state, op.type)
  if (state.isSystem(type)) {
    return [issue('system-protected', `${quote(state.nameOf(type))} là loại hệ thống; quy tắc tự động chỉ dùng cho biểu mẫu của bạn`)]
  }
  if (!isValidKey(op.key)) {
    return [issue('invalid-input', `Khóa quy tắc "${op.key}" không hợp lệ: chỉ dùng chữ thường không dấu, số, ".", "-", "_"`)]
  }
  const existing = state.resolveRule(type._id, op.key)
  if (existing !== undefined && readRule(readServone(existing).servoneRule) === null) {
    return [issue('not-allowed', `Quy tắc ${quote(existing.name)} được tạo ngoài Studio, không sửa ở đây được`)]
  }
  if (op.automation === null) {
    if (existing !== undefined) return []
    return [issue('not-found', `Không tìm thấy quy tắc "${op.key}" trong ${quote(state.nameOf(type))}`)]
  }
  const spec = op.automation
  const scope: Scope = { state, type }
  const issues = nameIssues(spec.name, 'quy tắc')
  const clash = state.processesOf(type._id).find((it) => state.keyOf(it) !== op.key && sameName(it.name, spec.name))
  if (clash !== undefined) issues.push(issue('duplicate-name', `Đã có quy tắc tên ${quote(clash.name)}`))
  if (existing === undefined && (await hasPendingNamesake(ctx, op.type, spec.name))) {
    issues.push(issue('duplicate-name', 'Đã có quy tắc cùng tên đang chờ duyệt'))
  }
  issues.push(...triggerIssues(scope, spec.trigger), ...listIssues(scope, spec.actions, false))
  const hasApproval = spec.actions.at(-1)?.kind === 'requestApproval'
  for (const branch of [spec.onApproved, spec.onRejected]) {
    if (branch === undefined || branch.length === 0) continue
    if (!hasApproval) {
      issues.push(issue('not-allowed', '"Khi được duyệt" và "Khi bị từ chối" chỉ dùng khi việc cuối là gửi duyệt'))
    }
    issues.push(...listIssues(scope, branch, true))
  }
  issues.push(...selfTriggerIssues(spec))
  if (issues.length > 0) return issues
  const accounts = ruleAccounts(state, type, spec)
  const employees = await loadEmployees(ctx.client, accounts)
  return accounts
    .filter((it) => !employees.has(it))
    .map((it) => issue('not-found', `Không tìm thấy nhân viên đang làm việc có tài khoản ${it}`))
}
