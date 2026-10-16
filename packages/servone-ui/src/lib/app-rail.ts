import type { Doc } from '@hcengineering/core'
import type { Location } from '@hcengineering/ui'

export const APP_ORDER_ATTACHED_TO = 'servone:app-rail-order'

export const UNSHIPPED_APP_ALIASES: readonly string[] = ['card', 'process', 'team', 'recruit', 'hr', 'lead', 'testManagement', 'mail']
const CARD_ALIAS = 'card'
const CARD_APP_PAGES = ['browser', 'type', 'all']

export function hiddenAppRedirect (loc: Location, homeAlias: string): Location | undefined {
  const alias = loc.path[2]
  if (alias === undefined || !UNSHIPPED_APP_ALIASES.includes(alias)) return undefined
  const isCardLink = alias === CARD_ALIAS && loc.path.length === 4 && !CARD_APP_PAGES.includes(loc.path[3])
  if (isCardLink) return undefined
  return { path: [loc.path[0], loc.path[1], homeAlias], fragment: loc.fragment }
}

export interface RailApp {
  _id: string
  order?: number
  position?: 'top' | 'mid' | 'bottom'
}

const POSITION_RANK = { top: 0, mid: 1, bottom: 2 }
const positionRank = (app: RailApp): number => POSITION_RANK[app.position ?? 'mid']

export function parseAppOrder (doc: Doc): string[] {
  if (!('servoneAppOrder' in doc) || !Array.isArray(doc.servoneAppOrder)) return []
  return doc.servoneAppOrder.filter((id): id is string => typeof id === 'string')
}

export function arrangeApps<T extends RailApp> (
  apps: T[],
  savedOrder: readonly string[],
  unavailable: ReadonlySet<string>
): T[] {
  const byModel = apps
    .filter((app) => !unavailable.has(app._id))
    .sort((a, b) => positionRank(a) - positionRank(b) || (a.order ?? Infinity) - (b.order ?? Infinity))
  const rank = new Map(savedOrder.map((id, index) => [id, index]))
  return byModel
    .map((app, index) => ({ app, key: rank.get(app._id) ?? savedOrder.length + index }))
    .sort((a, b) => a.key - b.key)
    .map(({ app }) => app)
}

export function moveApp (ids: readonly string[], movedId: string, targetId: string): string[] {
  const from = ids.indexOf(movedId)
  const to = ids.indexOf(targetId)
  if (from === -1 || to === -1) return [...ids]
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, movedId)
  return next
}
