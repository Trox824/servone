import { shortcutOf, type KeyPress } from '../keyboard'

function press (over: Partial<KeyPress>): KeyPress {
  return { key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false, ...over }
}

describe('shortcutOf', () => {
  it('reads undo on Mac and Windows, and not redo', () => {
    expect(shortcutOf(press({ key: 'z', metaKey: true }))).toBe('undo')
    expect(shortcutOf(press({ key: 'z', ctrlKey: true }))).toBe('undo')
    expect(shortcutOf(press({ key: 'Z', metaKey: true, shiftKey: true }))).toBeUndefined()
  })

  it('reads Shift+1 as fit on any keyboard layout', () => {
    expect(shortcutOf(press({ key: '!', code: 'Digit1', shiftKey: true }))).toBe('fit')
    expect(shortcutOf(press({ key: '1', code: 'Digit1' }))).toBeUndefined()
  })

  it('reads a plain Escape as back', () => {
    expect(shortcutOf(press({ key: 'Escape', code: 'Escape' }))).toBe('back')
    expect(shortcutOf(press({ key: 'Escape', code: 'Escape', metaKey: true }))).toBeUndefined()
    expect(shortcutOf(press({ key: 'Escape', code: 'Escape', isComposing: true }))).toBeUndefined()
  })

  it('ignores keys while a Vietnamese IME is composing', () => {
    expect(shortcutOf(press({ key: 'z', metaKey: true, isComposing: true }))).toBeUndefined()
  })
})
