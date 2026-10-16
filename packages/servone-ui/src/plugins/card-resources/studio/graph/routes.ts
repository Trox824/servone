import { TAB_ID } from '../extensions'
import { parseStudioRoute, STUDIO_CATEGORY, type StudioRoute } from '../routes'
import { type Branch, branchNodeId } from './model'

const LEGACY_GRAPH_CATEGORY = 'servone-quy-trinh'
const SETTINGS_DEPTH = 5
const CATEGORY_INDEX = 4

const CARD_APP_DEPTH = 3
const TYPE_SEGMENT = 'type'
const CANVAS_SEGMENT = 'canvas'
const SETTINGS_SEGMENT = 'settings'
const RELATIONS_SEGMENT = 'relations'
const COMPONENT_MARK = ':component:'
export const PROCESS_EDITOR = 'process:component:ProcessEditor'

export type GraphRoute = { kind: 'company' } | { kind: 'form', typeKey: string, nodeId: string | undefined }

export type GraphOpen = { kind: 'route', route: GraphRoute } | { kind: 'section', section: string }

export interface SubEditor {
  editor: string
  docId: string
}

export type CardView =
  | { kind: 'relations' }
  | { kind: 'records', tagId: string }
  | { kind: 'canvas', tagId: string, nodeId: string | undefined }
  | { kind: 'settings', tagId: string, sub: SubEditor | undefined }

const BRANCH_OF_TAB: Partial<Record<string, Branch>> = {
  [TAB_ID.fields]: 'questions',
  [TAB_ID.links]: 'links',
  [TAB_ID.automation]: 'process',
  [TAB_ID.access]: 'access'
}

function present (segment: string | undefined): string | undefined {
  return segment === undefined || segment === '' ? undefined : segment
}

export function parseCardView (path: readonly string[]): CardView | undefined {
  if (path[CARD_APP_DEPTH] !== TYPE_SEGMENT) return undefined
  const [tagId, view, nodeId] = path.slice(CARD_APP_DEPTH + 1).map(present)
  if (tagId === undefined) return undefined
  if (tagId === RELATIONS_SEGMENT) return { kind: 'relations' }
  if (view === CANVAS_SEGMENT) return { kind: 'canvas', tagId, nodeId }
  if (view === SETTINGS_SEGMENT) return { kind: 'settings', tagId, sub: undefined }
  if (view?.includes(COMPONENT_MARK) === true && nodeId !== undefined) return { kind: 'settings', tagId, sub: { editor: view, docId: nodeId } }
  return { kind: 'records', tagId }
}

export function cardViewPath (current: readonly string[], view: CardView): string[] {
  const base = [...current.slice(0, 2), 'card', TYPE_SEGMENT]
  if (view.kind === 'relations') return [...base, RELATIONS_SEGMENT]
  if (view.kind === 'records') return [...base, view.tagId]
  if (view.kind === 'settings') {
    return view.sub === undefined ? [...base, view.tagId, SETTINGS_SEGMENT] : [...base, view.tagId, view.sub.editor, view.sub.docId]
  }
  const canvas = [...base, view.tagId, CANVAS_SEGMENT]
  return view.nodeId === undefined ? canvas : [...canvas, view.nodeId]
}

export function cardViewOf (route: GraphRoute, tagIdOf: (typeKey: string) => string | undefined): CardView {
  if (route.kind === 'company') return { kind: 'relations' }
  const tagId = tagIdOf(route.typeKey)
  return tagId === undefined ? { kind: 'relations' } : { kind: 'canvas', tagId, nodeId: route.nodeId }
}

export function graphRouteOf (view: CardView, typeKeyOf: (tagId: string) => string | undefined): GraphRoute {
  if (view.kind !== 'canvas') return { kind: 'company' }
  const typeKey = typeKeyOf(view.tagId)
  return typeKey === undefined ? { kind: 'company' } : { kind: 'form', typeKey, nodeId: view.nodeId }
}

export function graphOpenOf (route: StudioRoute): GraphOpen {
  if (route.kind === 'home') return { kind: 'route', route: { kind: 'company' } }
  if (route.kind === 'section') return { kind: 'section', section: route.section }
  const branch = route.tab === undefined ? undefined : BRANCH_OF_TAB[route.tab]
  return { kind: 'route', route: { kind: 'form', typeKey: route.typeKey, nodeId: branch === undefined ? undefined : branchNodeId(branch) } }
}

export function legacyGraphRoute (path: readonly string[]): GraphRoute | undefined {
  const category = path[CATEGORY_INDEX]
  if (category === STUDIO_CATEGORY) {
    const open = graphOpenOf(parseStudioRoute(path))
    return open.kind === 'route' ? open.route : { kind: 'company' }
  }
  if (category !== LEGACY_GRAPH_CATEGORY) return undefined
  const [typeKey, nodeId] = path.slice(SETTINGS_DEPTH).map(present)
  return typeKey === undefined ? { kind: 'company' } : { kind: 'form', typeKey, nodeId }
}
