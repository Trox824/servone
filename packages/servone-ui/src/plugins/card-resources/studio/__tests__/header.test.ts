import { archiveOp, archivePhrase } from '../header'
import { change, recordType, snapshotOf } from './fixtures'

const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', { spaces: ['hr', 'sales'], basedOn: 'de-nghi' })
const snapshot = snapshotOf({
  types: [leave, recordType('de-nghi', 'Đề nghị')]
})

describe('archiveOp', () => {
  it('builds the archive op', () => {
    expect(archiveOp(leave.key)).toEqual({ op: 'archiveType', type: 'nghi-phep' })
  })
})

describe('archivePhrase', () => {
  it('asks for the archived type name in any change that archives a type', () => {
    const rename = { op: 'updateType' as const, type: 'de-nghi', name: 'Đề xuất' }
    expect(archivePhrase(change('c1', { ops: [rename, archiveOp(leave.key)] }), snapshot)).toBe('Đề nghị nghỉ phép')
    expect(archivePhrase(change('c2', { ops: [{ op: 'archiveType', type: 'da-xoa' }] }), snapshot)).toBe('da-xoa')
    expect(archivePhrase(change('c3', { ops: [rename] }), snapshot)).toBeUndefined()
  })
})
