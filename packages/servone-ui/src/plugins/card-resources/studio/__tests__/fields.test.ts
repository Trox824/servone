import { slugify } from '@servone/config'
import {
  addOption,
  draftIssues,
  draftOf,
  fieldOps,
  fieldRows,
  fieldsWithInherited,
  mapOption,
  moveOption,
  newDraft,
  optionChanges,
  parentChain,
  removeOption,
  renameOption,
  takenFieldKeys,
  type FieldDraft,
  type OptionEdit
} from '../fields'
import { uniqueKey } from '../type-list'
import { field, link, recordType, snapshotOf } from './fixtures'

const leaveKind = field('loai', 'Loại nghỉ', { kind: 'select', options: ['Ốm', 'Phép năm', 'Việc riêng'] })

function editsOf (): OptionEdit[] {
  const draft = draftOf(leaveKind)
  if (draft === undefined) throw new Error('select field must be editable')
  return draft.options
}

function idOf (edits: OptionEdit[], label: string): number {
  const found = edits.find((it) => it.label === label)
  if (found === undefined) throw new Error(`no option ${label}`)
  return found.id
}

describe('optionChanges', () => {
  it('maps a removed option to the final label of a renamed option', () => {
    let edits = editsOf()
    const yearly = idOf(edits, 'Phép năm')
    edits = renameOption(edits, yearly, 'Phép năm 2026')
    edits = removeOption(edits, idOf(edits, 'Ốm'))
    edits = mapOption(edits, idOf(edits, 'Ốm'), yearly)
    expect(optionChanges(edits)).toEqual([
      { rename: 'Phép năm', to: 'Phép năm 2026' },
      { remove: 'Ốm', mapTo: 'Phép năm 2026' }
    ])
  })

  it('sends reorder only when the order differs from core\'s', () => {
    const added = renameOption(addOption(editsOf()), 3, 'Không lương')
    expect(optionChanges(added)).toEqual([{ add: 'Không lương' }])
    const movedUp = moveOption(moveOption(moveOption(added, 3, -1), 3, -1), 3, -1)
    expect(optionChanges(movedUp)).toEqual([
      { add: 'Không lương' },
      { reorder: ['Không lương', 'Ốm', 'Phép năm', 'Việc riêng'] }
    ])
  })

  it('drops blank and removed new options', () => {
    let edits = addOption(addOption(editsOf()))
    edits = renameOption(edits, 4, 'Tạm')
    edits = removeOption(edits, 4)
    expect(edits.map((it) => it.id)).toEqual([0, 1, 2, 3])
    expect(optionChanges(edits)).toEqual([])
  })

  it('removes without mapTo when records should be left empty', () => {
    const changes = optionChanges(removeOption(editsOf(), 0))
    expect(changes).toEqual([{ remove: 'Ốm' }])
    expect('mapTo' in changes[0]).toBe(false)
  })

  it('clears a mapping when its target is removed too', () => {
    let edits = removeOption(editsOf(), 0)
    edits = mapOption(edits, 0, 1)
    edits = removeOption(edits, 1)
    expect(edits.find((it) => it.id === 0)?.mapToId).toBeUndefined()
    expect(optionChanges(edits)).toEqual([{ remove: 'Ốm' }, { remove: 'Phép năm' }])
  })
})

describe('fieldOps', () => {
  it('adds a dropdown with its kept options and marks required only when asked', () => {
    let options = addOption(addOption([]))
    options = renameOption(renameOption(options, 0, ' Máy bay '), 1, 'Tàu hỏa')
    const draft: FieldDraft = { name: ' Phương tiện ', kind: { kind: 'select', options: [] }, isRequired: false, options }
    const ops = fieldOps('cong-tac', undefined, draft, 'phuong-tien')
    expect(ops).toEqual([
      { op: 'addField', type: 'cong-tac', key: 'phuong-tien', name: 'Phương tiện', kind: { kind: 'select', options: ['Máy bay', 'Tàu hỏa'] } }
    ])
    expect('required' in ops[0]).toBe(false)
    expect(fieldOps('cong-tac', undefined, { ...draft, isRequired: true }, 'phuong-tien')[0]).toMatchObject({ required: true })
  })

  it('updates only what changed on an existing field', () => {
    const draft = draftOf(leaveKind)
    if (draft === undefined) throw new Error('select field must be editable')
    expect(fieldOps('nghi-phep', leaveKind, draft, 'loai')).toEqual([])
    const renamed: FieldDraft = { ...draft, name: 'Loại nghỉ phép', options: removeOption(draft.options, 2) }
    expect(fieldOps('nghi-phep', leaveKind, renamed, 'loai')).toEqual([
      { op: 'updateField', type: 'nghi-phep', field: 'loai', name: 'Loại nghỉ phép' },
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ remove: 'Việc riêng' }] }
    ])
  })
})

describe('draftIssues', () => {
  const reason = field('ly-do', 'Lý do')

  it('asks for a name that no other field uses', () => {
    expect(draftIssues(newDraft(), [reason], undefined)).toEqual(['Hãy nhập câu hỏi'])
    expect(draftIssues({ ...newDraft(), name: ' lý do ' }, [reason], undefined)).toEqual(['Đã có câu hỏi này'])
    expect(draftIssues({ ...newDraft(), name: 'Lý do' }, [reason], reason)).toEqual([])
  })

  it('checks dropdown options', () => {
    const draft: FieldDraft = { name: 'Loại', kind: { kind: 'select', options: [] }, isRequired: false, options: [] }
    expect(draftIssues(draft, [], undefined)).toEqual(['Cần ít nhất một lựa chọn'])
    const twice = renameOption(renameOption(addOption(addOption([])), 0, 'A'), 1, 'a ')
    expect(draftIssues({ ...draft, options: twice }, [], undefined)).toEqual(['Có hai lựa chọn trùng tên'])
    expect(draftIssues({ ...draft, options: addOption([]) }, [], undefined)).toEqual(['Có lựa chọn đang để trống'])
  })
})

