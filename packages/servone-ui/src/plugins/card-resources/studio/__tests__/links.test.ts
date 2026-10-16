import {
  addLinkOp,
  defaultFarName,
  howManyQuestion,
  linkDraftIssues,
  linkRows,
  removeLinkOp
} from '../links'
import { field, link, recordType, snapshotOf } from './fixtures'

const trip = recordType('cong-tac', 'Đề nghị công tác', {
  fields: [field('nguoi-duyet', 'Người duyệt', { kind: 'reference', to: 'nhan-vien' })]
})
const snapshot = snapshotOf({
  types: [trip, recordType('khach-hang', 'Khách hàng'), recordType('hop-dong', 'Hợp đồng'), recordType('nhan-vien', 'Nhân viên')],
  links: [
    link('cong-tac-khach-hang', 'cong-tac', 'khach-hang', {
      fromName: 'Khách hàng',
      toName: 'Được liên kết từ: Đề nghị công tác',
      fromMany: false,
      toMany: true
    }),
    link('hop-dong-cong-tac', 'hop-dong', 'cong-tac', { fromName: 'Chuyến công tác', toName: 'Hợp đồng', fromMany: true, toMany: false }),
    link('khach-hang-hop-dong', 'khach-hang', 'hop-dong')
  ]
})

describe('linkRows', () => {
  it('shows each link from this type\'s side and references as read-only', () => {
    expect(linkRows(snapshot, trip)).toEqual([
      {
        key: 'cong-tac-khach-hang',
        targetKey: 'khach-hang',
        targetName: 'Khách hàng',
        fieldName: 'Khách hàng',
        farFieldName: 'Được liên kết từ: Đề nghị công tác',
        isMany: false,
        isFarMany: true,
        isReadOnly: false
      },
      {
        key: 'hop-dong-cong-tac',
        targetKey: 'hop-dong',
        targetName: 'Hợp đồng',
        fieldName: 'Hợp đồng',
        farFieldName: 'Chuyến công tác',
        isMany: false,
        isFarMany: true,
        isReadOnly: false
      },
      {
        key: 'ref:nguoi-duyet',
        targetKey: 'nhan-vien',
        targetName: 'Nhân viên',
        fieldName: 'Người duyệt',
        farFieldName: '',
        isMany: false,
        isFarMany: false,
        isReadOnly: true
      }
    ])
  })
})

describe('link questions and ops', () => {
  it('asks each side in plain words and names the far field', () => {
    expect(howManyQuestion('Hợp đồng', 'Khách hàng')).toBe('Mỗi Hợp đồng có một hay nhiều Khách hàng?')
    expect(defaultFarName('Hợp đồng')).toBe('Được liên kết từ: Hợp đồng')
  })

  it('builds addLink from this type\'s side', () => {
    const draft = { targetKey: 'khach-hang', fieldName: ' Khách hàng ', farFieldName: 'Đề nghị công tác', isMany: false, isFarMany: true }
    expect(addLinkOp('cong-tac', draft, 'cong-tac-khach-hang-2')).toEqual({
      op: 'addLink',
      key: 'cong-tac-khach-hang-2',
      from: 'cong-tac',
      to: 'khach-hang',
      fromName: 'Khách hàng',
      toName: 'Đề nghị công tác',
      fromMany: false,
      toMany: true
    })
    expect(removeLinkOp(linkRows(snapshot, trip)[0])).toEqual({ op: 'removeLink', link: 'cong-tac-khach-hang' })
  })

  it('needs a target and both names', () => {
    expect(linkDraftIssues({ targetKey: '', fieldName: 'A', farFieldName: 'B', isMany: false, isFarMany: false })).toEqual([
      'Hãy chọn biểu mẫu để liên kết'
    ])
    expect(linkDraftIssues({ targetKey: 'x', fieldName: ' ', farFieldName: 'B', isMany: false, isFarMany: false })).toEqual([
      'Hãy đặt tên ở cả hai bên'
    ])
  })
})
