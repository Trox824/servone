import { ruleSentences } from '../automation-text'
import { loadState } from '../state'
import { ADVANCE, APPROVAL, leaveFixture, LINKED, REMINDER, withAccountant } from './automation-fixture'

describe('ruleSentences', () => {
  it('reads each rule as "Khi ... thì ..." sentences', async () => {
    const fx = await leaveFixture()
    const state = await loadState(fx.ws.client)
    expect(ruleSentences(state, fx.type, APPROVAL)).toEqual([
      'Khi tạo hồ sơ thì đặt *Trạng thái* = "Đã nộp", gửi duyệt cho người ở trường *Trưởng phòng* (tất cả phải duyệt)',
      'Khi được duyệt thì đặt *Trạng thái* = "Đã duyệt", khóa hồ sơ',
      'Khi bị từ chối thì đặt *Trạng thái* = "Từ chối"'
    ])
    expect(ruleSentences(state, fx.type, REMINDER)).toEqual([
      'Vào 3 ngày trước *Ngày bắt đầu* thì khóa trường *Ngày bắt đầu*, *Tạm ứng*, giao việc "Bàn giao công việc" cho 1 người được chọn'
    ])
    expect(ruleSentences(state, fx.type, ADVANCE)).toEqual([
      'Khi trường *Khẩn* đổi thành Có thì tạo hồ sơ *Công tác phí* "Tạm ứng" (*Số tiền* = 2000000 VND) liên kết với hồ sơ này, ' +
        'gửi duyệt cho mọi *Người quản lý* trong không gian của hồ sơ (tất cả phải duyệt)'
    ])
  })

  it('covers people, cleared values, same-day dates and missing fields', async () => {
    const fx = await leaveFixture()
    const state = await loadState(fx.ws.client)
    expect(
      ruleSentences(state, fx.type, {
        name: 'Giao',
        trigger: { kind: 'date', field: 'ngay-bat-dau', offsetDays: 2 },
        actions: [
          { kind: 'setField', field: 'truong-phong', value: 'lan-uuid' },
          { kind: 'setField', field: 'tam-ung', value: null }
        ]
      })
    ).toEqual(['Vào 2 ngày sau *Ngày bắt đầu* thì đặt *Trưởng phòng* = người được chọn, xóa giá trị *Tạm ứng*'])
    expect(
      ruleSentences(state, fx.type, {
        name: 'Khóa',
        trigger: { kind: 'date', field: 'da-xoa', offsetDays: 0 },
        actions: [{ kind: 'lockRecord' }]
      })
    ).toEqual(['Vào ngày *da-xoa* thì khóa hồ sơ'])
  })

  it('names a person on the connected form and the record creator', async () => {
    const fx = await leaveFixture()
    await withAccountant(fx)
    const state = await loadState(fx.ws.client)
    expect(ruleSentences(state, fx.type, LINKED)).toEqual([
      'Khi tạo hồ sơ thì gửi duyệt cho người ở trường *Kế toán* của hồ sơ *Công tác phí* được liên kết (tất cả phải duyệt)',
      'Khi bị từ chối thì giao việc "Sửa lại đề nghị" cho người tạo hồ sơ'
    ])
  })
})
