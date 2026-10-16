import type { Edge, Node, Viewport } from '@xyflow/svelte'
import { nodeSize, type Point } from './layout'
import type { Graph, GraphEdge, GraphNode, Outcome } from './model'

export type FlowData = { node: GraphNode, width: number, isMatch: boolean, isNew: boolean, canAdd: boolean }

export type Drop = { kind: 'node', nodeId: string } | { kind: 'pane' }

export const NODE_TYPE = 'studio'

export const ACCENT = 'var(--primary-button-default)'
export const OUTCOME_COLOR: Record<Outcome, string> = {
  approved: 'var(--theme-state-positive-color)',
  rejected: 'var(--theme-state-negative-color)'
}
const LINE_COLOR = 'var(--theme-trans-color)'
const LINE_WIDTH = '1.6px'
const DASH = '5 5'
const ORIGIN: Point = { x: 0, y: 0 }
const MAX_ZOOM = 1
const MIN_ZOOM = 0.8
const PANE_PADDING = 24

export interface Pane {
  width: number
  height: number
}

export function flowNodes (
  graph: Graph,
  positions: Map<string, Point>,
  matches: ReadonlySet<string>,
  selectedId: string | undefined,
  newIds: ReadonlySet<string>,
  canEdit: boolean
): Array<Node<FlowData>> {
  return graph.nodes.map((node) => {
    const canAdd = canEdit && node.kind === 'type'
    return {
      id: node.id,
      type: NODE_TYPE,
      position: positions.get(node.id) ?? ORIGIN,
      selected: node.id === selectedId,
      connectable: canAdd,
      data: { node, width: nodeSize(node).width, isMatch: matches.has(node.id), isNew: newIds.has(node.id), canAdd }
    }
  })
}

function colorOf (edge: GraphEdge): string {
  if (edge.outcome !== undefined) return OUTCOME_COLOR[edge.outcome]
  return edge.style === 'rule' ? ACCENT : LINE_COLOR
}

function edgeOf (edge: GraphEdge): Edge {
  const color = colorOf(edge)
  const stroke = `stroke: ${color}; stroke-width: ${LINE_WIDTH};`
  const flowEdge: Edge = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'default',
    style: edge.style === 'rule' ? `${stroke} stroke-dasharray: ${DASH};` : stroke
  }
  if (edge.outcome !== undefined) flowEdge.labelStyle = `color: ${color}; font-weight: 600;`
  return flowEdge
}

export function flowEdges (graph: Graph): Edge[] {
  return graph.edges.map(edgeOf)
}

export function startViewport (graph: Graph, positions: Map<string, Point>, pane: Pane): Viewport {
  const boxes = graph.nodes.map((node) => ({ ...(positions.get(node.id) ?? ORIGIN), ...nodeSize(node) }))
  const left = Math.min(...boxes.map((it) => it.x))
  const top = Math.min(...boxes.map((it) => it.y))
  const width = Math.max(...boxes.map((it) => it.x + it.width)) - left
  const height = Math.max(...boxes.map((it) => it.y + it.height)) - top
  const roomX = pane.width - 2 * PANE_PADDING
  const roomY = pane.height - 2 * PANE_PADDING
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(roomX / width, roomY / height)))
  const offset = (room: number, size: number): number => PANE_PADDING + Math.max(0, (room - size * zoom) / 2)
  const root = graph.nodes.find((it) => it.kind === 'form')
  if (root !== undefined && height * zoom > roomY) {
    const rootMiddle = (positions.get(root.id) ?? ORIGIN).y + nodeSize(root).height / 2
    return { x: offset(roomX, width) - left * zoom, y: pane.height / 2 - rootMiddle * zoom, zoom }
  }
  return { x: offset(roomX, width) - left * zoom, y: offset(roomY, height) - top * zoom, zoom }
}
