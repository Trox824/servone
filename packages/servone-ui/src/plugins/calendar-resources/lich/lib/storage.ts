import type { View } from './types'
import { isView } from './view'

export type KeyStore = Pick<Storage, 'getItem' | 'setItem'>

const VIEW_KEY = 'servone.lich.view'
const OVERLAY_KEY = 'servone.lich.overlay'
const SHOW_DECLINED_KEY = 'servone.lich.showDeclined'
const HIDDEN = 'hidden'

function read (store: KeyStore, key: string): string | null {
  try {
    return store.getItem(key)
  } catch (err) {
    if (err instanceof DOMException) return null
    throw err
  }
}

function write (store: KeyStore, key: string, text: string): void {
  try {
    store.setItem(key, text)
  } catch (err) {
    if (!(err instanceof DOMException)) throw err
  }
}

export function readView (store: KeyStore): View {
  const saved = read(store, VIEW_KEY) ?? undefined
  return isView(saved) ? saved : 'ngay'
}

export function writeView (store: KeyStore, view: View): void {
  write(store, VIEW_KEY, view)
}

function parsePeople (text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch (err) {
    if (err instanceof SyntaxError) return []
    throw err
  }
}

export function readOverlay (store: KeyStore): string[] {
  const saved = read(store, OVERLAY_KEY)
  return saved === null ? [] : parsePeople(saved)
}

export function writeOverlay (store: KeyStore, people: string[]): void {
  write(store, OVERLAY_KEY, JSON.stringify(people))
}

export function readShowDeclined (store: KeyStore): boolean {
  return read(store, SHOW_DECLINED_KEY) !== HIDDEN
}

export function writeShowDeclined (store: KeyStore, isShown: boolean): void {
  write(store, SHOW_DECLINED_KEY, isShown ? 'shown' : HIDDEN)
}
