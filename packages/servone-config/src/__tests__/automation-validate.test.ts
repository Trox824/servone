import card from '@hcengineering/card'
import { ruleIssues } from '../automation-validate'
import { applyChange, approveChange, saveDraft } from '../changes'
import { toAccountUuid } from '../keys'
import { plan } from '../plan'
import type { AutomationSpec, PersonTarget } from '../operations'
import type { IssueCode } from '../types'
import { addProcess, applyOps, sessionFor } from './harness'
import { ADVANCE, APPROVAL, LINKED, type LeaveFixture, leaveFixture, REMINDER, stepContext, withAccountant, withManagers } from './automation-fixture'

async function issuesOf (fx: LeaveFixture, automation: AutomationSpec | null, key = 'quy-tac', type = 'nghi-phep'): Promise<IssueCode[]> {
  const ctx = await stepContext(fx.session)
  return (await ruleIssues(ctx, { op: 'setAutomation', type, key, automation })).map((it) => it.code)
}

describe('ruleIssues', () => {
  it('accepts valid rules', async () => {
    const fx = await leaveFixture()
    await withManagers(fx)
    expect(await issuesOf(fx, APPROVAL)).toEqual([])
    expect(await issuesOf(fx, REMINDER)).toEqual([])
    expect(await issuesOf(fx, ADVANCE)).toEqual([])
  })

  it('refuses a waiting action that is not last', async () => {
    const fx = await leaveFixture()
    expect(
      await issuesOf(fx, {
        name: 'Sai thứ tự',
        trigger: { kind: 'created' },
        actions: [
          { kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } },
          { kind: 'setField', field: 'khan', value: true }
        ]
      })
    ).toEqual(['not-allowed'])
    expect(
      await issuesOf(fx, { ...APPROVAL, onApproved: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }] })
    ).toEqual(['not-allowed'])
    expect(
      await issuesOf(fx, {
        name: 'Không duyệt',
        trigger: { kind: 'created' },
        actions: [{ kind: 'setField', field: 'khan', value: true }],
        onApproved: [{ kind: 'lockRecord' }]
      })
    ).toEqual(['not-allowed'])
  })

  it('checks fields, values and trigger kinds', async () => {
    const fx = await leaveFixture()
    const rule = (patch: Partial<AutomationSpec>): AutomationSpec => ({ ...APPROVAL, onApproved: [], onRejected: [], ...patch })
    expect(await issuesOf(fx, rule({ actions: [{ kind: 'setField', field: 'khong-co', value: 'x' }] }))).toEqual(['not-found'])
    expect(await issuesOf(fx, rule({ actions: [{ kind: 'setField', field: 'khan', value: 'x' }] }))).toEqual(['invalid-input'])
    expect(await issuesOf(fx, rule({ actions: [{ kind: 'setField', field: 'trang-thai', value: 'Hủy' }] }))).toEqual(['bad-option'])
    expect(await issuesOf(fx, rule({ trigger: { kind: 'fieldChanged', field: 'tam-ung', to: 1 } }))).toEqual(['unsupported'])
    expect(await issuesOf(fx, rule({ trigger: { kind: 'date', field: 'khan', offsetDays: 1 } }))).toEqual(['unsupported'])
    expect(await issuesOf(fx, rule({ trigger: { kind: 'date', field: 'ngay-bat-dau', offsetDays: 400 } }))).toEqual(['invalid-input'])
    expect(await issuesOf(fx, rule({ actions: [] }))).toEqual(['invalid-input'])
    // an action that resets the trigger field to the value being watched would re-fire WhenFieldChanges forever.
    expect(
      await issuesOf(
        fx,
        rule({
          trigger: { kind: 'fieldChanged', field: 'khan', to: true },
          actions: [{ kind: 'setField', field: 'khan', value: true }]
        })
      )
    ).toEqual(['not-allowed'])
    expect(
      await issuesOf(
        fx,
        rule({
          trigger: { kind: 'fieldChanged', field: 'khan', to: true },
          onApproved: [{ kind: 'setField', field: 'khan', value: true }]
        })
      )
    ).toEqual(['not-allowed'])
  })

  it('refuses a new rule named like one waiting for approval', async () => {
    const fx = await leaveFixture()
    const draft = await saveDraft(fx.session, await plan(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }]))
    expect((await applyChange(fx.session, draft.id)).kind).toBe('pendingApproval')

    expect(await issuesOf(fx, { ...REMINDER, name: ' duyệt nghỉ phép ' }, 'duyet-2')).toEqual(['duplicate-name'])
    expect(await issuesOf(fx, REMINDER, 'nhac')).toEqual([])
    expect((await approveChange(sessionFor(fx.ws, 'hoa'), draft.id)).kind).toBe('applied')
  })

  it('refuses people without an employee record', async () => {
    const fx = await leaveFixture()
    const ghost = toAccountUuid('ghost-uuid')
    const approveBy = (from: AutomationSpec['actions'][number]): AutomationSpec => ({
      name: 'Duyệt',
      trigger: { kind: 'created' },
      actions: [from]
    })
    expect(await issuesOf(fx, approveBy({ kind: 'requestApproval', from: { kind: 'people', people: [ghost] } }))).toEqual(['not-found'])
    expect(await issuesOf(fx, approveBy({ kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }))).toEqual([
      'not-found'
    ])
    expect(
      await issuesOf(
        fx,
        approveBy({ kind: 'createTodo', title: 'Việc', assignee: { kind: 'people', people: [fx.lan.account, fx.minh.account] } })
      )
    ).toEqual(['invalid-input'])
    expect(
      await issuesOf(fx, approveBy({ kind: 'createTodo', title: 'Việc', assignee: { kind: 'preset', preset: 'manager' } }))
    ).toEqual(['unsupported'])
  })

  it('checks links, keys, names and who owns the process', async () => {
    const fx = await leaveFixture()
    await applyOps(fx.session, [{ op: 'createType', key: 'khach-hang', name: 'Khách hàng' }])
    expect(
      await issuesOf(fx, {
        name: 'Sai liên kết',
        trigger: { kind: 'created' },
        actions: [{ kind: 'createLinked', type: 'khach-hang', link: 'nghi-phep-cong-tac-phi', title: 'KH', values: [] }]
      })
    ).toEqual(['not-allowed'])
    expect(await issuesOf(fx, APPROVAL, 'Quy Tắc')).toEqual(['invalid-input'])
    expect(await issuesOf(fx, APPROVAL, 'quy-tac', card.types.Document)).toEqual(['system-protected'])
    expect(await issuesOf(fx, null, 'khong-co')).toEqual(['not-found'])

    const handMade = await addProcess(fx.ws, fx.type._id, 'Quy trình cũ')
    expect(await issuesOf(fx, APPROVAL, handMade)).toEqual(['not-allowed'])
  })

  it('checks approvers on a connected form and the record creator', async () => {
    const fx = await leaveFixture()
    await withAccountant(fx)
    await applyOps(fx.session, [{ op: 'createType', key: 'khach-hang', name: 'Khách hàng' }])
    const approveBy = (from: PersonTarget): AutomationSpec => ({
      name: 'Duyệt',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from }]
    })
    const linked = (link: string, field: string): PersonTarget => ({ kind: 'linked', link, field })
    expect(await issuesOf(fx, LINKED)).toEqual([])
    expect(await issuesOf(fx, approveBy(linked('khong-co', 'ke-toan')))).toEqual(['not-found'])
    expect(await issuesOf(fx, approveBy(linked('nghi-phep-cong-tac-phi', 'khong-co')))).toEqual(['not-found'])
    expect(await issuesOf(fx, approveBy(linked('nghi-phep-cong-tac-phi', 'so-tien')))).toEqual(['invalid-input'])
    expect(await issuesOf(fx, approveBy(linked('nghi-phep-cong-tac-phi', 'ke-toan')), 'quy-tac', 'khach-hang')).toEqual([
      'not-allowed'
    ])
    expect(
      await issuesOf(fx, {
        name: 'Việc',
        trigger: { kind: 'created' },
        actions: [{ kind: 'createTodo', title: 'Sửa', assignee: { kind: 'initiator' } }]
      })
    ).toEqual([])
  })

  it('keeps a field on the connected form while a rule reads it', async () => {
    const fx = await leaveFixture()
    await withAccountant(fx)
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: LINKED }])
    const planned = await plan(fx.session, [{ op: 'removeField', type: 'cong-tac-phi', field: 'ke-toan' }])
    expect(planned.issues.map((it) => it.code)).toEqual(['not-allowed'])
  })
})
