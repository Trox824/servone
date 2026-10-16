import { packContents, type Pack } from '@servone/config'
import {
  addedParents,
  canInstall,
  installLabel,
  installNotice,
  packFileName,
  packFileText,
  stateBadge,
  withParents
} from '../packs'
import { customerTypes } from '../type-list'
import { change, recordType, snapshotOf } from './fixtures'

const KEY = 'tai-san-cong-ty'

const ASSETS: Pack = {
  key: KEY,
  version: 1,
  name: 'Tài sản công ty',
  description: 'Sổ tài sản và nhật ký bảo trì',
  industry: 'Mọi ngành',
  operations: [
    { op: 'createType', key: 'tai-san', name: 'Tài sản', packKey: KEY },
    { op: 'addField', type: 'tai-san', key: 'so-serial', name: 'Số serial', kind: { kind: 'text' }, packKey: KEY },
    { op: 'createType', key: 'bao-tri', name: 'Nhật ký bảo trì', packKey: KEY },
    { op: 'addField', type: 'bao-tri', key: 'chi-phi', name: 'Chi phí', kind: { kind: 'money', currency: 'VND' }, packKey: KEY },
    {
      op: 'addLink',
      key: 'tai-san-bao-tri',
      from: 'tai-san',
      to: 'bao-tri',
      fromName: 'Nhật ký bảo trì',
      toName: 'Tài sản',
      fromMany: true,
      toMany: false,
      packKey: KEY
    }
  ]
}

describe('pack gallery', () => {
  it('counts a pack\'s contents', () => {
    const contents = packContents(ASSETS)
    expect(contents).toMatchObject({ typeNames: ['Tài sản', 'Nhật ký bảo trì'], fieldCount: 2, linkCount: 1, groupCount: 0 })
  })

  it('labels the install button and badge by install state', () => {
    expect([installLabel('notInstalled'), installLabel('partial'), installLabel('installed')]).toEqual([
      'Cài gói',
      'Cài phần còn thiếu',
      'Đã cài'
    ])
    expect([canInstall('notInstalled'), canInstall('partial'), canInstall('installed')]).toEqual([true, true, false])
    expect([stateBadge('notInstalled'), stateBadge('partial'), stateBadge('installed')]).toEqual([undefined, 'Đã cài một phần', 'Đã cài'])
  })

  it('tells the admin what an install did', () => {
    expect(installNotice(ASSETS, { kind: 'applied', changes: [change('c1')] })).toBe(
      'Đã cài gói Tài sản công ty. Các biểu mẫu mới nằm trong danh sách bên trái.'
    )
    expect(installNotice(ASSETS, { kind: 'unchanged' })).toBe('Gói Tài sản công ty đã cài đủ, không có gì để thêm.')
    expect(installNotice(ASSETS, { kind: 'stale' })).toBeUndefined()
    expect(installNotice(ASSETS, { kind: 'invalid', issues: [] })).toBeUndefined()
  })
})

describe('pack export', () => {
  const snapshot = snapshotOf({
    types: [
      recordType('khach-hang', 'Khách hàng'),
      recordType('khach-hang-vip', 'Khách hàng VIP', { basedOn: 'khach-hang' }),
      recordType('the-vip', 'Thẻ VIP', { basedOn: 'khach-hang-vip' }),
      recordType('file', 'File', { isSystem: true }),
      recordType('tai-lieu', 'Tài liệu nội bộ', { basedOn: 'file' }),
      recordType('cu', 'Loại cũ', { isArchived: true })
    ]
  })

  it('offers only active customer types via customerTypes', () => {
    expect(customerTypes(snapshot).map((it) => it.key)).toEqual(['khach-hang', 'khach-hang-vip', 'tai-lieu', 'the-vip'])
  })

  it('adds customer parents, never system ones', () => {
    expect(withParents(snapshot, ['the-vip'])).toEqual(['the-vip', 'khach-hang-vip', 'khach-hang'])
    expect(withParents(snapshot, ['tai-lieu'])).toEqual(['tai-lieu'])
    expect(addedParents(snapshot, ['the-vip', 'khach-hang']).map((it) => it.key)).toEqual(['khach-hang-vip'])
  })

  it('writes a pack file that reads back as the same pack', () => {
    expect(packFileName('ban-hang')).toBe('ban-hang.pack.json')
    const fileText = packFileText(ASSETS)
    expect(fileText.endsWith('\n')).toBe(true)
    expect(JSON.parse(fileText)).toEqual(ASSETS)
  })
})
