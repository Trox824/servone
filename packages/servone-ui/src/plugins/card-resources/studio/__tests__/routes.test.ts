import { parseStudioRoute, STUDIO_CATEGORY, TYPE_SEGMENT } from '../routes'
import { text } from '../strings'

const base = ['workbench', 'ws', 'setting', 'setting', STUDIO_CATEGORY]

describe('parseStudioRoute', () => {
  it('reads home, type pages and sections', () => {
    expect(parseStudioRoute(base)).toEqual({ kind: 'home' })
    expect(parseStudioRoute([...base, TYPE_SEGMENT, 'nghi-phep'])).toEqual({ kind: 'type', typeKey: 'nghi-phep' })
    expect(parseStudioRoute([...base, TYPE_SEGMENT, 'nghi-phep', 'quyen'])).toEqual({
      kind: 'type',
      typeKey: 'nghi-phep',
      tab: 'quyen'
    })
    expect(parseStudioRoute([...base, 'lich-su'])).toEqual({ kind: 'section', section: 'lich-su' })
  })

  it('treats a type segment without a key as home', () => {
    expect(parseStudioRoute([...base, TYPE_SEGMENT])).toEqual({ kind: 'home' })
    expect(parseStudioRoute([...base, ''])).toEqual({ kind: 'home' })
  })
})

describe('text', () => {
  it('fills named params and keeps unknown ones', () => {
    expect(text('TypePhrase', { name: 'Đề nghị nghỉ phép' })).toBe('Gõ "Đề nghị nghỉ phép" để xác nhận')
    expect(text('AffectedRecords', { count: 42 })).toBe('42 hồ sơ')
    expect(text('HowMany', { from: 'Hợp đồng' })).toBe('Mỗi Hợp đồng có một hay nhiều {to}?')
  })
})
