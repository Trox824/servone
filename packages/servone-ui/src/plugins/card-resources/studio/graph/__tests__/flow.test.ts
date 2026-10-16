import type { AutomationInfo } from '@servone/config'
import { link, recordType, snapshotOf } from '../../__tests__/fixtures'
import { flowEdges, flowNodes, startViewport } from '../flow'
import { nodeSize } from '../layout'
import { companyGraph, formGraph } from '../model'

const approveThenCreate: AutomationInfo = {
  key: 'xin',
  name: 'Xin',
  sentences: [],
  automation: {
    name: 'Xin',
    trigger: { kind: 'created' },
    actions: [{ kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }],
    onApproved: [{ kind: 'createLinked', type: 'b', link: 'ab', title: 'B', values: [] }]
  }
}
const snapshot = snapshotOf({
  types: [recordType('a', 'A', { automations: [approveThenCreate] }), recordType('b', 'B')],
  links: [link('ab', 'a', 'b', { fromName: 'Người gửi' })]
})
const company = companyGraph(snapshot, new Set())

describe('flowNodes', () => {
  it('places nodes, marks hits, the selection and new boxes, and puts the "+" only on forms', () => {
    const nodes = flowNodes(company, new Map([['type:a', { x: 10, y: 20 }]]), new Set(['type:b']), 'type:a', new Set(['type:b']), true)
    expect(nodes.map((it) => [it.id, it.position, it.selected, it.connectable, it.data.isMatch, it.data.isNew, it.data.canAdd])).toEqual([
      ['type:a', { x: 10, y: 20 }, true, true, false, false, true],
      ['type:b', { x: 0, y: 0 }, false, true, true, true, true],
      ['add:type', { x: 0, y: 0 }, false, false, false, false, false]
    ])
    expect(nodes.every((it) => it.type === 'studio')).toBe(true)
    expect(nodes.map((it) => it.data.width)).toEqual(company.nodes.map((it) => nodeSize(it).width))
  })

  it('offers no "+" on a read-only map', () => {
    const nodes = flowNodes(company, new Map(), new Set(), undefined, new Set(), false)
    expect(nodes.some((it) => it.connectable === true || it.data.canAdd)).toBe(false)
  })
})

describe('flowEdges', () => {
  it('draws a connection as a neutral line with its phrase', () => {
    expect(flowEdges(company).find((it) => it.id === 'link:ab')).toEqual({
      id: 'link:ab',
      source: 'type:a',
      target: 'type:b',
      label: 'Người gửi',
      type: 'default',
      style: 'stroke: var(--theme-trans-color); stroke-width: 1.6px;'
    })
  })

  it('dashes a step that creates a form in the Huly accent', () => {
    const created = flowEdges(company).find((it) => it.id.startsWith('rule:'))
    expect(created?.label).toBe('khi được duyệt → tự tạo')
    expect(created?.style).toBe('stroke: var(--primary-button-default); stroke-width: 1.6px; stroke-dasharray: 5 5;')
  })

  it('colours Duyệt and Từ chối with the state colours', () => {
    const form = formGraph(snapshot, 'a', new Set())
    if (form === undefined) throw new Error('form expected')
    const edges = flowEdges(form)
    const approved = edges.find((it) => it.id === 'r:xin:approval->r:xin:approved')
    const rejected = edges.find((it) => it.id === 'r:xin:approval->r:xin:rejected')
    expect(approved).toMatchObject({
      label: 'Duyệt',
      style: 'stroke: var(--theme-state-positive-color); stroke-width: 1.6px;',
      labelStyle: 'color: var(--theme-state-positive-color); font-weight: 600;'
    })
    expect(rejected).toMatchObject({ label: 'Từ chối', style: 'stroke: var(--theme-state-negative-color); stroke-width: 1.6px;' })
  })
})

describe('startViewport', () => {
  const positions = new Map([['type:a', { x: 100, y: 50 }], ['type:b', { x: 400, y: 50 }], ['add:type', { x: 100, y: 200 }]])
  const size = (id: string): { width: number, height: number } => nodeSize(company.nodes.find((it) => it.id === id) ?? company.nodes[0])
  const right = 400 + size('type:b').width
  const bottom = 200 + size('add:type').height

  it('centres a small map at 100%', () => {
    const view = startViewport(company, positions, { width: 2000, height: 1000 })
    expect(view.zoom).toBe(1)
    expect(view.x + 100 - (2000 - (view.x + right))).toBeCloseTo(0)
    expect(view.y + 50 - (1000 - (view.y + bottom))).toBeCloseTo(0)
  })

  it('starts a map too big for the pane at its top-left corner, never below 80%', () => {
    const view = startViewport(company, positions, { width: 300, height: 150 })
    expect(view.zoom).toBe(0.8)
    expect(view.x + 100 * view.zoom).toBe(24)
    expect(view.y + 50 * view.zoom).toBe(24)
  })

  it('keeps the form box of a tall form map in the middle of the pane', () => {
    const form = formGraph(snapshot, 'a', new Set())
    const root = form.nodes.find((it) => it.kind === 'form')
    const rootId = root?.id ?? ''
    const spread = new Map(form.nodes.map((it, index) => [it.id, { x: 0, y: index * 200 }]))
    spread.set(rootId, { x: 0, y: 1000 })
    const view = startViewport(form, spread, { width: 800, height: 400 })
    expect(view.y + (1000 + nodeSize(root ?? form.nodes[0]).height / 2) * view.zoom).toBe(200)
  })
})
