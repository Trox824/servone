import { diffRows, isPhraseMatched, riskLabel, riskTone } from '../diff'
import { registerUndoAction, takeUndoAction } from '../undo-actions'

describe('diffRows', () => {
  it('puts destructive lines first and shows counts only when records are affected', () => {
    const rows = diffRows([
      { text: 'Thêm trường Ghi chú', risk: 'safe' },
      { text: 'Xóa trường Lý do', risk: 'destructive', affected: 42 },
      { text: 'Gỡ lựa chọn Ốm', risk: 'destructive', affected: 0 },
      { text: 'Quyền với Đề nghị nghỉ phép trong Nhân sự', risk: 'sensitive' }
    ])
    expect(rows.map((it) => it.text)).toEqual([
      'Xóa trường Lý do',
      'Gỡ lựa chọn Ốm',
      'Quyền với Đề nghị nghỉ phép trong Nhân sự',
      'Thêm trường Ghi chú'
    ])
    expect(rows.map((it) => it.affectedText)).toEqual(['42 hồ sơ', undefined, undefined, undefined])
  })
})

describe('isPhraseMatched', () => {
  it('passes when no phrase is asked', () => {
    expect(isPhraseMatched('', undefined)).toBe(true)
  })

  it('matches the type name ignoring case, outer spaces and Unicode composition', () => {
    const composed = 'Đề nghị nghỉ phép'
    expect(isPhraseMatched(`  ${composed.normalize('NFD').toUpperCase()} `, composed)).toBe(true)
    expect(isPhraseMatched('Đề nghị nghỉ', composed)).toBe(false)
    expect(isPhraseMatched('', composed)).toBe(false)
  })
})

describe('risk labels', () => {
  it('names each level in Vietnamese and colours destructive as danger', () => {
    expect([riskLabel('safe'), riskLabel('destructive'), riskLabel('sensitive')]).toEqual(['An toàn', 'Ảnh hưởng dữ liệu', 'Cần duyệt'])
    expect(riskTone('destructive')).toBe('destructive')
    expect(riskTone('safe')).toBe('outline')
  })
})

describe('undo actions', () => {
  it('hands an action out once', () => {
    const calls: string[] = []
    registerUndoAction('c1', () => {
      calls.push('undo')
    })
    takeUndoAction('c1')?.()
    expect(takeUndoAction('c1')).toBeUndefined()
    expect(calls).toEqual(['undo'])
  })
})
