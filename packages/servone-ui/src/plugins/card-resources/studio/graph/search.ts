import type { Graph } from './model'

export const FOCUS_THRESHOLD = 40

export function focusGraph (graph: Graph, nodeId: string): Graph {
  const kept = new Set([nodeId])
  for (const edge of graph.edges) {
    if (edge.source === nodeId) kept.add(edge.target)
    if (edge.target === nodeId) kept.add(edge.source)
  }
  return {
    nodes: graph.nodes.filter((it) => kept.has(it.id)),
    edges: graph.edges.filter((it) => kept.has(it.source) && kept.has(it.target))
  }
}
