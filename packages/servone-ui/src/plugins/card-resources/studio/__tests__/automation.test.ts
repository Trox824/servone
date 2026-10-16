import type { AutomationAction, AutomationSpec } from '@servone/config'
import {
  actionChoices,
  defaultAction,
  defaultTarget,
  defaultTrigger,
  draftIssues,
  draftOf,
  linkedPeople,
  linkTargets,
  moneyFieldLookup,
  newRuleDraft,
  offsetParts,
  ruleOp,
  ruleRows,
  targetChoices,
  wholeDays,
  withAction,
  withActions,
  withOffset,
  withPeople,
  withTriggerField
} from '../automation'
import { accountId, field, link, recordType, snapshotOf } from './fixtures'

const status = field('trang-thai', 'Trạng thái', { kind: 'select', options: ['Nháp', 'Đã nộp', 'Đã duyệt'] })
const boss = field('truong-phong', 'Trưởng phòng', { kind: 'person' })
const start = field('ngay-bat-dau', 'Ngày bắt đầu', { kind: 'date' })
const advance = field('tam-ung', 'Tạm ứng', { kind: 'money', currency: 'VND' })
const urgent = field('khan', 'Khẩn', { kind: 'boolean' })

const APPROVAL: AutomationSpec = {
  name: 'Duyệt nghỉ phép',
  trigger: { kind: 'created' },
  actions: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }],
  onApproved: [{ kind: 'setField', field: 'trang-thai', value: 'Đã duyệt' }]
}

const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
  fields: [status, boss, start, advance, urgent],
  automations: [
    {
      key: 'duyet',
      name: 'Duyệt nghỉ phép',
      automation: APPROVAL,
      sentences: ['Khi tạo hồ sơ thì gửi duyệt cho người ở trường *Trưởng phòng* (tất cả phải duyệt)']
    },
    { key: 'proc-1', name: 'Quy trình cũ', automation: null, sentences: [] }
  ]
})
const expense = recordType('cong-tac-phi', 'Công tác phí', {
  fields: [field('so-tien', 'Số tiền', { kind: 'money', currency: 'VND' })]
})
const snapshot = snapshotOf({
  types: [leave, expense],
  links: [link('nghi-phep-cong-tac-phi', 'nghi-phep', 'cong-tac-phi', { fromName: 'Công tác phí', toName: 'Đề nghị' })]
})

describe('rule rows and drafts', () => {
  it('lists rules as plain sentences and edits only Studio rules', () => {
    expect(ruleRows(leave)).toEqual([
      {
        key: 'duyet',
        name: 'Duyệt nghỉ phép',
        sentences: ['Khi tạo hồ sơ thì gửi duyệt cho người ở trường Trưởng phòng (tất cả phải duyệt)'],
        isEditable: true
      },
      { key: 'proc-1', name: 'Quy trình cũ', sentences: [], isEditable: false }
    ])
    expect(draftOf(leave.automations[0])).toEqual({
      key: 'duyet',
      name: 'Duyệt nghỉ phép',
      trigger: { kind: 'created' },
      actions: APPROVAL.actions,
      onApproved: APPROVAL.onApproved,
      onRejected: []
    })
    expect(draftOf(leave.automations[1])).toBeUndefined()
  })
})

describe('triggers', () => {
  it('picks usable fields for each trigger', () => {
    expect(defaultTrigger('fieldChanged', snapshot, leave)).toEqual({ kind: 'fieldChanged', field: 'trang-thai', to: 'Nháp' })
    expect(defaultTrigger('date', snapshot, leave)).toEqual({ kind: 'date', field: 'ngay-bat-dau', offsetDays: 0 })
    expect(defaultTrigger('fieldChanged', snapshot, expense)).toBeUndefined()
    expect(withTriggerField({ kind: 'fieldChanged', field: 'trang-thai', to: 'Nháp' }, urgent)).toEqual({
      kind: 'fieldChanged',
      field: 'khan',
      to: true
    })
  })

  it('splits and rebuilds a date offset', () => {
    const trigger = { kind: 'date', field: 'ngay-bat-dau', offsetDays: -3 } as const
    expect(offsetParts(trigger)).toEqual({ days: 3, isBefore: true })
    expect(withOffset(trigger, 5, false)).toEqual({ kind: 'date', field: 'ngay-bat-dau', offsetDays: 5 })
    expect(withOffset(trigger, 2, true)).toEqual({ kind: 'date', field: 'ngay-bat-dau', offsetDays: -2 })
    expect(offsetParts({ kind: 'created' })).toBeUndefined()
    expect([wholeDays(-3), wholeDays(1.5), wholeDays(Number(''))]).toEqual([3, 1, 0])
  })

  it('finds money fields through the parent type', () => {
    const snapshot = snapshotOf({
      types: [recordType('de-nghi', 'Đề nghị', { fields: [advance] }), recordType('nghi-phep', 'Nghỉ phép', { basedOn: 'de-nghi', fields: [urgent] })]
    })
    const isMoneyField = moneyFieldLookup(snapshot)
    expect(isMoneyField('nghi-phep', 'tam-ung')).toBe(true)
    expect(isMoneyField('nghi-phep', 'khan')).toBe(false)
    expect(isMoneyField('khong-co', 'tam-ung')).toBe(false)
  })
})

