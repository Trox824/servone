import type { ValidationIssue } from '@servone/config'
import { refusalsOf } from '../outcome'

const refused: ValidationIssue = { code: 'invalid-input', message: 'Câu hỏi "Lý do" đang được quy trình dùng', opIndex: 0 }

describe('refusalsOf', () => {
  it('reads the engine reason, also after a partial save', () => {
    expect(refusalsOf({ kind: 'invalid', issues: [refused] })).toEqual([refused.message])
    expect(refusalsOf({ kind: 'partial', changes: [], stopped: { kind: 'invalid', issues: [refused] } })).toEqual([refused.message])
  })

  it('has nothing to say for other outcomes', () => {
    expect(refusalsOf({ kind: 'applied', changes: [] })).toEqual([])
    expect(refusalsOf({ kind: 'cancelled' })).toEqual([])
  })
})
