export const STUDIO_CATEGORY = 'servone-studio'
export const TYPE_SEGMENT = 'loai'

const STUDIO_DEPTH = 5

export type StudioRoute =
  | { kind: 'home' }
  | { kind: 'type', typeKey: string, tab?: string }
  | { kind: 'section', section: string }

export function parseStudioRoute (path: readonly string[]): StudioRoute {
  const [first, typeKey, tab] = path.slice(STUDIO_DEPTH)
  if (first === undefined || first === '') return { kind: 'home' }
  if (first !== TYPE_SEGMENT) return { kind: 'section', section: first }
  if (typeKey === undefined || typeKey === '') return { kind: 'home' }
  return tab === undefined || tab === '' ? { kind: 'type', typeKey } : { kind: 'type', typeKey, tab }
}
