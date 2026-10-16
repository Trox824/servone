import {
  activeSpaces,
  activeTypes,
  createTypeOp,
  customerTypes,
  findType,
  isNameTaken,
  takenKeys,
  uniqueKey
} from '../type-list'
import { group, recordType, snapshotOf, space } from './fixtures'

const snapshot = snapshotOf({
  types: [
    recordType('hop-dong', 'Hợp đồng'),
    recordType('nghi-phep', 'Đề nghị nghỉ phép'),
    recordType('bao-cao', 'Báo cáo'),
    recordType('cu', 'Mẫu cũ', { isArchived: true }),
    recordType('card:types:File', 'Tệp', { isSystem: true }),
    recordType('card:types:Document', 'Tài liệu', { isSystem: true })
  ],
  groups: [group('thu-viec', 'Thông tin thử việc', 'nghi-phep')],
  spaces: [space('hr', 'Nhân sự'), space('old', 'Kho cũ', { isArchived: true }), space('sales', 'Kinh doanh')]
})

describe('left list', () => {
  it('lists customer types by Vietnamese name, without archived or system types', () => {
    expect(customerTypes(snapshot).map((it) => it.name)).toEqual(['Báo cáo', 'Đề nghị nghỉ phép', 'Hợp đồng'])
  })

  it('offers only active types and spaces in pickers', () => {
    expect(activeTypes(snapshot).some((it) => it.key === 'cu')).toBe(false)
    expect(activeSpaces(snapshot).map((it) => it.name)).toEqual(['Kinh doanh', 'Nhân sự'])
    expect(findType(snapshot, 'cu')).toBeUndefined()
    expect(findType(snapshot, 'nghi-phep')?.name).toBe('Đề nghị nghỉ phép')
  })
})

describe('keys and names', () => {
  it('suffixes a taken key and falls back when slugify leaves nothing', () => {
    const taken = takenKeys(snapshot)
    expect(taken.has('thu-viec')).toBe(true)
    expect(uniqueKey('cong-tac', taken)).toBe('cong-tac')
    expect(uniqueKey('nghi-phep', taken)).toBe('nghi-phep-2')
    expect(uniqueKey('nghi-phep', new Set([...taken, 'nghi-phep-2']))).toBe('nghi-phep-3')
    expect(uniqueKey('', taken)).toBe('loai-ho-so')
  })

  it('treats names that differ only in case, spacing or composition as taken, but frees an archived name', () => {
    expect(isNameTaken(snapshot, ' hợp đồng ')).toBe(true)
    expect(isNameTaken(snapshot, 'Mẫu cũ'.normalize('NFD'))).toBe(false)
    expect(isNameTaken(snapshot, 'Hợp đồng', 'hop-dong')).toBe(false)
    expect(isNameTaken(snapshot, 'Đề nghị công tác')).toBe(false)
  })
})

describe('createTypeOp', () => {
  it('leaves basedOn out unless one is chosen', () => {
    const plain = createTypeOp('cong-tac', 'Đề nghị công tác', undefined, ['hr'])
    expect(plain).toEqual({ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác', spaces: ['hr'] })
    expect('basedOn' in plain).toBe(false)
    expect(createTypeOp('cong-tac', 'Đề nghị công tác', 'nghi-phep', []).basedOn).toBe('nghi-phep')
  })
})
