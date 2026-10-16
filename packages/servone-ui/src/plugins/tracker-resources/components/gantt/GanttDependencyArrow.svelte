<svelte:options namespace="svg" />

<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Ref } from '@hcengineering/core'
  import type { Issue, IssueRelation } from '@hcengineering/tracker'
  import {
    type ArrowVisibility,
    type BarRect,
    type YBounds,
    anchorOf,
    arrowheadPoints,
    bezierHitPath,
    bezierPath,
    clippedEndpointPx,
    endpointPx,
    pathMidpoint
  } from './lib/dependency-router'
  import { kindCode, signedLag } from './lib/predecessor-format'
  import { translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/ui'
  import tracker from '../../plugin'

  type OffscreenEdge = 'top' | 'bottom'

  export let relation: IssueRelation
  export let sourceBar: BarRect | null
  export let targetBar: BarRect | null
  export let dimmed: boolean = false
  export let isCritical: boolean = false
  export let isViolated: boolean = false
  export let visibility: ArrowVisibility = { kind: 'both-visible' }
  export let yBounds: YBounds | undefined = undefined

  const dispatch = createEventDispatcher<{
    openEditor: { relation: IssueRelation }
    hoverEdge: { source: Ref<Issue>, target: Ref<Issue> } | null
    scrollToRow: { issue: Ref<Issue> }
  }>()

  const LAG_PILL_MIN_WIDTH = 28
  const LAG_PILL_CHAR_WIDTH = 6
  const LAG_PILL_PADDING = 8
  const LAG_PILL_HEIGHT = 16
  const INDICATOR_WIDTH = 10
  const INDICATOR_HEIGHT = 8

  function sourceOffscreenEdge (state: ArrowVisibility): OffscreenEdge | undefined {
    return state.kind === 'target-only' || state.kind === 'both-off' ? state.sourceEdge : undefined
  }

  function targetOffscreenEdge (state: ArrowVisibility): OffscreenEdge | undefined {
    return state.kind === 'source-only' || state.kind === 'both-off' ? state.targetEdge : undefined
  }

  async function indicatorSentence (
    edge: OffscreenEdge | undefined,
    side: 'source' | 'target',
    language: string
  ): Promise<string> {
    if (edge === undefined) return ''
    const sentenceKey =
      side === 'source'
        ? edge === 'top'
          ? tracker.string.GanttArrowIndicatorSourceAbove
          : tracker.string.GanttArrowIndicatorSourceBelow
        : edge === 'top'
          ? tracker.string.GanttArrowIndicatorTargetAbove
          : tracker.string.GanttArrowIndicatorTargetBelow
    return await translate(sentenceKey, {}, language)
  }

  function indicatorPoints (tip: { x: number, y: number }, edge: OffscreenEdge): string {
    const baseY = edge === 'top' ? tip.y + INDICATOR_HEIGHT : tip.y - INDICATOR_HEIGHT
    const halfWidth = INDICATOR_WIDTH / 2
    return `${tip.x},${tip.y} ${tip.x - halfWidth},${baseY} ${tip.x + halfWidth},${baseY}`
  }

  function isPrimary (event: MouseEvent): boolean {
    return event.button === 0
  }

  function swallow (event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
  }

  function openEditor (event: MouseEvent): void {
    if (!isPrimary(event)) return
    swallow(event)
    dispatch('openEditor', { relation })
  }

  function scrollTo (event: MouseEvent, issue: Ref<Issue>): void {
    if (!isPrimary(event)) return
    swallow(event)
    dispatch('scrollToRow', { issue })
  }

  let sourceTooltip = ''
  let targetTooltip = ''

  $: sourceEdge = sourceOffscreenEdge(visibility)
  $: targetEdge = targetOffscreenEdge(visibility)
  $: showSourceIndicator = yBounds !== undefined && sourceEdge !== undefined
  $: showTargetIndicator = yBounds !== undefined && targetEdge !== undefined

  $: void indicatorSentence(showSourceIndicator ? sourceEdge : undefined, 'source', $themeStore.language).then(
    (sentence) => (sourceTooltip = sentence)
  )
  $: void indicatorSentence(showTargetIndicator ? targetEdge : undefined, 'target', $themeStore.language).then(
    (sentence) => (targetTooltip = sentence)
  )

  $: sourceAnchor = anchorOf(relation.kind, 'source')
  $: targetAnchor = anchorOf(relation.kind, 'target')
  $: sourcePoint =
    sourceBar === null
      ? null
      : yBounds !== undefined && sourceEdge !== undefined
        ? clippedEndpointPx(sourceBar, sourceAnchor, yBounds, sourceEdge)
        : endpointPx(sourceBar, sourceAnchor)
  $: targetPoint =
    targetBar === null
      ? null
      : yBounds !== undefined && targetEdge !== undefined
        ? clippedEndpointPx(targetBar, targetAnchor, yBounds, targetEdge)
        : endpointPx(targetBar, targetAnchor)

  $: lagText = signedLag(relation.lag)
  $: pillLabel = `${kindCode(relation.kind)}${lagText}`
  $: showLagPill = lagText !== '' && visibility.kind === 'both-visible'
  $: pillWidth = Math.max(LAG_PILL_MIN_WIDTH, pillLabel.length * LAG_PILL_CHAR_WIDTH + LAG_PILL_PADDING)
  $: arrowColor = isCritical || isViolated ? 'var(--theme-state-negative-color)' : 'var(--theme-state-regular-color)'
  $: strokeWidth = isCritical || isViolated ? 2 : 1.5
</script>

{#if sourcePoint !== null && targetPoint !== null}
  {@const midpoint = pathMidpoint(sourcePoint, targetPoint)}
  {@const headCorners = arrowheadPoints(sourcePoint, targetPoint)}
  <g
    class="dependency-arrow"
    class:dimmed
    role="presentation"
    on:mouseenter={() => dispatch('hoverEdge', { source: relation.attachedTo, target: relation.target })}
    on:mouseleave={() => dispatch('hoverEdge', null)}
  >
    <path
      class="click-curve"
      d={bezierHitPath(sourcePoint, targetPoint)}
      fill="none"
      stroke="transparent"
      stroke-width="12"
      on:click={openEditor}
    />
    <path
      class="visible-curve"
      d={bezierPath(sourcePoint, targetPoint)}
      fill="none"
      stroke={arrowColor}
      stroke-width={strokeWidth}
      stroke-dasharray={isViolated ? '4 2' : undefined}
      pointer-events="none"
    />
    <polygon
      class="arrowhead"
      points={headCorners.map((corner) => `${corner.x},${corner.y}`).join(' ')}
      fill={arrowColor}
      pointer-events="none"
    />
    {#if showLagPill}
      <g
        class="lag-pill"
        transform={`translate(${midpoint.x - pillWidth / 2}, ${midpoint.y - LAG_PILL_HEIGHT / 2})`}
        on:click={openEditor}
      >
        <rect
          width={pillWidth}
          height={LAG_PILL_HEIGHT}
          rx="8"
          fill="var(--theme-bg-color)"
          stroke="var(--theme-state-regular-color)"
          stroke-width="1"
        />
        <text
          class="lag-text"
          x={pillWidth / 2}
          y="11"
          text-anchor="middle"
          font-size="10"
          font-weight="600"
          fill="var(--theme-content-color)"
          pointer-events="none"
        >{pillLabel}</text>
      </g>
    {/if}
    {#if showSourceIndicator && sourceEdge !== undefined}
      <polygon
        class="edge-indicator"
        points={indicatorPoints(sourcePoint, sourceEdge)}
        fill={arrowColor}
        on:click={(event) => scrollTo(event, relation.attachedTo)}
      >
        <title>{sourceTooltip}</title>
      </polygon>
    {/if}
    {#if showTargetIndicator && targetEdge !== undefined}
      <polygon
        class="edge-indicator"
        points={indicatorPoints(targetPoint, targetEdge)}
        fill={arrowColor}
        on:click={(event) => scrollTo(event, relation.target)}
      >
        <title>{targetTooltip}</title>
      </polygon>
    {/if}
  </g>
{/if}

<style>
  .dependency-arrow {
    transition: opacity 120ms ease;
  }

  .dependency-arrow.dimmed {
    opacity: 0.4;
  }

  .dependency-arrow:hover .visible-curve {
    stroke: var(--theme-content-color);
  }

  .dependency-arrow:hover .arrowhead {
    fill: var(--theme-content-color);
  }

  .click-curve,
  .edge-indicator,
  .lag-pill {
    cursor: pointer;
  }

  .lag-text {
    user-select: none;
  }

  .edge-indicator {
    opacity: 0.85;
    transition: opacity 120ms ease;
  }

  .edge-indicator:hover {
    opacity: 1;
  }
</style>
