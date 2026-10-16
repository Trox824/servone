import { groupsOf } from '../groups'
import { group, snapshotOf } from './fixtures'

describe('field groups', () => {
  it('lists the groups of one type by name', () => {
    const snapshot = snapshotOf({
      groups: [
        group('thu-viec', 'Thông tin thử việc', 'nhan-vien'),
        group('bao-hiem', 'Bảo hiểm', 'nhan-vien'),
        group('thanh-toan', 'Thanh toán', 'hop-dong')
      ]
    })
    expect(groupsOf(snapshot, 'nhan-vien').map((it) => it.name)).toEqual(['Bảo hiểm', 'Thông tin thử việc'])
  })
})
