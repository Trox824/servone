import card from '@hcengineering/card'
import core from '@hcengineering/core'
import process, { createContext, type SelectedRelation } from '@hcengineering/process'
import { type CompiledRule, compileRule } from '../automation-compile'
import { loadEmployees, ruleAccounts } from '../automation-validate'
import { toContextId } from '../keys'
import type { AutomationSpec } from '../operations'
import { loadState } from '../state'
import { attributeByKey } from './harness'
import { ADVANCE, APPROVAL, LINKED, type LeaveFixture, leaveFixture, REMINDER, withAccountant, withManagers } from './automation-fixture'

async function compile (fx: LeaveFixture, spec: AutomationSpec): Promise<CompiledRule> {
  const state = await loadState(fx.ws.client)
  const employees = await loadEmployees(fx.ws.client, ruleAccounts(state, fx.type, spec))
  return compileRule({ state, type: fx.type, employees }, spec)
}

function defined<T> (found: T | undefined): T {
  if (found === undefined) throw new Error('Expected the fixture to have it')
  return found
}

async function attr (fx: LeaveFixture, key: string): Promise<string> {
  return (await attributeByKey(fx.ws, fx.type._id, key)).name
}

const route = (compiled: CompiledRule): Array<[string, string | null, string, string]> =>
  compiled.transitions.map((it) => [it.role, it.from, it.to, it.trigger])

