import { cardViewOf, cardViewPath, graphOpenOf, graphRouteOf, legacyGraphRoute, parseCardView } from '../routes'

const typeBase = ['workbench', 'ws', 'card', 'type']
const settings = ['workbench', 'ws', 'setting', 'setting']
const tagIds = new Map([['nghi-phep', 'tag-1']])
const tagIdOf = (typeKey: string): string | undefined => tagIds.get(typeKey)
const typeKeyOf = (tagId: string): string | undefined => [...tagIds].find(([, id]) => id === tagId)?.[0]

describe('parseCardView', () => {
  it('reads records, the canvas, the settings and the relations map', () => {
    expect(parseCardView([...typeBase, 'tag-1'])).toEqual({ kind: 'records', tagId: 'tag-1' })
    expect(parseCardView([...typeBase, 'tag-1', 'canvas'])).toEqual({ kind: 'canvas', tagId: 'tag-1', nodeId: undefined })
    expect(parseCardView([...typeBase, 'tag-1', 'canvas', 'q:so-ngay'])).toEqual({ kind: 'canvas', tagId: 'tag-1', nodeId: 'q:so-ngay' })
    expect(parseCardView([...typeBase, 'tag-1', 'settings'])).toEqual({ kind: 'settings', tagId: 'tag-1', sub: undefined })
    expect(parseCardView([...typeBase, 'relations'])).toEqual({ kind: 'relations' })
  })

  it('reads a stock settings sub-editor written into the path', () => {
    expect(parseCardView([...typeBase, 'tag-1', 'process:component:ProcessEditor', 'p1'])).toEqual({
      kind: 'settings',
      tagId: 'tag-1',
      sub: { editor: 'process:component:ProcessEditor', docId: 'p1' }
    })
  })

  it('treats an unknown sub-view as records, and a path with no type as nothing', () => {
    expect(parseCardView([...typeBase, 'tag-1', 'other'])).toEqual({ kind: 'records', tagId: 'tag-1' })
    expect(parseCardView(typeBase)).toBeUndefined()
    expect(parseCardView(['workbench', 'ws', 'card', 'space-1'])).toBeUndefined()
  })
})

describe('cardViewPath', () => {
  it('builds each view from the Cards prefix of the current path', () => {
    const current = [...typeBase, 'old', 'canvas', 'x']
    expect(cardViewPath(current, { kind: 'records', tagId: 'tag-1' })).toEqual([...typeBase, 'tag-1'])
    expect(cardViewPath(current, { kind: 'canvas', tagId: 'tag-1', nodeId: undefined })).toEqual([...typeBase, 'tag-1', 'canvas'])
    expect(cardViewPath(current, { kind: 'canvas', tagId: 'tag-1', nodeId: 'r:duyet' })).toEqual([...typeBase, 'tag-1', 'canvas', 'r:duyet'])
    expect(cardViewPath(current, { kind: 'settings', tagId: 'tag-1', sub: undefined })).toEqual([...typeBase, 'tag-1', 'settings'])
    expect(cardViewPath(current, { kind: 'settings', tagId: 'tag-1', sub: { editor: 'process:component:ProcessEditor', docId: 'p1' } })).toEqual([
      ...typeBase,
      'tag-1',
      'process:component:ProcessEditor',
      'p1'
    ])
    expect(cardViewPath(current, { kind: 'relations' })).toEqual([...typeBase, 'relations'])
  })

  it('builds a Cards path from a path outside the Cards app', () => {
    expect(cardViewPath([...settings, 'servone-quy-trinh'], { kind: 'relations' })).toEqual([...typeBase, 'relations'])
  })
})

describe('graph and card views', () => {
  it('maps the relations map and a form canvas both ways', () => {
    expect(cardViewOf({ kind: 'company' }, tagIdOf)).toEqual({ kind: 'relations' })
    expect(cardViewOf({ kind: 'form', typeKey: 'nghi-phep', nodeId: 'q:a' }, tagIdOf)).toEqual({ kind: 'canvas', tagId: 'tag-1', nodeId: 'q:a' })
    expect(graphRouteOf({ kind: 'relations' }, typeKeyOf)).toEqual({ kind: 'company' })
    expect(graphRouteOf({ kind: 'canvas', tagId: 'tag-1', nodeId: 'q:a' }, typeKeyOf)).toEqual({ kind: 'form', typeKey: 'nghi-phep', nodeId: 'q:a' })
  })

  it('falls back to the relations map for a form whose type is gone', () => {
    expect(cardViewOf({ kind: 'form', typeKey: 'missing', nodeId: undefined }, tagIdOf)).toEqual({ kind: 'relations' })
    expect(graphRouteOf({ kind: 'canvas', tagId: 'tag-9', nodeId: undefined }, typeKeyOf)).toEqual({ kind: 'company' })
  })
})

describe('legacyGraphRoute', () => {
  it('reads old graph page links', () => {
    expect(legacyGraphRoute([...settings, 'servone-quy-trinh'])).toEqual({ kind: 'company' })
    expect(legacyGraphRoute([...settings, 'servone-quy-trinh', 'nghi-phep', 'q:a'])).toEqual({ kind: 'form', typeKey: 'nghi-phep', nodeId: 'q:a' })
  })

  it('reads old Studio links', () => {
    expect(legacyGraphRoute([...settings, 'servone-studio', 'loai', 'leave', 'lien-ket'])).toEqual({
      kind: 'form',
      typeKey: 'leave',
      nodeId: 'branch:links'
    })
    expect(legacyGraphRoute([...settings, 'servone-studio', 'lich-su'])).toEqual({ kind: 'company' })
  })

  it('ignores every other settings page', () => {
    expect(legacyGraphRoute([...settings, 'general'])).toBeUndefined()
  })
})

describe('graphOpenOf', () => {
  it('turns Studio routes from shared editors into graph moves', () => {
    expect(graphOpenOf({ kind: 'home' })).toEqual({ kind: 'route', route: { kind: 'company' } })
    expect(graphOpenOf({ kind: 'type', typeKey: 'a', tab: 'lien-ket' })).toEqual({
      kind: 'route',
      route: { kind: 'form', typeKey: 'a', nodeId: 'branch:links' }
    })
    expect(graphOpenOf({ kind: 'section', section: 'lich-su' })).toEqual({ kind: 'section', section: 'lich-su' })
  })
})
