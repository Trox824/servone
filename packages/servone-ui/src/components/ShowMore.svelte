<script lang="ts">
  import { resizeObserver, Label } from '../original'
  import uiPlugin from '@hcengineering/ui/src/plugin'

  const DEFAULT_LIMIT_PX = 240

  export let limit: number = DEFAULT_LIMIT_PX
  export let ignore: boolean = false
  export let fixed: boolean = false
  export let bigger: boolean = false

  $: effectiveLimit = limit ?? DEFAULT_LIMIT_PX

  let measuredHeight = 0
  let isCollapsed = false
  let wasCollapsedByRule = false

  function measure (element: Element): void {
    measuredHeight = element.clientHeight
    if (measuredHeight > effectiveLimit && !bigger) bigger = true
  }

  $: shouldCollapse = bigger && !ignore
  $: if (shouldCollapse !== wasCollapsedByRule) {
    wasCollapsedByRule = shouldCollapse
    if (shouldCollapse) isCollapsed = true
  }

  $: isClipped = isCollapsed && !ignore
  $: hasPill = bigger && !ignore && !fixed
  $: pillLabel = measuredHeight > effectiveLimit ? uiPlugin.string.ShowLess : uiPlugin.string.ShowMore

  function togglePill (event: MouseEvent): void {
    event.stopPropagation()
    isCollapsed = !isCollapsed
  }
</script>

<div class="relative min-h-0 min-w-0">
  <div
    class="max-h-max"
    class:overflow-hidden={isClipped}
    class:mb-9={bigger && !ignore && !isCollapsed}
    style:max-height={isClipped ? `${effectiveLimit}px` : undefined}
    style:mask-image={isClipped ? 'linear-gradient(to top, transparent 0, black 5rem)' : undefined}
    style:-webkit-mask-image={isClipped ? 'linear-gradient(to top, transparent 0, black 5rem)' : undefined}
    use:resizeObserver={measure}
  >
    <slot />
  </div>
  {#if hasPill}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="absolute bottom-1 left-1/2 -translate-x-1/2 cursor-pointer select-none rounded-full border bg-background px-4 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
      on:click={togglePill}
    >
      <Label label={pillLabel} />
    </div>
  {/if}
</div>
