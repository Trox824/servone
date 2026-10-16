<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import type { Totals } from '../lib/totals'
  import type { EstimateScale } from '../lib/types'
  import { str } from '../plugin'

  export let totals: Totals
  export let scale: EstimateScale
</script>

<span class="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
  <span><Label label={str.IssueCount} params={{ count: totals.count }} /></span>
  {#if scale !== 'off'}
    <span class="rounded-full bg-muted px-1.5 py-0.5 text-foreground"><Label label={str.PointsShort} params={{ count: totals.points }} /></span>
    {#if totals.unpointed > 0}
      <span class="text-amber-600 dark:text-amber-400"><Label label={str.Unpointed} params={{ count: totals.unpointed }} /></span>
    {/if}
  {/if}
  {#if totals.hours > 0}
    <span><Label label={str.HoursShort} params={{ count: Math.round(totals.hours * 10) / 10 }} /></span>
  {/if}
</span>
