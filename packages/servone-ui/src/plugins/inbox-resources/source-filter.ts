export type KeyStore = Pick<Storage, 'getItem' | 'setItem'>

export interface SourceCount<S extends string> {
  source: S
  count: number
}

const KEY_PREFIX = 'servone.inbox.hiddenSources.'

export function visibleItems<E extends { _class: string }> (items: E[], hidden: ReadonlySet<string>): E[] {
  return hidden.size === 0 ? items : items.filter((it) => !hidden.has(it._class))
}

export function sourceCounts<S extends string> (items: Array<{ _class: S }>, hidden: ReadonlySet<S>): Array<SourceCount<S>> {
  const counts = new Map<S, number>()
  for (const it of items) counts.set(it._class, (counts.get(it._class) ?? 0) + 1)
  for (const source of hidden) if (!counts.has(source)) counts.set(source, 0)
  return [...counts].map(([source, count]) => ({ source, count }))
}

export function readHidden<S extends string> (store: KeyStore, workspace: string): Set<S> {
  let text: string | null
  try {
    text = store.getItem(KEY_PREFIX + workspace)
  } catch (err) {
    if (err instanceof DOMException) return new Set()
    throw err
  }
  if (text === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(text)
    return new Set(Array.isArray(parsed) ? parsed.filter((s): s is S => typeof s === 'string') : [])
  } catch (err) {
    if (err instanceof SyntaxError) return new Set()
    throw err
  }
}

export function writeHidden (store: KeyStore, workspace: string, hidden: ReadonlySet<string>): void {
  try {
    store.setItem(KEY_PREFIX + workspace, JSON.stringify([...hidden]))
  } catch (err) {
    if (!(err instanceof DOMException)) throw err
  }
}
