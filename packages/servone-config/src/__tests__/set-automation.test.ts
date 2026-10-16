import core, { type Doc, type Tx, type TxCUD } from '@hcengineering/core'
import process from '@hcengineering/process'
import { isSensitiveAutomation, readRule } from '../automation'
import { applyChange, approveChange, saveDraft, undoChange } from '../changes'
import type { AutomationSpec, Operation } from '../operations'
import { parseOperations, parseOperationsJson, plan } from '../plan'
import { readServone } from '../servone-fields'
import { addCard, addExecution, applyOps, ruleDocs, type RuleDocs, sessionFor } from './harness'
import { ADVANCE, APPROVAL, type LeaveFixture, leaveFixture, SUBMITTED, withManagers } from './automation-fixture'

const isCud = (tx: Tx): tx is TxCUD<Doc> => 'objectClass' in tx
const roleOf = (doc: Doc): string | undefined => readServone(doc).servoneKey

function stateOf (docs: RuleDocs, role: string): RuleDocs['states'][number] {
  const found = docs.states.find((it) => roleOf(it) === role)
  if (found === undefined) throw new Error(`No state ${role}`)
  return found
}

async function ruleDocsAfter (fx: LeaveFixture, spec: AutomationSpec): Promise<RuleDocs> {
  await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: spec }])
  return await ruleDocs(fx.ws, fx.type._id, 'duyet')
}

