<script lang="ts">
  import { Label, tooltip } from '@hcengineering/ui'
  import type { EpicProgress } from '../lib/totals'
  import type { EstimateScale } from '../lib/types'
  import { str } from '../plugin'

  export let progress: EpicProgress
  export let scale: EstimateScale
  export let legend = false

  $: byPoints = progress.byPoints && scale !== 'off'
  $: done = byPoints ? progress.donePoints : progress.doneCount
  $: total = byPoints ? progress.points : progress.count
  $: notStarted = Math.max(0, progress.count - progress.doneCount - progress.activeCount)
</script>

<div class="flex min-w-0 flex-1 flex-col gap-1.5">
  <div
    class="flex min-w-0 items-center gap-2"
    use:tooltip={{
      label: byPoints ? str.PointsDone : str.IssuesDone,
      props: byPoints ? { done: progress.donePoints, total: progress.points } : { done: progress.doneCount, total: progress.count }
    }}
  >
    <div class="flex flex-1 overflow-hidden rounded-full bg-foreground/10 {legend ? 'h-2' : 'h-1.5'}">
      <div class="h-full bg-emerald-500" style:width="{progress.ratio * 100}%"></div>
      <!-- The compact row's label counts done work only, so its bar does too; the legend names the blue part. -->
      {#if legend}<div class="h-full bg-primary" style:width="{progress.activeRatio * 100}%"></div>{/if}
    </div>
    <span class="shrink-0 truncate whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground {legend ? '' : 'w-16'}">
      {#if byPoints}
        <Label label={str.PointsOf} params={{ done, total }} />
      {:else}
        {done}/{total}
      {/if}
    </span>
  </div>
  {#if legend}
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-emerald-500"></span><Label label={str.KindDone} /> {progress.doneCount}</span>
      <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-primary"></span><Label label={str.KindActive} /> {progress.activeCount}</span>
      <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-foreground/20"></span><Label label={str.KindOpen} /> {notStarted}</span>
    </div>
  {/if}
</div>
