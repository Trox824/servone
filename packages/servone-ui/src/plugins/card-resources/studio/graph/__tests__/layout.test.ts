import type { ElkNode } from 'elkjs/lib/elk-api'
import { recordType, snapshotOf, link } from '../../__tests__/fixtures'
import { alignSiblings, layoutGraph, nodeSize, positionsOf, toElk } from '../layout'
import { companyGraph, type GraphNode } from '../model'

const graph = companyGraph(
  snapshotOf({ types: [recordType('a', 'A'), recordType('b', 'Bảng dài hơn nhiều so với A')], links: [link('ab', 'a', 'b')] }),
  new Set()
)

function plain (label: string): GraphNode {
  return {
    id: 'x',
    kind: 'step',
    label,
    detail: '',
    lines: [],
    chips: [],
    state: undefined,
    branch: 'questions',
    isPending: false,
    target: { kind: 'none' }
  }
}

describe('layout', () => {
  it('lines up the children of one parent on a single left edge', () => {
    const tree = {
      nodes: graph.nodes,
      edges: [
        { id: 'a-b', source: 'a', target: 'b', label: '', style: 'tree' as const, branch: undefined, outcome: undefined },
        { id: 'a-c', source: 'a', target: 'c', label: '', style: 'tree' as const, branch: undefined, outcome: undefined }
      ]
    }
    const aligned = alignSiblings(tree, new Map([['a', { x: 0, y: 0 }], ['b', { x: 300, y: 0 }], ['c', { x: 322, y: 60 }]]))
    expect(aligned.get('c')).toEqual({ x: 300, y: 60 })
    expect(aligned.get('a')).toEqual({ x: 0, y: 0 })
  })

  it('sizes boxes by their longest text within bounds', () => {
    expect(nodeSize(plain('A'))).toEqual({ width: 120, height: 40 })
    expect(nodeSize(plain('x'.repeat(200)))).toEqual({ width: 300, height: 40 })
    expect(nodeSize({ ...plain('A'), detail: 'có bước duyệt' }).height).toBe(60)
  })

  it('grows for step lines, a state pill and chip rows', () => {
    expect(nodeSize({ ...plain('Rồi'), lines: ['Đặt Số ngày = 1', 'Khóa đề nghị'], state: 'Xong' }).height).toBe(98)
    const chip = { kind: 'person' as const, label: 'Trưởng phòng' }
    expect(nodeSize({ ...plain('A'), chips: [chip, chip, chip] }).height).toBe(88)
    expect(nodeSize({ ...plain('A'), lines: ['x'.repeat(20)] }).width).toBe(20 * 8 + 48)
    expect(nodeSize({ ...plain('A'), chips: [chip, chip] }).width).toBe(2 * (12 * 6.5 + 34) + 48)
  })

  it('gives every leaf, group and add row the same column width', () => {
    expect(nodeSize({ ...plain('Tên'), kind: 'question', detail: 'Chữ' })).toEqual({ width: 256, height: 40 })
    expect(nodeSize({ ...plain('x'.repeat(40)), kind: 'question', detail: 'y'.repeat(10) }).width).toBe(256)
    expect(nodeSize({ ...plain('SLA'), kind: 'group' }).width).toBe(256)
    expect(nodeSize({ ...plain('x'.repeat(30)), kind: 'add' }).width).toBe(30 * 8 + 48)
  })

  it('hands ELK every node and edge with the map options', () => {
    const elkGraph = toElk(graph, 'company')
    expect(elkGraph.layoutOptions?.['elk.algorithm']).toBe('layered')
    expect(toElk(graph, 'form').layoutOptions?.['elk.algorithm']).toBe('layered')
    expect(elkGraph.children?.map((it) => it.id)).toEqual(['type:a', 'type:b', 'add:type'])
    expect(elkGraph.edges).toEqual([{ id: 'link:ab', sources: ['type:a'], targets: ['type:b'] }])
  })

  it('reads positions back from the laid-out graph', async () => {
    const run = async (input: ElkNode): Promise<ElkNode> => ({
      ...input,
      children: (input.children ?? []).map((child, index) => ({ ...child, x: index * 10, y: 5 }))
    })
    const positions = await layoutGraph(graph, 'company', run)
    expect(positions.get('type:b')).toEqual({ x: 10, y: 5 })
    expect(positionsOf({ id: 'root', children: [{ id: 'n' }] }).get('n')).toEqual({ x: 0, y: 0 })
  })
})
