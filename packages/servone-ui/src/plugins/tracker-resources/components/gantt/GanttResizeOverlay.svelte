<svelte:options namespace="svg" />

<script lang="ts">
  import { writable, type Writable } from 'svelte/store'
  import { translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/ui'
  import type { TimeScale } from '@hcengineering/gantt'
  import type { DragState } from './lib/types'
  import tracker from '../../plugin'

  export let activeDrag: Writable<DragState> = writable<DragState>({ kind: 'idle' })
  export let timeScale: TimeScale
  export let canvasHeight: number = 600

  const MS_PER_DAY = 86_400_000
  const PILL_WIDTH = 88
  const PILL_HEIGHT = 18
  const BOX_WIDTH = 144
  const BOX_HEIGHT = 22
  const BOX_BOTTOM_OFFSET = 30
  const MINUS_SIGN = '−'

  interface OutlineRange {
    start: number
    end: number
  }

  function edgeTimestampOf (state: DragState | undefined): number | undefined {
    switch (state?.kind) {
      case 'dragging-body':
      case 'resizing-left':
        return state.previewStart
      case 'resizing-right':
        return state.previewEnd
      case 'dragging-unscheduled':
        return state.hasCanvasTarget ? state.previewStart : undefined
      default:
        return undefined
    }
  }

  function outlineRangeOf (state: DragState | undefined): OutlineRange | undefined {
    switch (state?.kind) {
      case 'dragging-body':
      case 'resizing-left':
      case 'resizing-right':
        return { start: state.originStart, end: state.originEnd }
      case 'dragging-unscheduled':
        return state.hasCanvasTarget ? { start: state.originStart, end: state.originEnd } : undefined
      default:
        return undefined
    }
  }

  function edgeXOf (state: DragState | undefined, scale: TimeScale): number | undefined {
    const timestamp = edgeTimestampOf(state)
    if (timestamp === undefined) return undefined
    const baseX = scale.toX(timestamp)
    return state?.kind === 'resizing-right' ? baseX + scale.pxPerDay : baseX
  }

  function inclusiveDays (start: number, end: number): number {
    return Math.round((end - start) / MS_PER_DAY) + 1
  }

  function resizeSpansOf (state: DragState | undefined): { before: number, after: number } | undefined {
    if (state?.kind === 'resizing-left') {
      return {
        before: inclusiveDays(state.originStart, state.originEnd),
        after: inclusiveDays(state.previewStart, state.originEnd)
      }
    }
    if (state?.kind === 'resizing-right') {
      return {
        before: inclusiveDays(state.originStart, state.originEnd),
        after: inclusiveDays(state.originStart, state.previewEnd)
      }
    }
    return undefined
  }

  function signedDifference (change: number): string {
    return `${change >= 0 ? '+' : MINUS_SIGN}${Math.abs(change)}`
  }

  let tooltipText = ''
  let latestTranslation = 0

  async function refreshTooltip (
    daysBefore: number | undefined,
    daysAfter: number | undefined,
    differenceLabel: string | undefined,
    language: string
  ): Promise<void> {
    const ticket = ++latestTranslation
    if (daysBefore === undefined || daysAfter === undefined || differenceLabel === undefined) {
      tooltipText = ''
      return
    }
    const translated = await translate(
      tracker.string.GanttResizingTooltip,
      { from: daysBefore, to: daysAfter, delta: differenceLabel },
      language
    )
    if (ticket === latestTranslation) tooltipText = translated
  }

  $: outlineRange = outlineRangeOf($activeDrag)
  $: outlineLeft = outlineRange === undefined ? 0 : timeScale.toX(outlineRange.start)
  $: outlineWidth =
    outlineRange === undefined ? 0 : timeScale.toX(outlineRange.end) - outlineLeft + timeScale.pxPerDay
  $: edgeTimestamp = edgeTimestampOf($activeDrag)
  $: edgeX = edgeXOf($activeDrag, timeScale)
  $: edgeDateLabel =
    edgeTimestamp === undefined
      ? undefined
      : new Date(edgeTimestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  $: resizeSpans = resizeSpansOf($activeDrag)
  $: daysBefore = resizeSpans?.before
  $: daysAfter = resizeSpans?.after
  $: differenceLabel = resizeSpans === undefined ? undefined : signedDifference(resizeSpans.after - resizeSpans.before)
  $: void refreshTooltip(daysBefore, daysAfter, differenceLabel, $themeStore.language)
</script>

{#if outlineRange !== undefined}
  <rect
    x={outlineLeft}
    y="0"
    width={outlineWidth}
    height={canvasHeight}
    fill="none"
    stroke="var(--theme-content-color)"
    stroke-width="1"
    stroke-dasharray="4 4"
    opacity="0.3"
    pointer-events="none"
  />
{/if}

{#if edgeX !== undefined}
  <line
    x1={edgeX}
    x2={edgeX}
    y1="0"
    y2={canvasHeight}
    stroke="var(--theme-state-info-color, #6366f1)"
    stroke-width="1"
    stroke-dasharray="4 4"
    pointer-events="none"
  />
{/if}

{#if edgeX !== undefined && edgeDateLabel !== undefined}
  <g pointer-events="none">
    <rect
      x={edgeX - PILL_WIDTH / 2}
      y="2"
      width={PILL_WIDTH}
      height={PILL_HEIGHT}
      rx="9"
      ry="9"
      fill="var(--theme-state-info-color, #6366f1)"
    />
    <text
      x={edgeX}
      y="15"
      text-anchor="middle"
      fill="#ffffff"
      font-size="11"
      font-weight="600"
      style="user-select: none;"
    >
      {edgeDateLabel}
    </text>
  </g>
{/if}

{#if tooltipText !== '' && edgeX !== undefined}
  <g pointer-events="none">
    <rect
      x={edgeX - BOX_WIDTH / 2}
      y={canvasHeight - BOX_BOTTOM_OFFSET}
      width={BOX_WIDTH}
      height={BOX_HEIGHT}
      rx="4"
      ry="4"
      fill="var(--theme-bg-color)"
      stroke="var(--theme-divider-color)"
      stroke-width="1"
    />
    <text
      x={edgeX}
      y={canvasHeight - BOX_BOTTOM_OFFSET + 15}
      text-anchor="middle"
      fill="var(--theme-content-color)"
      font-size="11"
      font-weight="400"
      style="user-select: none;"
    >
      {tooltipText}
    </text>
  </g>
{/if}
