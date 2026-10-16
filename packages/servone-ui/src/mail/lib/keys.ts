export type MailCommand =
  | 'next'
  | 'prev'
  | 'archive'
  | 'delete'
  | 'toggleUnread'
  | 'toggleStar'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'compose'
  | 'open'
  | 'close'

const COMMAND_BY_KEY: Record<string, MailCommand> = {
  j: 'next',
  k: 'prev',
  e: 'archive',
  '#': 'delete',
  u: 'toggleUnread',
  s: 'toggleStar',
  r: 'reply',
  a: 'replyAll',
  f: 'forward',
  c: 'compose',
  Enter: 'open',
  Escape: 'close'
}

export function commandFor (
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>,
  isTyping: boolean
): MailCommand | undefined {
  if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return undefined
  return COMMAND_BY_KEY[event.key]
}

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const ACTIVATION_TAGS = new Set(['BUTTON', 'A'])
const ACTIVATION_ROLES = new Set(['button', 'menuitem', 'option', 'checkbox'])
const ACTIVATION_KEYS = new Set(['Enter', ' ', 'Escape'])

export function isShortcutBlocked (tagName: string, role: string | null, isContentEditable: boolean, key: string): boolean {
  if (isContentEditable || TEXT_ENTRY_TAGS.has(tagName)) return true
  const isActivationTarget = ACTIVATION_TAGS.has(tagName) || (role !== null && ACTIVATION_ROLES.has(role))
  return isActivationTarget && ACTIVATION_KEYS.has(key)
}
