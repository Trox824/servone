import { accessOp, accessRows, isOpenWithPeople, presetLabel, withPeople, withRestricted } from '../access'
import { accountId, recordType, snapshotOf, space } from './fixtures'

const lan = accountId('lan')
const minh = accountId('minh')
const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
  spaces: ['hr'],
  access: [{ space: 'hr', viewer: [], editor: [minh], manager: [lan] }]
})
const snapshot = snapshotOf({
  types: [leave],
  spaces: [space('sales', 'Kinh doanh'), space('hr', 'Nhân sự', { isRestricted: true }), space('old', 'Kho cũ', { isArchived: true })]
})

describe('accessRows', () => {
  it('lists every active space with current assignments', () => {
    expect(accessRows(snapshot, leave)).toEqual([
      { space: 'sales', name: 'Kinh doanh', isRestricted: false, viewer: [], editor: [], manager: [] },
      { space: 'hr', name: 'Nhân sự', isRestricted: true, viewer: [], editor: [minh], manager: [lan] }
    ])
  })
})

describe('accessOp', () => {
  it('sends nothing when nothing changed, whatever the order of people', () => {
    const before = accessRows(snapshot, leave)
    const reordered = withPeople(withPeople(before, 'hr', 'manager', [lan]), 'hr', 'editor', [minh])
    expect(accessOp('nghi-phep', before, reordered)).toBeUndefined()
  })

  it('keeps isRestricted explicit so a preset change never locks an open space', () => {
    const before = accessRows(snapshot, leave)
    const after = withPeople(before, 'sales', 'manager', [lan])
    expect(accessOp('nghi-phep', before, after)).toEqual({
      op: 'setAccess',
      type: 'nghi-phep',
      access: { spaces: [{ space: 'sales', isRestricted: false, manager: [lan] }] }
    })
  })

  it('sends only changed presets and restriction changes', () => {
    const before = accessRows(snapshot, leave)
    const after = withRestricted(withPeople(before, 'hr', 'viewer', [minh]), 'sales', true)
    const op = accessOp('nghi-phep', before, after)
    expect(op?.access.spaces).toEqual([
      { space: 'sales', isRestricted: true },
      { space: 'hr', isRestricted: true, viewer: [minh] }
    ])
  })

  it('warns when people are assigned in a space that is not restricted', () => {
    const rows = withPeople(accessRows(snapshot, leave), 'sales', 'viewer', [minh])
    expect(isOpenWithPeople(rows[0])).toBe(true)
    expect(isOpenWithPeople(rows[1])).toBe(false)
    expect(presetLabel('manager')).toBe('Người quản lý')
  })
})
