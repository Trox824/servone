<script lang="ts">
  import {
    Background,
    BackgroundVariant,
    ControlButton,
    Controls,
    MiniMap,
    SvelteFlow,
    type Edge,
    type Node
  } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import { Network, Undo2 } from '@lucide/svelte'
  import { text } from '../../strings'
  import { ACCENT, flowEdges, flowNodes, NODE_TYPE, startViewport, type Drop, type FlowData } from '../flow'
  import type { Point } from '../layout'
  import type { Graph } from '../model'
  import GraphNode from './GraphNode.svelte'

  export let graph: Graph
  export let positions: Map<string, Point>
  export let matches: ReadonlySet<string>
  export let newIds: ReadonlySet<string>
  export let selectedId: string | undefined
  export let canEdit: boolean
  export let isCompany: boolean
  export let onSelect: (nodeId: string) => void
  export let onDrop: (sourceId: string, drop: Drop) => void
  export let undoSummary: string | undefined
  export let onUndo: () => void
  export let onRelayout: () => void

  const MINIMAP_WIDTH = 168
  const MINIMAP_HEIGHT = 104
  const nodeTypes = { [NODE_TYPE]: GraphNode }

  let nodes: Array<Node<FlowData>> = []
  let edges: Edge[] = []
  let paneWidth = 0
  let paneHeight = 0
  $: nodes = flowNodes(graph, positions, matches, selectedId, newIds, canEdit)
  $: edges = flowEdges(graph)

  function dropOf (event: MouseEvent | TouchEvent): Drop {
    const point = 'changedTouches' in event ? event.changedTouches.item(0) : event
    if (point === null) return { kind: 'pane' }
    const nodeId = document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? undefined
    return nodeId === undefined ? { kind: 'pane' } : { kind: 'node', nodeId }
  }
</script>

<div class="graph-canvas" data-id="graph-canvas" bind:clientWidth={paneWidth} bind:clientHeight={paneHeight}>
  <!-- The start view needs the pane size; GraphStudio remounts this canvas after every layout. -->
  {#if paneWidth > 0 && paneHeight > 0}
    <SvelteFlow
      bind:nodes
      bind:edges
      {nodeTypes}
      initialViewport={startViewport(graph, positions, { width: paneWidth, height: paneHeight })}
      nodesConnectable={canEdit}
      clickConnect={false}
      isValidConnection={() => false}
      proOptions={{ hideAttribution: true }}
      onnodeclick={({ node, event }) => {
        if (event.target instanceof Element && event.target.closest('.graph-plus') !== null) return
        onSelect(node.id)
      }}
      onconnectend={(event, connection) => {
        if (connection.fromNode !== null) onDrop(connection.fromNode.id, dropOf(event))
      }}
    >
      <Background variant={BackgroundVariant.Dots} />
      <Controls position="bottom-left" showLock={false}>
        {#if canEdit}
          {@const undoTitle = undoSummary === undefined ? text('GraphNothingToUndo') : `${text('Undo')}: ${undoSummary}`}
          <ControlButton title={undoTitle} aria-label={undoTitle} disabled={undoSummary === undefined} onclick={onUndo} data-id="graph-undo">
            <Undo2 size={16} />
          </ControlButton>
        {/if}
        <ControlButton title={text('GraphRelayout')} aria-label={text('GraphRelayout')} onclick={onRelayout}>
          <Network size={16} />
        </ControlButton>
      </Controls>
      {#if isCompany}
        <MiniMap position="bottom-right" width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} />
      {/if}
    </SvelteFlow>
  {/if}
  {#if isCompany}
    <div class="graph-legend" data-id="graph-legend">
      <span class="graph-legend-item">
        <svg width="26" height="6" aria-hidden="true"><path d="M0 3H26" stroke="var(--theme-trans-color)" stroke-width="1.6" /></svg>
        {text('GraphLegendLink')}
      </span>
      <span class="graph-legend-item">
        <svg width="26" height="6" aria-hidden="true"><path d="M0 3H26" stroke={ACCENT} stroke-width="1.6" stroke-dasharray="5 5" /></svg>
        {text('GraphLegendAuto')}
      </span>
      <span class="graph-legend-item">
        <span class="graph-legend-wait">{text('GraphPending')}</span>
        {text('GraphLegendPending')}
      </span>
    </div>
  {/if}
</div>

<style>
  /* Svelte Flow fills control icons; Lucide icons are strokes and turn into blobs when filled. */
  .graph-canvas :global(.svelte-flow__controls-button svg.lucide) {
    fill: none;
  }
  .graph-canvas {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .graph-legend {
    position: absolute;
    left: 62px;
    bottom: 14px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 12px;
    border: 1px solid var(--theme-button-border);
    border-radius: 8px;
    background: var(--theme-popup-color);
    color: var(--theme-dark-color);
    font-size: 12px;
  }
  .graph-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .graph-legend-wait {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--theme-button-warning-bg);
    color: var(--theme-button-warning-color);
    font-size: 11px;
  }
  .graph-canvas :global(.svelte-flow__edge-label) {
    padding: 1px 7px;
    border: 1px solid var(--theme-button-border);
    border-radius: 5px;
    background: var(--theme-popup-color);
    color: var(--theme-dark-color);
    font-size: 11.5px;
    line-height: 18px;
    white-space: nowrap;
  }
  /* Svelte Flow draws 26px buttons; the checklist needs 32px tap targets. */
  .graph-canvas :global(.svelte-flow__controls-button) {
    width: 32px;
    height: 32px;
  }
</style>
