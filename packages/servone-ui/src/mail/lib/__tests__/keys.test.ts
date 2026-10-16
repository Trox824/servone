import { commandFor, isShortcutBlocked } from '../keys'

describe('commandFor', () => {
  it('maps Gmail-style keys and stays quiet while typing', () => {
    expect(commandFor({ key: 'j', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('next')
    expect(commandFor({ key: '#', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('delete')
    expect(commandFor({ key: 'e', metaKey: false, ctrlKey: false, altKey: false }, true)).toBeUndefined()
    expect(commandFor({ key: 'c', metaKey: true, ctrlKey: false, altKey: false }, false)).toBeUndefined()
  })

  it('maps the rest of the Gmail keys', () => {
    expect(commandFor({ key: 'k', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('prev')
    expect(commandFor({ key: 'u', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('toggleUnread')
    expect(commandFor({ key: 's', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('toggleStar')
    expect(commandFor({ key: 'r', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('reply')
    expect(commandFor({ key: 'a', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('replyAll')
    expect(commandFor({ key: 'f', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('forward')
    expect(commandFor({ key: 'c', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('compose')
    expect(commandFor({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('open')
    expect(commandFor({ key: 'Escape', metaKey: false, ctrlKey: false, altKey: false }, false)).toBe('close')
  })

  it('ignores keys held with ctrl or alt', () => {
    expect(commandFor({ key: 'j', metaKey: false, ctrlKey: true, altKey: false }, false)).toBeUndefined()
    expect(commandFor({ key: 'j', metaKey: false, ctrlKey: false, altKey: true }, false)).toBeUndefined()
  })

  it('has no command for keys outside the scheme', () => {
    expect(commandFor({ key: 'z', metaKey: false, ctrlKey: false, altKey: false }, false)).toBeUndefined()
  })
})

describe('isShortcutBlocked', () => {
  it('blocks every key on text entry, regardless of which key', () => {
    expect(isShortcutBlocked('INPUT', null, false, 'j')).toBe(true)
    expect(isShortcutBlocked('TEXTAREA', null, false, 'e')).toBe(true)
    expect(isShortcutBlocked('SELECT', null, false, 'a')).toBe(true)
    expect(isShortcutBlocked('DIV', null, true, 'z')).toBe(true)
  })

  it('only blocks Enter/Space/Escape on a button, link, or ARIA widget role', () => {
    expect(isShortcutBlocked('BUTTON', null, false, 'Enter')).toBe(true)
    expect(isShortcutBlocked('BUTTON', null, false, ' ')).toBe(true)
    expect(isShortcutBlocked('A', null, false, 'Escape')).toBe(true)
    expect(isShortcutBlocked('DIV', 'option', false, 'Enter')).toBe(true)
    expect(isShortcutBlocked('DIV', 'checkbox', false, ' ')).toBe(true)
  })

  it('still lets letter shortcuts fire on a focused row, button, or link', () => {
    expect(isShortcutBlocked('DIV', 'option', false, 'j')).toBe(false)
    expect(isShortcutBlocked('DIV', 'option', false, 'e')).toBe(false)
    expect(isShortcutBlocked('BUTTON', null, false, 's')).toBe(false)
    expect(isShortcutBlocked('A', null, false, 'u')).toBe(false)
  })

  it('lets plain, non-widget elements through entirely', () => {
    expect(isShortcutBlocked('DIV', null, false, 'Enter')).toBe(false)
    expect(isShortcutBlocked('DIV', 'listitem', false, 'Enter')).toBe(false)
    expect(isShortcutBlocked('SPAN', null, false, 'j')).toBe(false)
  })
})

describe('commandFor with a focused thread row (role="option")', () => {
  it('still moves the cursor and runs bulk-style shortcuts', () => {
    const isBlocked = (key: string): boolean => isShortcutBlocked('DIV', 'option', false, key)
    expect(commandFor({ key: 'j', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('j'))).toBe('next')
    expect(commandFor({ key: 'e', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('e'))).toBe('archive')
  })

  it('leaves Enter to the row itself instead of double-handling it', () => {
    const isBlocked = (key: string): boolean => isShortcutBlocked('DIV', 'option', false, key)
    expect(commandFor({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('Enter'))).toBeUndefined()
  })
})

describe('commandFor with a focused button', () => {
  it('blocks Enter but not letter shortcuts', () => {
    const isBlocked = (key: string): boolean => isShortcutBlocked('BUTTON', null, false, key)
    expect(commandFor({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('Enter'))).toBeUndefined()
    expect(commandFor({ key: 'j', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('j'))).toBe('next')
  })
})

describe('commandFor with a focused input', () => {
  it('blocks every key', () => {
    const isBlocked = (key: string): boolean => isShortcutBlocked('INPUT', null, false, key)
    expect(commandFor({ key: 'j', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('j'))).toBeUndefined()
    expect(commandFor({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false }, isBlocked('Enter'))).toBeUndefined()
  })
})
