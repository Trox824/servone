export type Shortcut = 'undo' | 'fit' | 'back'

export interface KeyPress {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  isComposing: boolean
}

export function shortcutOf (press: KeyPress): Shortcut | undefined {
  if (press.isComposing) return undefined
  const hasCommand = press.metaKey || press.ctrlKey
  if (hasCommand && !press.shiftKey && press.key.toLowerCase() === 'z') return 'undo'
  if (!hasCommand && press.shiftKey && press.code === 'Digit1') return 'fit'
  if (!hasCommand && !press.shiftKey && press.key === 'Escape') return 'back'
  return undefined
}
