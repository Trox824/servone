import { get } from 'svelte/store'
import { popupstore } from '@hcengineering/ui'

/** True while the user types in a field, or a popup is open: shortcuts stay out of the way. */
export function shouldIgnore (e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return true
  const t = e.target as HTMLElement | null
  if (t !== null && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return true
  return get(popupstore).length > 0
}

export function clickControl (id: string, name: string): boolean {
  const host = document.querySelector(`[data-issue="${CSS.escape(id)}"] [data-kb="${name}"]`)
  const target = host?.matches('button, a') === true ? host : host?.querySelector('button, a')
  if (target instanceof HTMLElement) {
    target.click()
    return true
  }
  return false
}

export function scrollToIssue (id: string): void {
  document.querySelector(`[data-issue="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
}

export function elementOf (id: string): HTMLElement | undefined {
  return (document.querySelector(`[data-issue="${CSS.escape(id)}"]`) as HTMLElement | null) ?? undefined
}

/** Moves a focus index through `count` items; -1 means nothing focused yet. */
export function step (index: number, count: number, delta: number): number {
  if (count === 0) return -1
  if (index < 0) return delta > 0 ? 0 : count - 1
  return Math.min(count - 1, Math.max(0, index + delta))
}