describe('setAutomation', () => {
  it('writes the process the way the process editor does', async () => {
    const fx = await leaveFixture()
    const planned = await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }])
    expect(planned.risk).toBe('sensitive')
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Thêm quy tắc *Duyệt nghỉ phép* cho *Đề nghị nghỉ phép*',
      'Khi tạo hồ sơ thì đặt *Trạng thái* = "Đã nộp", gửi duyệt cho người ở trường *Trưởng phòng* (tất cả phải duyệt)',
      'Khi được duyệt thì đặt *Trạng thái* = "Đã duyệt", khóa hồ sơ',
      'Khi bị từ chối thì đặt *Trạng thái* = "Từ chối"'
    ])
    expect(planned.inverse).toEqual([{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: null }])

    const { rule, states, transitions } = await ruleDocs(fx.ws, fx.type._id, 'duyet')
    expect(rule).toMatchObject({
      name: 'Duyệt nghỉ phép',
      description:
        'Khi tạo hồ sơ thì đặt Trạng thái = "Đã nộp", gửi duyệt cho người ở trường Trưởng phòng (tất cả phải duyệt) ' +
        'Khi được duyệt thì đặt Trạng thái = "Đã duyệt", khóa hồ sơ Khi bị từ chối thì đặt Trạng thái = "Từ chối"',
      masterTag: fx.type._id,
      autoStart: true,
      automationOnly: true,
      context: {},
      space: core.space.Model
    })
    expect(readRule(readServone(rule).servoneRule)).toEqual(APPROVAL)
    expect(states.map((it) => [roleOf(it), it.title, it.process])).toEqual([
      ['start_review', 'Chờ duyệt', rule._id],
      ['start_fill', 'Chờ điền thông tin', rule._id],
      ['done', 'Xong', rule._id]
    ])
    const [review, fill, done] = states
    expect(transitions.map((it) => [roleOf(it), it.from, it.to, it.trigger])).toEqual([
      ['start', null, fill._id, process.trigger.OnExecutionStart],
      ['start_ready', fill._id, review._id, process.trigger.OnCardUpdate],
      ['start_approved', review._id, done._id, process.trigger.OnApproveRequestApproved],
      ['start_rejected', review._id, done._id, process.trigger.OnApproveRequestRejected]
    ])
  })

  it('changes the approver in place', async () => {
    const fx = await leaveFixture()
    const byLan: AutomationSpec = {
      ...APPROVAL,
      actions: [APPROVAL.actions[0], { kind: 'requestApproval', from: { kind: 'people', people: [fx.lan.account] } }]
    }
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: byLan }])
    const before = await ruleDocs(fx.ws, fx.type._id, 'duyet')
    const mark = fx.ws.sent.length

    const changed: AutomationSpec = {
      ...APPROVAL,
      actions: [APPROVAL.actions[0], { kind: 'requestApproval', from: { kind: 'people', people: [fx.minh.account] } }]
    }
    const planned = await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: changed }])
    expect(planned.inverse).toEqual([{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: byLan }])

    const after = await ruleDocs(fx.ws, fx.type._id, 'duyet')
    const ids = (docs: RuleDocs): string[] => [docs.rule._id, ...docs.states.map((it) => it._id), ...docs.transitions.map((it) => it._id)]
    expect(ids(after)).toEqual(ids(before))
    expect(
      fx.ws.sent
        .slice(mark)
        .filter(isCud)
        .map((it) => [it._class, it.objectClass])
    ).toEqual([
      [core.class.TxUpdateDoc, process.class.Process],
      [core.class.TxUpdateDoc, process.class.Transition]
    ])
    const start = after.transitions[0]
    expect(start.actions[1]).toMatchObject({
      _id: 'start_1',
      context: { _id: 'start_approval', _class: process.class.ApproveRequest },
      params: { user: [fx.minh.person] }
    })
    expect(after.transitions[1].triggerParams).toEqual(before.transitions[1].triggerParams)
  })

  it('keeps records already waiting for approval when the rule gains the fill step', async () => {
    const fx = await leaveFixture()
    const byLan: AutomationSpec = {
      ...APPROVAL,
      actions: [APPROVAL.actions[0], { kind: 'requestApproval', from: { kind: 'people', people: [fx.lan.account] } }]
    }
    const docs = await ruleDocsAfter(fx, byLan)
    await addExecution(fx.ws, docs.rule._id, await addCard(fx.ws, fx.type._id, fx.space), fx.space, stateOf(docs, 'start_review')._id)
    const planned = await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }])
    expect(planned.diff.some((it) => it.affected !== undefined)).toBe(false)
  })

  it('counts records waiting for a field when the rule stops reading it', async () => {
    const fx = await leaveFixture()
    const docs = await ruleDocsAfter(fx, APPROVAL)
    await addExecution(fx.ws, docs.rule._id, await addCard(fx.ws, fx.type._id, fx.space), fx.space, stateOf(docs, 'start_fill')._id)
    const byMinh: AutomationSpec = {
      ...APPROVAL,
      actions: [APPROVAL.actions[0], { kind: 'requestApproval', from: { kind: 'people', people: [fx.minh.account] } }]
    }
    const planned = await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: byMinh }])
    expect(planned.diff.at(-1)).toEqual({
      text: '1 hồ sơ đang chạy quy tắc này sẽ dừng ở bước bị bỏ hoặc đổi điều kiện',
      risk: 'destructive',
      affected: 1
    })
  })

  it('routes approval and money rules to a second maintainer', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    const riskOf = async (automation: AutomationSpec | null, key = 'quy-tac'): Promise<string> =>
      (await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key, automation }])).risk
    expect(await riskOf(SUBMITTED)).toBe('safe')
    expect(await riskOf({ ...SUBMITTED, actions: [{ kind: 'setField', field: 'tam-ung', value: 500000 }] })).toBe('sensitive')
    expect(await riskOf({ ...ADVANCE, actions: [ADVANCE.actions[0]] })).toBe('sensitive')
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }])
    expect(await riskOf(null, 'duyet')).toBe('sensitive')
  })

  it('lists the linked record type among the changed types', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    const planned = await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'tam-ung', automation: ADVANCE }])
    expect(planned.typeKeys).toEqual(['nghi-phep', 'cong-tac-phi'])
  })

  it('reads money fields through the caller lookup', () => {
    const isMoney = (typeKey: string, fieldKey: string): boolean => `${typeKey}.${fieldKey}` === 'cong-tac-phi.so-tien'
    expect(isSensitiveAutomation('nghi-phep', SUBMITTED, isMoney)).toBe(false)
    expect(isSensitiveAutomation('nghi-phep', APPROVAL, isMoney)).toBe(true)
    expect(isSensitiveAutomation('nghi-phep', { ...ADVANCE, actions: [ADVANCE.actions[0]] }, isMoney)).toBe(true)
    expect(isSensitiveAutomation('cong-tac-phi', { ...SUBMITTED, actions: [{ kind: 'setField', field: 'so-tien', value: 1 }] }, isMoney)).toBe(
      true
    )
  })

  it('counts records stopped by a removed step', async () => {
    const fx = await leaveFixture()
    const todoRule: AutomationSpec = {
      name: 'Việc khi nộp',
      trigger: { kind: 'fieldChanged', field: 'trang-thai', to: 'Đã nộp' },
      actions: [{ kind: 'createTodo', title: 'Kiểm tra đơn', assignee: { kind: 'field', field: 'truong-phong' } }]
    }
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'viec', automation: todoRule }])
    const docs = await ruleDocs(fx.ws, fx.type._id, 'viec')
    await addExecution(fx.ws, docs.rule._id, await addCard(fx.ws, fx.type._id, fx.space), fx.space, stateOf(docs, 'main_todo')._id)
    await addExecution(fx.ws, docs.rule._id, await addCard(fx.ws, fx.type._id, fx.space), fx.space, stateOf(docs, 'wait')._id)

    const simpler = await plan(fx.session, [
      {
        op: 'setAutomation',
        type: 'nghi-phep',
        key: 'viec',
        automation: { ...todoRule, actions: [{ kind: 'setField', field: 'khan', value: true }] }
      }
    ])
    expect(simpler.risk).toBe('destructive')
    expect(simpler.diff.at(-1)).toEqual({ text: '1 hồ sơ đang chạy quy tắc này sẽ dừng ở bước bị bỏ hoặc đổi điều kiện', risk: 'destructive', affected: 1 })

    const removal = await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'viec', automation: null }])
    expect(removal.diff).toEqual([
      { text: 'Xóa quy tắc *Việc khi nộp* khỏi *Đề nghị nghỉ phép*', risk: 'destructive' },
      { text: '2 hồ sơ đang chạy quy tắc này sẽ dừng ở bước bị bỏ hoặc đổi điều kiện', risk: 'destructive', affected: 2 }
    ])
  })

  it('counts records waiting on a trigger that changed kind', async () => {
    const fx = await leaveFixture()
    const onDate = { kind: 'date', field: 'ngay-bat-dau', offsetDays: 0 } as const
    const dated: AutomationSpec = { name: 'Khóa khi đến ngày', trigger: onDate, actions: [{ kind: 'lockRecord' }] }
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'khoa', automation: dated }])
    const docs = await ruleDocs(fx.ws, fx.type._id, 'khoa')
    await addExecution(fx.ws, docs.rule._id, await addCard(fx.ws, fx.type._id, fx.space), fx.space, stateOf(docs, 'wait')._id)

    const sameKind = await plan(fx.session, [
      { op: 'setAutomation', type: 'nghi-phep', key: 'khoa', automation: { ...dated, trigger: { ...onDate, offsetDays: 2 } } }
    ])
    expect(sameKind.risk).toBe('safe')
    const onChange = await plan(fx.session, [
      { op: 'setAutomation', type: 'nghi-phep', key: 'khoa', automation: { ...dated, trigger: { kind: 'fieldChanged', field: 'khan', to: true } } }
    ])
    expect(onChange.diff.at(-1)).toEqual({
      text: '1 hồ sơ đang chạy quy tắc này sẽ dừng ở bước bị bỏ hoặc đổi điều kiện',
      risk: 'destructive',
      affected: 1
    })
  })

  it('confirms stopped records even when the rule change is sensitive', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }])
    const docs = await ruleDocs(fx.ws, fx.type._id, 'duyet')
    await addExecution(fx.ws, docs.rule._id, await addCard(fx.ws, fx.type._id, fx.space), fx.space, stateOf(docs, 'start_review')._id)

    const withoutApproval: AutomationSpec = { ...SUBMITTED, name: APPROVAL.name }
    const planned = await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: withoutApproval }])
    expect(planned.risk).toBe('sensitive')
    expect(planned.diff.at(-1)).toEqual({ text: '1 hồ sơ đang chạy quy tắc này sẽ dừng ở bước bị bỏ hoặc đổi điều kiện', risk: 'destructive', affected: 1 })

    const draft = await saveDraft(fx.session, planned)
    expect((await applyChange(fx.session, draft.id)).kind).toBe('needsConfirm')
    expect((await applyChange(fx.session, draft.id, { isConfirmed: true })).kind).toBe('pendingApproval')
  })

  it('removes a rule and undoes it through the change log', async () => {
    const fx = await leaveFixture()
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'nop', automation: SUBMITTED }])
    const { rule } = await ruleDocs(fx.ws, fx.type._id, 'nop')
    const draft = await saveDraft(fx.session, await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'nop', automation: null }]))
    expect((await applyChange(fx.session, draft.id)).kind).toBe('applied')
    expect(await fx.ws.client.findAll(process.class.Process, { masterTag: fx.type._id })).toHaveLength(0)
    expect(await fx.ws.client.findAll(process.class.State, { process: rule._id })).toHaveLength(0)
    expect(await fx.ws.client.findAll(process.class.Transition, { process: rule._id })).toHaveLength(0)

    expect((await undoChange(fx.session, draft.id)).kind).toBe('applied')
    const restored = await ruleDocs(fx.ws, fx.type._id, 'nop')
    expect(readRule(readServone(restored.rule).servoneRule)).toEqual(SUBMITTED)
  })

  it('undoes an edit in place, back to the old rule', async () => {
    const fx = await leaveFixture()
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'nop', automation: SUBMITTED }])
    const before = await ruleDocs(fx.ws, fx.type._id, 'nop')
    const edited: AutomationSpec = { ...SUBMITTED, actions: [{ kind: 'setField', field: 'trang-thai', value: 'Nháp' }] }
    const draft = await saveDraft(fx.session, await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'nop', automation: edited }]))
    expect((await applyChange(fx.session, draft.id)).kind).toBe('applied')

    expect((await undoChange(fx.session, draft.id)).kind).toBe('applied')
    const after = await ruleDocs(fx.ws, fx.type._id, 'nop')
    expect(readRule(readServone(after.rule).servoneRule)).toEqual(SUBMITTED)
    const ids = (docs: RuleDocs): string[] => [docs.rule._id, ...docs.states.map((it) => it._id), ...docs.transitions.map((it) => it._id)]
    expect(ids(after)).toEqual(ids(before))
  })

  it('sends the undo of an approval rule to a second maintainer', async () => {
    const fx = await leaveFixture()
    const draft = await saveDraft(fx.session, await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }]))
    expect((await applyChange(fx.session, draft.id)).kind).toBe('pendingApproval')
    expect((await approveChange(sessionFor(fx.ws, 'hoa'), draft.id)).kind).toBe('applied')

    expect((await undoChange(fx.session, draft.id)).kind).toBe('pendingApproval')
    expect(await fx.ws.client.findAll(process.class.Process, { masterTag: fx.type._id })).toHaveLength(1)
  })

  it('returns the waiting undo when undo is pressed again', async () => {
    const fx = await leaveFixture()
    const approver = sessionFor(fx.ws, 'hoa')
    const add = await saveDraft(fx.session, await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }]))
    await applyChange(fx.session, add.id)
    await approveChange(approver, add.id)
    const remove = await saveDraft(fx.session, await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: null }]))
    await applyChange(fx.session, remove.id)
    await approveChange(approver, remove.id)

    const first = await undoChange(fx.session, remove.id)
    expect(first.kind).toBe('pendingApproval')
    const again = await undoChange(fx.session, remove.id)
    expect(again).toMatchObject({ kind: 'pendingApproval', change: { id: first.change.id } })
  })

  it('refuses removing a field or option a rule uses', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    await applyOps(fx.session, [
      { op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL },
      { op: 'setAutomation', type: 'nghi-phep', key: 'tam-ung', automation: ADVANCE }
    ])
    const issuesOf = async (ops: Operation[]): Promise<string[]> => (await plan(fx.session, ops)).issues.map((it) => it.message)
    expect(await issuesOf([{ op: 'removeField', type: 'nghi-phep', field: 'truong-phong' }])).toEqual([
      'Trường *Trưởng phòng* đang được dùng trong quy tắc *Duyệt nghỉ phép*'
    ])
    expect(await issuesOf([{ op: 'removeField', type: 'cong-tac-phi', field: 'so-tien' }])).toEqual([
      'Trường *Số tiền* đang được dùng trong quy tắc *Tạm ứng công tác*'
    ])
    expect(await issuesOf([{ op: 'removeField', type: 'nghi-phep', field: 'tam-ung' }])).toEqual([])
    expect(await issuesOf([{ op: 'setOptions', type: 'nghi-phep', field: 'trang-thai', options: [{ remove: 'Từ chối' }] }])).toEqual([
      'Lựa chọn *Từ chối* đang được dùng trong quy tắc *Duyệt nghỉ phép*'
    ])
    expect(await issuesOf([{ op: 'setOptions', type: 'nghi-phep', field: 'trang-thai', options: [{ remove: 'Nháp' }] }])).toEqual([])
    expect(
      await issuesOf([
        { op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: null },
        { op: 'removeField', type: 'nghi-phep', field: 'truong-phong' }
      ])
    ).toEqual([])
  })

  it('reads the operation from MCP JSON', () => {
    const op = { op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }
    expect(parseOperationsJson(JSON.stringify([op]))).toEqual({ ops: [op], issues: [] })
    expect(parseOperations([{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: null }])).toEqual({
      ops: [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: null }],
      issues: []
    })
  })
})
