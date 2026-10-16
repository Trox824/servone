import type { AutomationAction } from '@servone/config'
import { accountId, field, link, recordType, snapshotOf } from '../../__tests__/fixtures'
import { actionPhrase, approverPhrase, landingState, questionKindLabel, triggerPhrase, waitingState } from '../phrases'

const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
  fields: [
    field('truong-phong', 'Trưởng phòng', { kind: 'person' }),
    field('trang-thai', 'Trạng thái', { kind: 'select', options: ['Nháp', 'Đã nộp'] }),
    field('ngay', 'Ngày bắt đầu', { kind: 'date' }),
    field('so-ngay', 'Số ngày nghỉ', { kind: 'number' })
  ]
})
const advance = recordType('tam-ung', 'Tạm ứng')
const snapshot = snapshotOf({ types: [leave, advance] })

describe('phrases', () => {
  it('names approvers the way the form map shows them', () => {
    expect(approverPhrase(snapshot, leave, { kind: 'field', field: 'truong-phong' })).toBe('Trưởng phòng')
    expect(approverPhrase(snapshot, leave, { kind: 'people', people: [accountId('u1'), accountId('u2')] })).toBe('2 người')
    expect(approverPhrase(snapshot, leave, { kind: 'preset', preset: 'manager' })).toBe('Người quản lý')
  })

  it('reads triggers as the words after "Khi"', () => {
    expect(triggerPhrase(snapshot, leave, { kind: 'created' })).toBe('tạo Đề nghị nghỉ phép')
    expect(triggerPhrase(snapshot, leave, { kind: 'fieldChanged', field: 'trang-thai', to: 'Đã nộp' })).toBe(
      'Trạng thái đổi thành "Đã nộp"'
    )
    expect(triggerPhrase(snapshot, leave, { kind: 'date', field: 'ngay', offsetDays: 0 })).toBe('đến ngày Ngày bắt đầu')
    expect(triggerPhrase(snapshot, leave, { kind: 'date', field: 'ngay', offsetDays: -3 })).toBe('3 ngày trước Ngày bắt đầu')
  })

  it('reads each step as one short sentence', () => {
    const steps: AutomationAction[] = [
      { kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } },
      { kind: 'setField', field: 'so-ngay', value: 2 },
      { kind: 'setField', field: 'truong-phong', value: null },
      { kind: 'createLinked', type: 'tam-ung', link: 'l1', title: ' Tạm ứng ', values: [] },
      { kind: 'createTodo', title: 'Bàn giao', assignee: { kind: 'field', field: 'truong-phong' } },
      { kind: 'lockField', fields: ['ngay', 'so-ngay'] },
      { kind: 'lockRecord' }
    ]
    expect(steps.map((it) => actionPhrase(snapshot, leave, it))).toEqual([
      'Gửi duyệt cho Người quản lý',
      'Đặt Số ngày nghỉ = 2',
      'Xóa Trưởng phòng',
      'Tạo Tạm ứng "Tạm ứng"',
      'Giao việc "Bàn giao" cho Trưởng phòng',
      'Khóa câu hỏi Ngày bắt đầu, Số ngày nghỉ',
      'Khóa Đề nghị nghỉ phép, không sửa được nữa'
    ])
  })

  it('names the state the engine parks the card in', () => {
    const lock: AutomationAction[] = [{ kind: 'lockRecord' }]
    expect(landingState({ kind: 'created' }, lock)).toBe('Xong')
    expect(landingState({ kind: 'date', field: 'ngay', offsetDays: 0 }, lock)).toBe('Xong')
    expect(landingState({ kind: 'fieldChanged', field: 'trang-thai', to: 'Đã nộp' }, lock)).toBe('Chờ thay đổi')
    expect(landingState({ kind: 'created' }, [])).toBe('Xong')
    expect(landingState({ kind: 'created' }, [{ kind: 'createTodo', title: 'x', assignee: { kind: 'people', people: [] } }])).toBe(
      'Chờ việc xong'
    )
    expect(landingState({ kind: 'created' }, [{ kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }])).toBe(
      'Chờ duyệt'
    )
    expect(waitingState({ kind: 'date', field: 'ngay', offsetDays: 0 })).toBe('Chờ đến ngày')
    expect(waitingState({ kind: 'fieldChanged', field: 'trang-thai', to: 'Đã nộp' })).toBe('Chờ thay đổi')
    expect(waitingState({ kind: 'created' })).toBeUndefined()
  })

  it('uses the nine stock answer words and shows money as a number', () => {
    expect(questionKindLabel('longText')).toBe('Đoạn văn')
    expect(questionKindLabel('money')).toBe('Số')
    expect(questionKindLabel('autoNumber')).toBe('Mã số')
    expect(questionKindLabel('reference')).toBe('Chọn từ biểu mẫu khác')
  })
})

describe('approverPhrase for connected forms and the creator', () => {
  const dept = recordType('phong-ban', 'Phòng ban', { fields: [field('truong-phong', 'Trưởng phòng', { kind: 'person' })] })
  const linkedSnapshot = snapshotOf({ types: [leave, dept], links: [link('thuoc', 'nghi-phep', 'phong-ban')] })

  it('reads a connected person and the creator', () => {
    expect(approverPhrase(linkedSnapshot, leave, { kind: 'linked', link: 'thuoc', field: 'truong-phong' })).toBe(
      'Trưởng phòng của phòng ban đã chọn'
    )
    expect(approverPhrase(linkedSnapshot, leave, { kind: 'initiator' })).toBe('người tạo')
  })
})
