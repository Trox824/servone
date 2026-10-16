import type { ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'
import type { Graph, GraphNode, NodeKind } from './model'

export type MapKind = 'company' | 'form'

export interface Point {
  x: number
  y: number
}

export interface NodeSize {
  width: number
  height: number
}

const CHAR_WIDTH = 8
const NODE_PADDING = 48
const MIN_WIDTH = 120
const MAX_WIDTH = 300
const COLUMN_WIDTH = 256
const LEAF_KINDS: ReadonlySet<NodeKind> = new Set(['question', 'inherited', 'link', 'access'])
const COLUMN_KINDS: ReadonlySet<NodeKind> = new Set(['group', 'add'])
const ROW_HEIGHT = 40
const TALL_HEIGHT = 60
const LINE_HEIGHT = 18
const PILL_HEIGHT = 22
const CHIP_ROW_HEIGHT = 24
const CHIPS_PER_ROW = 2
const CHIP_CHAR_WIDTH = 6.5
const CHIP_PADDING = 34

const OPTIONS: Record<MapKind, LayoutOptions> = {
  company: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '120'
  },
  form: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '12',
    'elk.layered.spacing.nodeNodeBetweenLayers': '56',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES'
  }
}

function rowsOf<T> (items: T[]): T[][] {
  return Array.from({ length: Math.ceil(items.length / CHIPS_PER_ROW) }, (_, row) => items.slice(row * CHIPS_PER_ROW, (row + 1) * CHIPS_PER_ROW))
}

export function isLeaf (kind: NodeKind): boolean {
  return LEAF_KINDS.has(kind)
}

export function nodeSize (node: GraphNode): NodeSize {
  if (isLeaf(node.kind)) return { width: COLUMN_WIDTH, height: ROW_HEIGHT }
  const longest = Math.max(...[node.label, node.detail, ...node.lines].map((it) => it.length))
  const chipRow = Math.max(0, ...rowsOf(node.chips).map((row) => row.reduce((sum, chip) => sum + chip.label.length * CHIP_CHAR_WIDTH + CHIP_PADDING, 0)))
  const minWidth = COLUMN_KINDS.has(node.kind) ? COLUMN_WIDTH : MIN_WIDTH
  const width = Math.min(MAX_WIDTH, Math.max(minWidth, longest * CHAR_WIDTH + NODE_PADDING, chipRow + NODE_PADDING))
  const isTall = node.detail !== '' || node.isPending
  const extra =
    node.lines.length * LINE_HEIGHT +
    (node.state === undefined ? 0 : PILL_HEIGHT) +
    Math.ceil(node.chips.length / CHIPS_PER_ROW) * CHIP_ROW_HEIGHT
  return { width, height: (isTall ? TALL_HEIGHT : ROW_HEIGHT) + extra }
}

export function toElk (graph: Graph, kind: MapKind): ElkNode {
  return {
    id: 'root',
    layoutOptions: OPTIONS[kind],
    children: graph.nodes.map((it) => ({ id: it.id, ...nodeSize(it) })),
    edges: graph.edges.map((it) => ({ id: it.id, sources: [it.source], targets: [it.target] }))
  }
}

export function positionsOf (laidOut: ElkNode): Map<string, Point> {
  return new Map((laidOut.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]))
}

export type RunLayout = (graph: ElkNode) => Promise<ElkNode>

export function alignSiblings (graph: Graph, positions: Map<string, Point>): Map<string, Point> {
  const childrenOf = new Map<string, string[]>()
  for (const edge of graph.edges) childrenOf.set(edge.source, [...(childrenOf.get(edge.source) ?? []), edge.target])
  const aligned = new Map(positions)
  for (const children of childrenOf.values()) {
    const placed = children.flatMap((id) => {
      const point = aligned.get(id)
      return point === undefined ? [] : [{ id, point }]
    })
    const left = Math.min(...placed.map((it) => it.point.x))
    for (const { id, point } of placed) aligned.set(id, { x: left, y: point.y })
  }
  return aligned
}

export async function layoutGraph (graph: Graph, kind: MapKind, run: RunLayout): Promise<Map<string, Point>> {
  const positions = positionsOf(await run(toElk(graph, kind)))
  return kind === 'form' ? alignSiblings(graph, positions) : positions
}
