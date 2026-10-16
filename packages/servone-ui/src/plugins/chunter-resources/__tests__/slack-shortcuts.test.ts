import { chatShortcut, nextRowIndex, type KeyPress } from '../slack-shortcuts/keys'

const press = (code: string, mods: Partial<Omit<KeyPress, 'code'>> = {}): KeyPress => ({
  code,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mods
})

describe('chatShortcut', () => {
  it('maps Slack keys on Mac', () => {
    expect(chatShortcut(press('KeyT', { metaKey: true }), true)).toBe('switcher')
    expect(chatShortcut(press('KeyA', { metaKey: true, shiftKey: true }), true)).toBe('unreads')
    expect(chatShortcut(press('KeyT', { metaKey: true, shiftKey: true }), true)).toBe('threads')
    expect(chatShortcut(press('KeyK', { metaKey: true, shiftKey: true }), true)).toBe('directMessages')
    expect(chatShortcut(press('KeyS', { metaKey: true, shiftKey: true }), true)).toBe('saved')
    expect(chatShortcut(press('ArrowDown', { altKey: true }), true)).toBe('nextChannel')
    expect(chatShortcut(press('ArrowUp', { altKey: true, shiftKey: true }), true)).toBe('previousUnread')
    expect(chatShortcut(press('Escape'), true)).toBe('markRead')
    expect(chatShortcut(press('Escape', { shiftKey: true }), true)).toBe('markAllRead')
  })

  it('uses Ctrl as the modifier off Mac', () => {
    expect(chatShortcut(press('KeyT', { ctrlKey: true }), false)).toBe('switcher')
    expect(chatShortcut(press('KeyT', { metaKey: true }), false)).toBeUndefined()
    expect(chatShortcut(press('KeyT', { ctrlKey: true }), true)).toBeUndefined()
  })

  it('ignores unrelated keys', () => {
    expect(chatShortcut(press('KeyT'), true)).toBeUndefined()
    expect(chatShortcut(press('KeyK', { metaKey: true }), true)).toBeUndefined()
    expect(chatShortcut(press('Escape', { metaKey: true }), true)).toBeUndefined()
    expect(chatShortcut(press('ArrowDown', { altKey: true, metaKey: true }), true)).toBeUndefined()
  })
})

describe('nextRowIndex', () => {
  const rows = [
    { isSelected: false, isUnread: true },
    { isSelected: true, isUnread: false },
    { isSelected: false, isUnread: false },
    { isSelected: false, isUnread: true }
  ]

  it('steps to adjacent rows and stops at the ends', () => {
    expect(nextRowIndex(rows, 1, false)).toBe(2)
    expect(nextRowIndex(rows, -1, false)).toBe(0)
    expect(nextRowIndex([{ isSelected: true, isUnread: false }], 1, false)).toBeUndefined()
  })

  it('skips read rows when unread only', () => {
    expect(nextRowIndex(rows, 1, true)).toBe(3)
    expect(nextRowIndex(rows, -1, true)).toBe(0)
  })

  it('starts from the edge when nothing is selected', () => {
    const unselected = rows.map((row) => ({ ...row, isSelected: false }))
    expect(nextRowIndex(unselected, 1, false)).toBe(0)
    expect(nextRowIndex(unselected, -1, false)).toBe(3)
  })
})
