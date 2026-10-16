export type ChatShortcut =
  | 'switcher'
  | 'previousChannel'
  | 'nextChannel'
  | 'previousUnread'
  | 'nextUnread'
  | 'unreads'
  | 'threads'
  | 'directMessages'
  | 'saved'
  | 'markRead'
  | 'markAllRead'

export interface KeyPress {
  code: string
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export interface NavRow {
  isSelected: boolean
  isUnread: boolean
}

const MOD_SHIFT_SHORTCUTS: Record<string, ChatShortcut> = {
  KeyA: 'unreads',
  KeyT: 'threads',
  KeyK: 'directMessages',
  KeyS: 'saved'
}

export function chatShortcut (key: KeyPress, isMac: boolean): ChatShortcut | undefined {
  const hasMod = isMac ? key.metaKey : key.ctrlKey
  const hasOtherMod = isMac ? key.ctrlKey : key.metaKey
  if (hasOtherMod) return undefined

  if (key.code === 'Escape' && !hasMod && !key.altKey) {
    return key.shiftKey ? 'markAllRead' : 'markRead'
  }

  if (key.altKey && !hasMod) {
    if (key.code === 'ArrowUp') return key.shiftKey ? 'previousUnread' : 'previousChannel'
    if (key.code === 'ArrowDown') return key.shiftKey ? 'nextUnread' : 'nextChannel'
    return undefined
  }

  if (!hasMod || key.altKey) return undefined
  if (!key.shiftKey) return key.code === 'KeyT' ? 'switcher' : undefined
  return MOD_SHIFT_SHORTCUTS[key.code]
}

export function nextRowIndex (rows: NavRow[], step: 1 | -1, isUnreadOnly: boolean): number | undefined {
  const selected = rows.findIndex((row) => row.isSelected)
  const start = selected === -1 ? (step === 1 ? -1 : rows.length) : selected
  for (let i = start + step; i >= 0 && i < rows.length; i += step) {
    if (!isUnreadOnly || rows[i].isUnread) return i
  }
  return undefined
}
