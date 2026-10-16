import type { AutomationInfo } from '@servone/config'
import { draftOf } from '../../automation'
import { accountId, field, link, recordType, snapshotOf, space } from '../../__tests__/fixtures'
import { approverChoices, approverGroupLabel, approverOf, choiceIdOf, triggerChoices, withApproverChoice } from '../approval'

const ask: AutomationInfo = {
  key: 'xin',
  name: 'Xin nghỉ',
  sentences: [],
  automation: {
    name: 'Xin nghỉ',
    trigger: { kind: 'created' },
    actions: [{ kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }],
    onRejected: [{ kind: 'createTodo', title: 'Sửa lại', assignee: { kind: 'initiator' } }]
  }
}
const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
  fields: [field('ban-giao', 'Người bàn giao', { kind: 'person' }), field('ngay', 'Từ ngày', { kind: 'date' })],
  access: [{ space: 's1', viewer: [], editor: [], manager: [accountId('u1'), accountId('u2')] }],
  automations: [ask]
})
const dept = recordType('phong-ban', 'Phòng ban', { fields: [field('truong-phong', 'Trưởng phòng', { kind: 'person' })] })
const snapshot = snapshotOf({
  types: [leave, dept],
  spaces: [space('s1', 'Nhân sự')],
  links: [link('thuoc', 'nghi-phep', 'phong-ban', { fromName: 'Phòng ban' })]
})

describe('approverChoices', () => {
  it('lists question, connected form, role and named people, in that order', () => {
    expect(approverChoices(snapshot, leave).map((it) => [it.group, it.label, it.hint])).toEqual([
      ['question', 'Người bàn giao', 'câu hỏi'],
      ['linked', 'Trưởng phòng của phòng ban đã chọn', 'Phòng ban'],
      ['role', 'Người xem', '0 người'],
      ['role', 'Người nhập', '0 người'],
      ['role', 'Người quản lý', '2 người'],
      ['people', 'Chọn người…', '']
    ])
  })

  it('names the groups in plain words', () => {
    expect(approverGroupLabel('question', leave)).toBe('Từ câu hỏi trong đề nghị nghỉ phép')
    expect(approverGroupLabel('role', leave)).toBe('Theo vai trò trong không gian')
  })

  it('finds the current choice by its target', () => {
    const linked = { kind: 'linked', link: 'thuoc', field: 'truong-phong' } as const
    expect(approverChoices(snapshot, leave).find((it) => it.id === choiceIdOf(linked))?.label).toBe('Trưởng phòng của phòng ban đã chọn')
  })
})

describe('withApproverChoice', () => {
  const draft = draftOf(ask)
  if (draft === undefined) throw new Error('editable rule expected')

  it('changes only the approval, not the rejected path', () => {
    const next = withApproverChoice(draft, { kind: 'field', field: 'ban-giao' })
    expect(approverOf(next)).toEqual({ kind: 'field', field: 'ban-giao' })
    expect(next.onRejected).toEqual(draft.onRejected)
    expect(approverOf(draft)).toEqual({ kind: 'preset', preset: 'manager' })
  })
})

describe('triggerChoices', () => {
  it('reads each usable start as the words after "Khi"', () => {
    expect(triggerChoices(snapshot, leave).map((it) => it.label)).toEqual(['tạo Đề nghị nghỉ phép', 'đến ngày Từ ngày'])
  })
})