describe('actions', () => {
  it('offers linked types from both ends of a link', () => {
    expect(linkTargets(snapshot, leave)).toEqual([
      { link: 'nghi-phep-cong-tac-phi', type: 'cong-tac-phi', name: 'Công tác phí', label: 'Công tác phí (Công tác phí)' }
    ])
    expect(linkTargets(snapshot, expense)).toEqual([
      { link: 'nghi-phep-cong-tac-phi', type: 'nghi-phep', name: 'Đề nghị nghỉ phép', label: 'Đề nghị nghỉ phép (Đề nghị)' }
    ])
    expect(defaultAction('createLinked', snapshot, leave)).toEqual({
      kind: 'createLinked',
      type: 'cong-tac-phi',
      link: 'nghi-phep-cong-tac-phi',
      title: 'Công tác phí',
      values: []
    })
  })

  it('keeps a waiting action last and offers approval once', () => {
    const approval = { kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } } as const
    const lock = { kind: 'lockRecord' } as const
    expect(withAction([approval], lock)).toEqual([lock, approval])
    expect(actionChoices([approval], false)).toEqual(['setField', 'createLinked', 'lockField', 'lockRecord'])
    expect(actionChoices([], true)).toEqual(['setField', 'createLinked', 'createTodo', 'lockField', 'lockRecord'])
  })

  it('drops approval branches when the approval goes', () => {
    const draft = { ...newRuleDraft(), actions: APPROVAL.actions, onApproved: [{ kind: 'lockRecord' } as const] }
    expect(withActions(draft, [{ kind: 'lockRecord' }])).toMatchObject({ onApproved: [], onRejected: [] })
    expect(withPeople([accountId('lan'), accountId('minh')], true)).toEqual({ kind: 'people', people: [accountId('minh')] })
  })
})

describe('saving', () => {
  it('builds the operation without empty branches', () => {
    const draft = draftOf(leave.automations[0])
    if (draft === undefined) throw new Error('draft expected')
    expect(ruleOp('nghi-phep', 'duyet', draft)).toEqual({ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL })
  })

  it('reports what the admin still has to fill in', () => {
    const rows = ruleRows(leave)
    expect(draftIssues(newRuleDraft(), rows)).toEqual(['IssueRuleName', 'IssueNoActions'])
    expect(
      draftIssues(
        { ...newRuleDraft(), name: 'duyệt nghỉ phép', actions: [{ kind: 'requestApproval', from: { kind: 'people', people: [] } }] },
        rows
      )
    ).toEqual(['IssueRuleNameTaken', 'IssueNoPeople'])
    const existing = draftOf(leave.automations[0])
    if (existing === undefined) throw new Error('draft expected')
    expect(draftIssues(existing, rows)).toEqual([])
    expect(
      draftIssues(
        {
          ...newRuleDraft(),
          name: 'Khác',
          actions: [
            { kind: 'lockField', fields: [] },
            { kind: 'createTodo', title: ' ', assignee: { kind: 'people', people: [accountId('lan')] } }
          ]
        },
        rows
      )
    ).toEqual(['IssueTodoTitle', 'IssueNoLockFields'])
  })
})

describe('connected-form and creator targets', () => {
  const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép')
  const dept = recordType('phong-ban', 'Phòng ban', { fields: [field('truong-phong', 'Trưởng phòng', { kind: 'person' })] })
  const snapshot = snapshotOf({ types: [leave, dept], links: [link('thuoc', 'nghi-phep', 'phong-ban', { fromName: 'Phòng ban' })] })
  const approval: AutomationAction = { kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }
  const todo: AutomationAction = { kind: 'createTodo', title: 'Sửa', assignee: { kind: 'people', people: [] } }

  it('names each person question on a connected form', () => {
    expect(linkedPeople(snapshot, leave)).toEqual([
      { id: 'thuoc:truong-phong', link: 'thuoc', field: 'truong-phong', form: 'Phòng ban', label: 'Trưởng phòng của phòng ban đã chọn' }
    ])
  })

  it('offers the creator for a task only', () => {
    expect(targetChoices(approval, snapshot, leave)).toEqual(['linked', 'people', 'preset'])
    expect(targetChoices(todo, snapshot, leave)).toEqual(['linked', 'initiator', 'people'])
  })

  it('defaults to the first connected person', () => {
    expect(defaultTarget('linked', snapshot, leave)).toEqual({ kind: 'linked', link: 'thuoc', field: 'truong-phong' })
    expect(defaultTarget('initiator', snapshot, leave)).toEqual({ kind: 'initiator' })
  })
})