describe('compileRule', () => {
  it('runs a created rule once', async () => {
    const fx = await leaveFixture()
    const compiled = await compile(fx, {
      name: 'Nộp',
      trigger: { kind: 'created' },
      actions: [{ kind: 'setField', field: 'trang-thai', value: 'Đã nộp' }, { kind: 'lockRecord' }]
    })
    expect(compiled.states).toEqual([{ role: 'done', title: 'Xong' }])
    expect(route(compiled)).toEqual([['start', null, 'done', process.trigger.OnExecutionStart]])
    expect(compiled.transitions[0].actions).toEqual([
      { _id: 'start_0', context: null, methodId: process.method.UpdateCard, params: { [await attr(fx, 'trang-thai')]: 'Đã nộp' } },
      { _id: 'start_1', context: null, methodId: process.method.LockCard, params: {} }
    ])
  })

  it('waits for the approval and branches on its outcome', async () => {
    const fx = await leaveFixture()
    const compiled = await compile(fx, APPROVAL)
    const status = await attr(fx, 'trang-thai')
    const boss = await attr(fx, 'truong-phong')
    const group = createContext({ type: 'context', id: toContextId('start_approval'), key: '' })
    expect(compiled.states).toEqual([
      { role: 'start_review', title: 'Chờ duyệt' },
      { role: 'start_fill', title: 'Chờ điền thông tin' },
      { role: 'done', title: 'Xong' }
    ])
    expect(route(compiled)).toEqual([
      ['start', null, 'start_fill', process.trigger.OnExecutionStart],
      ['start_ready', 'start_fill', 'start_review', process.trigger.OnCardUpdate],
      ['start_approved', 'start_review', 'done', process.trigger.OnApproveRequestApproved],
      ['start_rejected', 'start_review', 'done', process.trigger.OnApproveRequestRejected]
    ])
    expect(compiled.transitions[0].actions).toEqual([])
    expect(compiled.transitions[1].triggerParams).toEqual({ [boss]: { $ne: null } })
    expect(compiled.transitions[1].actions[1]).toEqual({
      _id: 'start_1',
      context: { _id: 'start_approval', _class: process.class.ApproveRequest },
      methodId: process.method.RequestApproval,
      params: { user: createContext({ type: 'attribute', key: boss }), field: boss }
    })
    expect(compiled.transitions[2].triggerParams).toEqual({ _id: group })
    expect(compiled.transitions[3].triggerParams).toEqual({ _id: group })
    expect(compiled.transitions[2].actions.map((it) => it.methodId)).toEqual([process.method.UpdateCard, process.method.LockCard])
    expect(compiled.transitions[3].actions[0].params).toEqual({ [status]: 'Từ chối' })
  })

  it('sends fixed approvers as employee refs and presets as a role context', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    const people = await compile(fx, {
      name: 'Duyệt',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from: { kind: 'people', people: [fx.lan.account, fx.minh.account] } }]
    })
    expect(people.transitions[0].actions[0].params).toEqual({ user: [fx.lan.person, fx.minh.person] })

    const state = await loadState(fx.ws.client)
    const role = defined(state.roleFor(fx.type._id, 'manager'))
    const preset = await compile(fx, ADVANCE)
    expect(preset.transitions[1].actions[2].params).toEqual({
      user: createContext({
        type: 'function',
        func: process.function.RoleContext,
        key: '',
        functions: [],
        props: { target: role._id }
      })
    })
  })

  it('loops a field rule back to waiting and links the created record', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    const compiled = await compile(fx, ADVANCE)
    const state = await loadState(fx.ws.client)
    const amount = (await attributeByKey(fx.ws, fx.expense._id, 'so-tien')).name
    expect(compiled.states).toEqual([
      { role: 'wait', title: 'Chờ thay đổi' },
      { role: 'main_review', title: 'Chờ duyệt' }
    ])
    expect(route(compiled)).toEqual([
      ['start', null, 'wait', process.trigger.OnExecutionStart],
      ['main', 'wait', 'main_review', process.trigger.WhenFieldChanges],
      ['main_approved', 'main_review', 'wait', process.trigger.OnApproveRequestApproved],
      ['main_rejected', 'main_review', 'wait', process.trigger.OnApproveRequestRejected]
    ])
    expect(compiled.transitions[1].triggerParams).toEqual({ [await attr(fx, 'khan')]: true })
    expect(compiled.transitions[1].actions.slice(0, 2)).toEqual([
      {
        _id: 'main_0',
        context: { _id: 'main_card0', _class: card.class.Card },
        methodId: process.method.CreateCard,
        params: { _class: fx.expense._id, targetClass: fx.expense._id, title: 'Tạm ứng', [amount]: 2000000 }
      },
      {
        _id: 'main_0_link',
        context: { _id: 'main_link0', _class: core.class.Relation },
        methodId: process.method.AddRelation,
        params: {
          association: defined(state.resolveLink('nghi-phep-cong-tac-phi'))._id,
          direction: 'B',
          _id: createContext({ type: 'context', id: toContextId('main_card0'), key: '' })
        }
      }
    ])
  })

  it('waits for the todo before finishing', async () => {
    const fx = await leaveFixture()
    const compiled = await compile(fx, REMINDER)
    const todo = createContext({ type: 'context', id: toContextId('main_todo'), key: '' })
    expect(compiled.states).toEqual([
      { role: 'wait', title: 'Chờ đến ngày' },
      { role: 'start_fill', title: 'Chờ điền thông tin' },
      { role: 'main_todo', title: 'Chờ việc xong' },
      { role: 'done', title: 'Xong' }
    ])
    expect(route(compiled)).toEqual([
      ['start', null, 'start_fill', process.trigger.OnExecutionStart],
      ['start_ready', 'start_fill', 'wait', process.trigger.OnCardUpdate],
      ['main', 'wait', 'main_todo', process.trigger.OnTime],
      ['main_closed', 'main_todo', 'done', process.trigger.OnToDoClose]
    ])
    expect(compiled.transitions[1]).toMatchObject({ triggerParams: { [await attr(fx, 'ngay-bat-dau')]: { $ne: null } }, actions: [] })
    expect(compiled.transitions[2].triggerParams).toEqual({
      value: createContext({
        type: 'attribute',
        key: await attr(fx, 'ngay-bat-dau'),
        functions: [{ func: process.function.Offset, props: { offset: 3, offsetType: 'days', direction: 'before' } }]
      })
    })
    expect(compiled.transitions[2].actions).toEqual([
      {
        _id: 'main_0',
        context: null,
        methodId: process.method.LockField,
        params: { value: [await attr(fx, 'ngay-bat-dau'), await attr(fx, 'tam-ung')] }
      },
      {
        _id: 'main_1',
        context: { _id: 'main_todo', _class: process.class.ProcessToDo },
        methodId: process.method.CreateToDo,
        params: { title: 'Bàn giao công việc', user: fx.lan.person, withRollback: false }
      }
    ])
    expect(compiled.transitions[3].triggerParams).toEqual({ _id: todo })
  })

  it('waits for a todo inside the approval branch and stores people as employees', async () => {
    const fx = await leaveFixture()
    const boss = await attr(fx, 'truong-phong')
    const compiled = await compile(fx, {
      name: 'Bàn giao sau duyệt',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from: { kind: 'people', people: [fx.minh.account] } }],
      onApproved: [
        { kind: 'setField', field: 'truong-phong', value: fx.lan.account },
        { kind: 'createTodo', title: 'Bàn giao', assignee: { kind: 'people', people: [fx.lan.account] } }
      ]
    })
    expect(compiled.states).toEqual([
      { role: 'start_review', title: 'Chờ duyệt' },
      { role: 'start_approved_todo', title: 'Chờ việc xong' },
      { role: 'done', title: 'Xong' }
    ])
    expect(route(compiled)).toEqual([
      ['start', null, 'start_review', process.trigger.OnExecutionStart],
      ['start_approved', 'start_review', 'start_approved_todo', process.trigger.OnApproveRequestApproved],
      ['start_approved_closed', 'start_approved_todo', 'done', process.trigger.OnToDoClose],
      ['start_rejected', 'start_review', 'done', process.trigger.OnApproveRequestRejected]
    ])
    expect(compiled.transitions[1].actions).toEqual([
      { _id: 'start_approved_0', context: null, methodId: process.method.UpdateCard, params: { [boss]: fx.lan.person } },
      {
        _id: 'start_approved_1',
        context: { _id: 'start_approved_todo', _class: process.class.ProcessToDo },
        methodId: process.method.CreateToDo,
        params: { title: 'Bàn giao', user: fx.lan.person, withRollback: false }
      }
    ])
    expect(compiled.transitions[2].triggerParams).toEqual({
      _id: createContext({ type: 'context', id: toContextId('start_approved_todo'), key: '' })
    })
  })

  it('waits for a person field before a field-changed step and a branch that read it', async () => {
    const fx = await leaveFixture()
    const boss = await attr(fx, 'truong-phong')
    const compiled = await compile(fx, {
      name: 'Duyệt khẩn',
      trigger: { kind: 'fieldChanged', field: 'khan', to: true },
      actions: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }],
      onRejected: [{ kind: 'createTodo', title: 'Xem lại', assignee: { kind: 'field', field: 'truong-phong' } }]
    })
    expect(route(compiled)).toEqual([
      ['start', null, 'wait', process.trigger.OnExecutionStart],
      ['main', 'wait', 'main_fill', process.trigger.WhenFieldChanges],
      ['main_ready', 'main_fill', 'main_review', process.trigger.OnCardUpdate],
      ['main_approved', 'main_review', 'wait', process.trigger.OnApproveRequestApproved],
      ['main_rejected', 'main_review', 'main_rejected_fill', process.trigger.OnApproveRequestRejected],
      ['main_rejected_ready', 'main_rejected_fill', 'main_rejected_todo', process.trigger.OnCardUpdate],
      ['main_rejected_closed', 'main_rejected_todo', 'wait', process.trigger.OnToDoClose]
    ])
    expect(compiled.transitions[2]).toMatchObject({
      triggerParams: { [boss]: { $ne: null } },
      actions: [{ _id: 'main_0', context: { _id: 'main_approval', _class: process.class.ApproveRequest } }]
    })
    expect(compiled.transitions[5].actions[0]).toMatchObject({ _id: 'main_rejected_0', methodId: process.method.CreateToDo })
  })

  it('does not wait for a person field the same step fills in', async () => {
    const fx = await leaveFixture()
    const compiled = await compile(fx, {
      name: 'Giao Lan duyệt',
      trigger: { kind: 'created' },
      actions: [
        { kind: 'setField', field: 'truong-phong', value: fx.lan.account },
        { kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }
      ]
    })
    expect(route(compiled)[0]).toEqual(['start', null, 'start_review', process.trigger.OnExecutionStart])
  })

  it('reads a person on the connected record and the record creator', async () => {
    const fx = await leaveFixture()
    await withAccountant(fx)
    const compiled = await compile(fx, LINKED)
    const state = await loadState(fx.ws.client)
    const link = defined(state.resolveLink('nghi-phep-cong-tac-phi'))
    const accountant = (await attributeByKey(fx.ws, fx.expense._id, 'ke-toan')).name
    expect(compiled.states.map((it) => it.title)).toEqual(['Chờ duyệt', 'Xong', 'Chờ việc xong'])
    const relation: SelectedRelation = {
      type: 'relation',
      key: accountant,
      association: link._id,
      direction: 'B',
      name: 'Công tác phí',
      functions: [],
      sourceFunction: { func: process.function.FirstValue, props: {} }
    }
    expect(compiled.transitions[0].actions[0].params).toEqual({ user: createContext(relation) })
    expect(compiled.transitions[2].actions[0].params).toEqual({
      title: 'Sửa lại đề nghị',
      withRollback: false,
      user: createContext({ type: 'function', func: process.function.ExecutionEmployeeInitiator, key: 'user', props: {} })
    })
  })

  it('reads the "one" side of a link as a list for approvals and the first card for a todo', async () => {
    const fx = await leaveFixture()
    const state = await loadState(fx.ws.client)
    const link = defined(state.resolveLink('nghi-phep-cong-tac-phi'))
    const boss = await attr(fx, 'truong-phong')
    const from = { kind: 'linked', link: 'nghi-phep-cong-tac-phi', field: 'truong-phong' } as const
    const compiled = compileRule(
      { state, type: fx.expense, employees: new Map() },
      {
        name: 'Duyệt chi',
        trigger: { kind: 'created' },
        actions: [{ kind: 'requestApproval', from }],
        onRejected: [{ kind: 'createTodo', title: 'Xem lại', assignee: from }]
      }
    )
    const relation: SelectedRelation = {
      type: 'relation',
      key: boss,
      association: link._id,
      direction: 'A',
      name: 'Đề nghị',
      functions: []
    }
    expect(compiled.transitions[0].actions[0].params).toEqual({ user: createContext(relation) })
    expect(compiled.transitions[2].actions[0].params).toEqual({
      title: 'Xem lại',
      withRollback: false,
      user: createContext({ ...relation, sourceFunction: { func: process.function.FirstValue, props: {} } })
    })
  })
})
