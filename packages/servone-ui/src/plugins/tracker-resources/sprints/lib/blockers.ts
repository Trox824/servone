import { isOpen, type StatusKind } from './types'

/** "`from` blocks `to`". */
export interface Dependency {
  from: string
  to: string
}

export interface BlockerInfo {
  _id: string
  status: StatusKind
}

export interface BlockedState {
  /** Open issues each issue waits on, by issue id; only issues with at least one. */
  blockedBy: Map<string, string[]>
  /** Open issues each issue holds up, by issue id; only issues with at least one. */
  blocking: Map<string, string[]>
}

export function blockedState (deps: Dependency[], issues: Map<string, BlockerInfo>): BlockedState {
  const blockedBy = new Map<string, string[]>()
  const blocking = new Map<string, string[]>()
  const seen = new Set<string>()
  for (const d of deps) {
    if (d.from === d.to) continue
    const key = `${d.from}>${d.to}`
    if (seen.has(key)) continue
    seen.add(key)
    const from = issues.get(d.from)
    const to = issues.get(d.to)
    if (from !== undefined && !isOpen(from.status)) continue
    if (to === undefined || !isOpen(to.status)) continue
    blockedBy.set(d.to, [...(blockedBy.get(d.to) ?? []), d.from])
    blocking.set(d.from, [...(blocking.get(d.from) ?? []), d.to])
  }
  return { blockedBy, blocking }
}
