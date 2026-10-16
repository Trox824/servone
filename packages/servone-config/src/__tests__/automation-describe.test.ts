import { describe as describeConfig } from '../describe'
import { addProcess, applyOps } from './harness'
import { APPROVAL, leaveFixture, LINKED, withAccountant } from './automation-fixture'

describe('describe automations', () => {
  it('reads rules back in concept terms, with hand-made processes read-only', async () => {
    const fx = await leaveFixture()
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: APPROVAL }])
    const handMade = await addProcess(fx.ws, fx.type._id, 'Quy trình cũ', 'Chạy tay')

    const snapshot = await describeConfig(fx.session, { type: 'nghi-phep' })
    expect(snapshot.types[0].automations).toEqual([
      {
        key: 'duyet',
        name: 'Duyệt nghỉ phép',
        automation: APPROVAL,
        sentences: [
          'Khi tạo hồ sơ thì đặt *Trạng thái* = "Đã nộp", gửi duyệt cho người ở trường *Trưởng phòng* (tất cả phải duyệt)',
          'Khi được duyệt thì đặt *Trạng thái* = "Đã duyệt", khóa hồ sơ',
          'Khi bị từ chối thì đặt *Trạng thái* = "Từ chối"'
        ]
      },
      { key: handMade, name: 'Quy trình cũ', automation: null, sentences: ['Chạy tay'] }
    ])
    const other = (await describeConfig(fx.session)).types.find((it) => it.key === 'cong-tac-phi')
    expect(other?.automations).toEqual([])
  })

  it('reads a connected-form approver back unchanged', async () => {
    const fx = await leaveFixture()
    await withAccountant(fx)
    await applyOps(fx.session, [{ op: 'setAutomation', type: 'nghi-phep', key: 'duyet', automation: LINKED }])
    const snapshot = await describeConfig(fx.session, { type: 'nghi-phep' })
    expect(snapshot.types[0].automations[0]).toMatchObject({ key: 'duyet', automation: LINKED })
  })
})
