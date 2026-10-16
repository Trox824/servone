<svelte:options namespace="svg" />

<script lang="ts">
  import { createEventDispatcher, getContext, onDestroy } from 'svelte'
  import { readable, writable, type Readable, type Writable } from 'svelte/store'
  import type { Ref } from '@hcengineering/core'
  import type { Issue, IssueStatus, Milestone } from '@hcengineering/tracker'
  import {
    activeDragTargetId,
    classifyPointer,
    LONG_PRESS_MS,
    MOVE_THRESHOLD_PX,
    type TimeScale,
    type LayoutMode
  } from '@hcengineering/gantt'
  import { getPlatformColor, themeStore } from '@hcengineering/ui'
  import type { DragState, DragTarget } from './lib/types'
  import { resolveBarLabel, type BarLabelSlot } from './lib/bar-labels'
  import {
    resolveBarColors,
    type BarColorMode,
    type BarColorContext,
    type GanttBarIssueLike
  } from './lib/bar-colors'
  import { isPastDue, isBlocked } from './lib/bar-overlays'
  import { progressFraction } from './lib/progress-fraction'

  type DragRole = 'leader' | 'follower' | 'none'

  interface BarGeometry {
    left: number
    right: number
    width: number
    top: number
    height: number
    middle: number
  }

  interface DateSpan {
    start: number | null
    end: number | null
  }

  export let issue: GanttBarIssueLike
  export let row: { y: number, height: number }
  export let timeScale: TimeScale
  export let isSummary: boolean = false
  export let summaryRange: { startDate: number | null, dueDate: number | null } | null = null
  export let statusCategory: string | null = null
  export let editable: boolean = false
  export let dateMutable: boolean = true
  export let activeDrag: Writable<DragState> = writable<DragState>({ kind: 'idle' })
  export let issueRef: Ref<Issue> | Ref<Milestone> | undefined = undefined
  export let dragTarget: DragTarget | undefined = undefined
  export let focused: boolean = false
  export let selected: boolean = false
  export let multiSelected: boolean = false
  export let isCritical: boolean = false
  export let isViolated: boolean = false
  export let slackMs: number = 0
  export let showSlackGlyph: boolean = false
  export let schedulingMode: 'auto' | 'manual' | undefined = undefined
  export let layoutMode: LayoutMode = 'desktop'
  export let barLabelLeft: BarLabelSlot = 'none'
  export let barLabelInside: BarLabelSlot = 'title'
  export let barLabelRight: BarLabelSlot = 'none'

  const dispatch = createEventDispatcher<{
    barMouseDown: { target: DragTarget, edge: 'left' | 'right' | 'body', cursorX: number }
    barClick: { target: DragTarget, metaKey: boolean, ctrlKey: boolean, shiftKey: boolean }
    contextMenu: { issue: Issue, event: MouseEvent }
    barHover: { issue: Issue | null }
  }>()

  const MIN_BAR_WIDTH_PX = 2
  const ROW_VERTICAL_INSET_PX = 6
  const MS_PER_DAY = 86_400_000
  const CHAR_WIDTH_PX = 7.5
  const LABEL_PADDING_PX = 12
  const PIN_GLYPH_RESERVE_PX = 14
  const PIN_MIN_BAR_WIDTH_PX = 24
  const MIN_LABEL_CHARS = 4
  const CORNER_RADIUS = 3

  const modeContext = getContext<Writable<BarColorMode> | undefined>('gantt-bar-color-mode')
  const colorContext = getContext<Readable<BarColorContext> | undefined>('gantt-bar-color-context')
  const pastDueContext = getContext<Writable<boolean> | undefined>('gantt-overlay-past-due')
  const blockedContext = getContext<Writable<boolean> | undefined>('gantt-overlay-blocked')
  const predecessorsContext = getContext<Readable<Map<string, Array<Ref<Issue>>>> | undefined>(
    'gantt-predecessors-by-issue'
  )
  const predecessorStatusContext = getContext<Readable<Map<string, Ref<IssueStatus>>> | undefined>(
    'gantt-pred-status-by-issue'
  )
  const subIssuesContext = getContext<Readable<Map<string, Issue[]>> | undefined>('gantt-sub-issues-by-parent')
  const progressContext = getContext<Writable<boolean> | undefined>('gantt-progress-fill')

  const neutralColorContext: BarColorContext = {
    statusCategoryFor: () => null,
    priorityFor: (target) => target.priority,
    assigneeRankFor: () => null,
    componentColorFor: () => null,
    milestoneColorFor: () => null,
    hashFromId: () => 0
  }

  const hasColorContexts = modeContext !== undefined && colorContext !== undefined
  const colorModeStore = modeContext ?? writable<BarColorMode>('status')
  const colorContextStore = colorContext ?? readable(neutralColorContext)
  const pastDueStore = pastDueContext ?? writable(true)
  const blockedStore = blockedContext ?? writable(true)
  const predecessorsStore = predecessorsContext ?? readable(new Map<string, Array<Ref<Issue>>>())
  const predecessorStatusStore = predecessorStatusContext ?? readable(new Map<string, Ref<IssueStatus>>())
  const subIssuesStore = subIssuesContext ?? readable(new Map<string, Issue[]>())
  const progressStore = progressContext ?? writable(false)

  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let pressPointerId: number | undefined
  let pressDownX = 0
  let pressDownY = 0

  function resolveDragRole (state: DragState, targetId: string | undefined): DragRole {
    if (targetId === undefined) return 'none'
    if (activeDragTargetId(state) === targetId) return 'leader'
    if (
      state.kind === 'dragging-body' &&
      state.coDrag !== undefined &&
      state.coDrag.members.some((member) => String(member.issueId) === targetId)
    ) {
      return 'follower'
    }
    return 'none'
  }

  function resolveDateSpan (state: DragState, role: DragRole, targetId: string | undefined, base: DateSpan): DateSpan {
    if (role === 'follower' && state.kind === 'dragging-body' && state.coDrag !== undefined) {
      const followedMember = state.coDrag.members.find((member) => String(member.issueId) === targetId)
      if (followedMember !== undefined) {
        const shiftMs = state.coDrag.anchorDeltaMs
        return { start: followedMember.originStart + shiftMs, end: followedMember.originEnd + shiftMs }
      }
    }
    if (role === 'leader') {
      switch (state.kind) {
        case 'dragging-body':
        case 'dragging-unscheduled':
          return { start: state.previewStart, end: state.previewEnd }
        case 'resizing-left':
          return { start: state.previewStart, end: state.originEnd }
        case 'resizing-right':
          return { start: state.originStart, end: state.previewEnd }
      }
    }
    return base
  }

  function computeGeometry (span: DateSpan, rowBox: { y: number, height: number }, scale: TimeScale): BarGeometry | null {
    if (span.start === null || span.end === null) return null
    const earlierX = scale.toX(Math.min(span.start, span.end))
    const laterX = scale.toX(Math.max(span.start, span.end))
    const width = Math.max(MIN_BAR_WIDTH_PX, laterX - earlierX + scale.pxPerDay)
    const top = rowBox.y + ROW_VERTICAL_INSET_PX
    const height = rowBox.height - ROW_VERTICAL_INSET_PX * 2
    return { left: earlierX, right: earlierX + width, width, top, height, middle: top + height / 2 }
  }

  function fitLabel (text: string, charBudget: number): string {
    if (text === '' || charBudget < MIN_LABEL_CHARS) return ''
    if (text.length <= charBudget) return text
    return text.slice(0, Math.max(1, charBudget - 1)) + '…'
  }

  function formatUtcDay (timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10)
  }

  function cancelPendingPress (): void {
    if (pressTimer !== undefined) clearTimeout(pressTimer)
    pressTimer = undefined
    pressPointerId = undefined
  }

  function startBodyDrag (clientX: number, hasModifier: boolean): void {
    if (dragTarget === undefined) return
    if (!(selected || multiSelected) || hasModifier) return
    dispatch('barMouseDown', { target: dragTarget, edge: 'body', cursorX: clientX })
  }

  function handlePointerDown (event: PointerEvent): void {
    if (selected) event.stopPropagation()
    if (!dateMutable || !editable || dragTarget === undefined || event.button !== 0) return
    const decision = classifyPointer(layoutMode, event.pointerType, 'drag')
    if (decision === 'block') return
    const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey
    if (decision === 'allow') {
      startBodyDrag(event.clientX, hasModifier)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    cancelPendingPress()
    pressPointerId = event.pointerId
    pressDownX = event.clientX
    pressDownY = event.clientY
    const touchDownClientX = event.clientX
    pressTimer = setTimeout(() => {
      pressTimer = undefined
      pressPointerId = undefined
      startBodyDrag(touchDownClientX, hasModifier)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove (event: PointerEvent): void {
    if (pressTimer === undefined) return
    if (pressPointerId !== undefined && event.pointerId !== pressPointerId) return
    if (Math.hypot(event.clientX - pressDownX, event.clientY - pressDownY) > MOVE_THRESHOLD_PX) {
      cancelPendingPress()
    }
  }

  function handlePointerEnd (event: PointerEvent): void {
    if (pressPointerId === undefined || event.pointerId === pressPointerId) cancelPendingPress()
  }

  function handleClick (event: MouseEvent): void {
    if (!editable || dragTarget === undefined || event.button !== 0) return
    dispatch('barClick', {
      target: dragTarget,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey
    })
    event.preventDefault()
    event.stopPropagation()
  }

  function handleContextMenu (event: MouseEvent): void {
    if (dragTarget?.kind !== 'issue') return
    event.preventDefault()
    event.stopPropagation()
    dispatch('contextMenu', { issue: dragTarget.doc, event })
  }

  function handleMouseEnter (): void {
    if (dragTarget?.kind === 'issue') dispatch('barHover', { issue: dragTarget.doc })
  }

  function handleMouseLeave (): void {
    dispatch('barHover', { issue: null })
  }

  onDestroy(cancelPendingPress)

  $: baseSpan = {
    start: isSummary ? summaryRange?.startDate ?? issue.startDate : issue.startDate,
    end: isSummary ? summaryRange?.dueDate ?? issue.dueDate : issue.dueDate
  } satisfies DateSpan
  $: dragRole = resolveDragRole($activeDrag, issueRef)
  $: isDragActive = dragRole !== 'none'
  $: drawnSpan = resolveDateSpan($activeDrag, dragRole, issueRef, baseSpan)
  $: geometry = computeGeometry(drawnSpan, row, timeScale)
  $: isSelectedLook = selected || multiSelected

  $: colorMode = $colorModeStore
  $: barColors = hasColorContexts
    ? resolveBarColors(issue, colorMode, $colorContextStore)
    : resolveBarColors(issue, 'status', neutralColorContext)
  $: fillColor =
    barColors.paletteIndex !== undefined ? getPlatformColor(barColors.paletteIndex, $themeStore.dark) : barColors.fill
  $: borderColor =
    barColors.paletteIndex !== undefined ? getPlatformColor(barColors.paletteIndex, $themeStore.dark) : barColors.border
  $: textColor = barColors.text
  $: lookupStatusCategory = $colorContextStore.statusCategoryFor

  $: progressRatio =
    !isSummary && $progressStore && colorMode === 'status' && issue._id !== undefined && dragTarget?.kind === 'issue'
      ? progressFraction(dragTarget.doc, $subIssuesStore.get(String(issue._id)) ?? [], lookupStatusCategory)
      : null
  $: predecessorIds = issue._id !== undefined ? $predecessorsStore.get(String(issue._id)) ?? [] : []
  $: isBlockedNow =
    $blockedStore && isBlocked(issue, predecessorIds, $predecessorStatusStore, lookupStatusCategory)
  $: isPastDueNow = $pastDueStore && isPastDue(issue, lookupStatusCategory, Date.now())
  $: hasCriticalTint = isCritical && showSlackGlyph
  $: hasSlackTail = showSlackGlyph && slackMs > 0 && !isCritical
  $: slackWidth = Math.max(MIN_BAR_WIDTH_PX, (slackMs / MS_PER_DAY) * timeScale.pxPerDay)
  $: isManualSchedule = schedulingMode === 'manual' && !isSummary
  $: hasPinGlyph = isManualSchedule && geometry !== null && geometry.width >= PIN_MIN_BAR_WIDTH_PX

  $: charBudget =
    geometry === null
      ? 0
      : Math.floor((geometry.width - LABEL_PADDING_PX - (hasPinGlyph ? PIN_GLYPH_RESERVE_PX : 0)) / CHAR_WIDTH_PX)
  $: leftLabel = dragTarget?.kind === 'issue' ? resolveBarLabel(dragTarget.doc, barLabelLeft) : ''
  $: rightLabel = dragTarget?.kind === 'issue' ? resolveBarLabel(dragTarget.doc, barLabelRight) : ''
  $: insideLabel =
    dragTarget?.kind === 'issue' ? fitLabel(resolveBarLabel(dragTarget.doc, barLabelInside), charBudget) : ''
  $: summaryLabel = fitLabel(issue.title, charBudget)

  $: tooltipText =
    drawnSpan.start !== null && drawnSpan.end !== null
      ? `${issue.title} (${formatUtcDay(Math.min(drawnSpan.start, drawnSpan.end))} → ${formatUtcDay(
          Math.max(drawnSpan.start, drawnSpan.end)
        )})${isManualSchedule ? ' · manual schedule' : ''}`
      : issue.title
  $: hatchId = `hatch-${issue._id ?? 'syn'}`
  $: isNegativeOutline = isCritical || isViolated
  $: barStroke = isNegativeOutline ? 'var(--theme-state-negative-color)' : borderColor
  $: barStrokeWidth = isNegativeOutline || statusCategory === 'task:statusCategory:Lost' ? 2 : 1
</script>

{#if geometry !== null}
  <g>
    {#if isSummary}
      {#if editable && dragTarget?.kind === 'issue'}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <rect
          class="summary-hit"
          class:date-mutable={dateMutable}
          class:selected={isSelectedLook}
          class:dragging={isDragActive}
          x={geometry.left}
          y={geometry.top}
          width={geometry.width}
          height={geometry.height}
          fill="transparent"
          role="button"
          tabindex="-1"
          aria-label={issue.title}
          on:pointerdown={handlePointerDown}
          on:pointermove={handlePointerMove}
          on:pointerup={handlePointerEnd}
          on:pointercancel={handlePointerEnd}
          on:click={handleClick}
          on:contextmenu={handleContextMenu}
          on:mouseenter={handleMouseEnter}
          on:mouseleave={handleMouseLeave}
        />
      {/if}
      <g pointer-events="none" fill="var(--theme-content-color)">
        <line
          x1={geometry.left + 1}
          x2={geometry.right - 1}
          y1={geometry.middle}
          y2={geometry.middle}
          stroke="var(--theme-content-color)"
          stroke-width="3"
        />
        <polygon
          points={`${geometry.left},${geometry.middle - 1} ${geometry.left + 6},${geometry.middle - 1} ${geometry.left},${geometry.middle + 5}`}
        />
        <polygon
          points={`${geometry.right},${geometry.middle - 1} ${geometry.right - 6},${geometry.middle - 1} ${geometry.right},${geometry.middle + 5}`}
        />
      </g>
      {#if summaryLabel !== ''}
        <text
          class="bar-text"
          x={geometry.left + 10}
          y={geometry.middle - 4}
          fill="var(--theme-content-color)"
          font-size="13"
          font-weight="600"
          dominant-baseline="alphabetic"
          pointer-events="none"
        >{summaryLabel}</text>
      {/if}
      <title>{tooltipText}</title>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <rect
        class="bar"
        class:editable
        class:date-mutable={dateMutable}
        class:dragging={isDragActive}
        class:focused
        class:selected={isSelectedLook}
        class:critical={isCritical}
        class:violated={isViolated}
        x={geometry.left}
        y={geometry.top}
        width={geometry.width}
        height={geometry.height}
        rx={CORNER_RADIUS}
        fill={fillColor}
        stroke={barStroke}
        stroke-width={barStrokeWidth}
        stroke-dasharray={isViolated ? '4 2' : undefined}
        role="button"
        tabindex="-1"
        aria-label={issue.title}
        on:pointerdown={handlePointerDown}
        on:pointermove={handlePointerMove}
        on:pointerup={handlePointerEnd}
        on:pointercancel={handlePointerEnd}
        on:click={handleClick}
        on:contextmenu={handleContextMenu}
        on:mouseenter={handleMouseEnter}
        on:mouseleave={handleMouseLeave}
      />
      {#if progressRatio !== null && progressRatio > 0}
        <rect
          x={geometry.left}
          y={geometry.top}
          width={geometry.width * progressRatio}
          height={geometry.height}
          rx={CORNER_RADIUS}
          fill="var(--theme-bg-accent-color)"
          fill-opacity="0.35"
          pointer-events="none"
        />
      {/if}
      {#if isBlockedNow}
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line
            x1="1"
            y1="0"
            x2="1"
            y2="6"
            stroke="var(--theme-content-color)"
            stroke-opacity="0.15"
            stroke-width="2"
          />
        </pattern>
        <rect
          x={geometry.left}
          y={geometry.top}
          width={geometry.width}
          height={geometry.height}
          rx={CORNER_RADIUS}
          fill={`url(#${hatchId})`}
          pointer-events="none"
        />
      {/if}
      {#if isPastDueNow}
        <rect
          x={geometry.left}
          y={geometry.top}
          width="3"
          height={geometry.height}
          fill="var(--theme-state-negative-color)"
          pointer-events="none"
        />
      {/if}
      {#if hasCriticalTint}
        <rect
          x={geometry.left}
          y={geometry.top}
          width={geometry.width}
          height={geometry.height}
          rx={CORNER_RADIUS}
          fill="var(--theme-state-negative-color)"
          fill-opacity="0.18"
          pointer-events="none"
        />
      {/if}
      {#if hasSlackTail}
        <rect
          x={geometry.right + 1}
          y={geometry.top + 2}
          width={slackWidth}
          height={geometry.height - 4}
          rx="2"
          fill="var(--theme-state-regular-color)"
          fill-opacity="0.4"
          pointer-events="none"
        />
      {/if}
      {#if hasPinGlyph}
        <g pointer-events="none">
          <circle
            cx={geometry.left + 9}
            cy={geometry.middle}
            r="4"
            fill={textColor}
            stroke={fillColor}
            stroke-width="1"
          />
          <circle cx={geometry.left + 9} cy={geometry.middle} r="1.6" fill={fillColor} />
          <polygon
            points={`${geometry.left + 5},${geometry.middle - 0.5} ${geometry.left + 1.5},${geometry.middle} ${geometry.left + 5},${geometry.middle + 0.5}`}
            fill={textColor}
          />
        </g>
      {/if}
      {#if leftLabel !== ''}
        <text
          class="bar-text"
          x={geometry.left - 6}
          y={geometry.middle}
          text-anchor="end"
          dominant-baseline="central"
          fill="var(--theme-content-trans-color)"
          font-size="11"
          font-weight="400"
          pointer-events="none"
        >{leftLabel}</text>
      {/if}
      {#if insideLabel !== ''}
        <text
          class="bar-text"
          x={geometry.left + 6 + (hasPinGlyph ? PIN_GLYPH_RESERVE_PX : 0)}
          y={geometry.middle + 4}
          fill={textColor}
          font-size="13"
          font-weight="500"
          pointer-events="none"
        >{insideLabel}</text>
      {/if}
      {#if rightLabel !== ''}
        <text
          class="bar-text"
          x={geometry.right + 6}
          y={geometry.middle}
          text-anchor="start"
          dominant-baseline="central"
          fill="var(--theme-content-trans-color)"
          font-size="11"
          font-weight="400"
          pointer-events="none"
        >{rightLabel}</text>
      {/if}
      <title>{tooltipText}</title>
    {/if}
  </g>
{/if}

<style>
  .bar {
    --bar-info: var(--theme-state-info-color, #6366f1);
    touch-action: none;
    transition: filter 120ms ease;
  }

  .bar:hover {
    filter: brightness(110%);
  }

  .bar.editable {
    cursor: pointer;
  }

  .bar.editable.date-mutable.selected {
    cursor: grab;
  }

  .bar.editable.date-mutable.dragging {
    cursor: grabbing;
  }

  .bar.dragging {
    stroke: var(--bar-info);
    stroke-width: 2;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--bar-info) 50%, transparent));
  }

  .bar.dragging:hover {
    filter: brightness(110%) drop-shadow(0 0 4px color-mix(in srgb, var(--bar-info) 50%, transparent));
  }

  .bar.focused {
    stroke: var(--bar-info);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  .bar.selected {
    stroke: var(--bar-info);
    stroke-width: 3;
    paint-order: stroke fill;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--bar-info) 60%, transparent));
  }

  .bar.selected:hover {
    filter: brightness(110%) drop-shadow(0 0 4px color-mix(in srgb, var(--bar-info) 60%, transparent));
  }

  .summary-hit {
    --bar-info: var(--theme-state-info-color, #6366f1);
    cursor: pointer;
  }

  .summary-hit.date-mutable.selected {
    cursor: grab;
  }

  .summary-hit.date-mutable.dragging {
    cursor: grabbing;
  }

  .summary-hit.selected,
  .summary-hit.dragging {
    fill: color-mix(in srgb, var(--bar-info) 18%, transparent);
    stroke: var(--bar-info);
    stroke-width: 1.5;
    stroke-dasharray: 4 2;
  }

  .bar-text {
    user-select: none;
  }
</style>
