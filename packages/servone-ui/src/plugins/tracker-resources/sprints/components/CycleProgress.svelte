<script lang="ts">
  import { tooltip } from '@hcengineering/ui'
  import type { StatusSplit } from '../lib/capacity'
  import CycleProgressCard from './CycleProgressCard.svelte'

  export let split: StatusSplit
  export let byPoints: boolean
  export let unpointed = 0
  /** Average completed work per sprint; shown for future sprints only. */
  export let capacity: number | undefined = undefined

  $: scope = split.todo + split.active + split.done
  $: pct = scope === 0 ? 0 : Math.round((split.done / scope) * 100)
  $: angle = (Math.min(pct, 99.99) / 100) * 2 * Math.PI
  $: arc = `M8 8 L8 3 A5 5 0 ${angle > Math.PI ? 1 : 0} 1 ${8 + 5 * Math.sin(angle)} ${8 - 5 * Math.cos(angle)} Z`
</script>

<span
  class="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
  use:tooltip={{ component: CycleProgressCard, props: { split, byPoints, unpointed, capacity }, direction: 'bottom' }}
>
  <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2" />
    {#if pct >= 100}
      <circle cx="8" cy="8" r="5" fill="currentColor" />
    {:else if pct > 0}
      <path d={arc} fill="currentColor" />
    {/if}
  </svg>
  {pct}%
</span>