describe('fieldRows', () => {
  it('lists fields, then links from both sides, with read-only references', () => {
    const trip = recordType('cong-tac', 'Đề nghị công tác', {
      fields: [
        field('ly-do', 'Lý do', { kind: 'text' }, { isRequired: true }),
        field('nguoi-tao', 'Người tạo', { kind: 'reference', to: 'nhan-vien' }, { isBuiltIn: true })
      ]
    })
    const snapshot = snapshotOf({
      types: [trip, recordType('khach-hang', 'Khách hàng'), recordType('nhan-vien', 'Nhân viên')],
      links: [
        link('cong-tac-khach-hang', 'cong-tac', 'khach-hang', { fromName: 'Khách hàng', toName: 'Được liên kết từ: Đề nghị công tác' }),
        link('hop-dong-cong-tac', 'hop-dong', 'cong-tac', { fromName: 'Chuyến công tác', toName: 'Hợp đồng' })
      ]
    })
    expect(fieldRows(snapshot, trip).map((it) => [it.name, it.kind, it.detail, it.isEditable])).toEqual([
      ['Lý do', 'text', 'Văn bản', true],
      ['Người tạo', 'reference', 'Liên kết có sẵn tới Nhân viên', false],
      ['Khách hàng', 'link', 'Liên kết tới Khách hàng', false],
      ['Hợp đồng', 'link', 'Liên kết tới hop-dong', false]
    ])
  })
})

describe('takenFieldKeys', () => {
  it('includes field keys inherited through the basedOn chain, not just the type\'s own fields', () => {
    const request = recordType('de-nghi', 'Đề nghị', { fields: [field('ly-do', 'Lý do')] })
    const trip = recordType('cong-tac', 'Đề nghị công tác', { basedOn: 'de-nghi', fields: [field('diem-den', 'Điểm đến')] })
    const foreignTrip = recordType('cong-tac-nn', 'Công tác nước ngoài', { basedOn: 'cong-tac', fields: [field('visa', 'Visa')] })
    const snapshot = snapshotOf({ types: [request, trip, foreignTrip] })
    expect(takenFieldKeys(snapshot, foreignTrip)).toEqual(new Set(['visa', 'diem-den', 'ly-do']))
  })

  it('steers a generated key away from a parent field the type does not show', () => {
    const request = recordType('de-nghi', 'Đề nghị', { fields: [field('ly-do', 'Lý do')] })
    const trip = recordType('cong-tac', 'Đề nghị công tác', { basedOn: 'de-nghi' })
    const snapshot = snapshotOf({ types: [request, trip] })
    expect(uniqueKey(slugify('Lý do'), takenFieldKeys(snapshot, trip))).toBe('ly-do-2')
  })
})

describe('fieldsWithInherited', () => {
  it('returns only the type\'s own fields when it has no parent', () => {
    const request = recordType('de-nghi', 'Đề nghị', { fields: [field('ly-do', 'Lý do')] })
    const snapshot = snapshotOf({ types: [request] })
    expect(fieldsWithInherited(snapshot, request)).toEqual([field('ly-do', 'Lý do')])
  })

  it('includes a single parent\'s fields after the type\'s own fields', () => {
    const request = recordType('de-nghi', 'Đề nghị', { fields: [field('ly-do', 'Lý do')] })
    const trip = recordType('cong-tac', 'Đề nghị công tác', { basedOn: 'de-nghi', fields: [field('diem-den', 'Điểm đến')] })
    const snapshot = snapshotOf({ types: [request, trip] })
    expect(fieldsWithInherited(snapshot, trip).map((it) => it.key)).toEqual(['diem-den', 'ly-do'])
  })

  it('walks a multi-level chain to include the grandparent\'s fields', () => {
    const request = recordType('de-nghi', 'Đề nghị', { fields: [field('ly-do', 'Lý do')] })
    const trip = recordType('cong-tac', 'Đề nghị công tác', { basedOn: 'de-nghi', fields: [field('diem-den', 'Điểm đến')] })
    const foreignTrip = recordType('cong-tac-nn', 'Công tác nước ngoài', { basedOn: 'cong-tac', fields: [field('visa', 'Visa')] })
    const snapshot = snapshotOf({ types: [request, trip, foreignTrip] })
    expect(fieldsWithInherited(snapshot, foreignTrip).map((it) => it.key)).toEqual(['visa', 'diem-den', 'ly-do'])
  })

  it('keeps the type\'s own field on a key collision with a parent field', () => {
    const own = field('ly-do', 'Lý do riêng')
    const inherited = field('ly-do', 'Lý do')
    const request = recordType('de-nghi', 'Đề nghị', { fields: [inherited] })
    const trip = recordType('cong-tac', 'Đề nghị công tác', { basedOn: 'de-nghi', fields: [own] })
    const snapshot = snapshotOf({ types: [request, trip] })
    expect(fieldsWithInherited(snapshot, trip)).toEqual([own])
  })
})

describe('parentChain', () => {
  it('stops when the basedOn chain loops', () => {
    const a = recordType('a', 'A', { basedOn: 'b' })
    const b = recordType('b', 'B', { basedOn: 'a' })
    expect(parentChain(snapshotOf({ types: [a, b] }), a).map((it) => it.key)).toEqual(['b'])
  })
})
