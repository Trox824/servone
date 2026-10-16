<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import type { StatusSplit } from '../lib/capacity'
  import { str } from '../plugin'

  export let split: StatusSplit
  export let byPoints: boolean
  export let unpointed = 0
  export let capacity: number | undefined = undefined

  $: scope = split.todo + split.active + split.done
  $: share = (n: number): string => (scope === 0 ? '0%' : `${Math.round((n / scope) * 100)}%`)
  $: rows = [
    { label: str.Scope, value: scope, pct: undefined, dot: 'bg-muted-foreground/40' },
    { label: str.Started, value: split.active, pct: share(split.active), dot: 'bg-amber-500' },
    { label: str.Completed, value: split.done, pct: share(split.done), dot: 'bg-primary' }
  ]
</script>

<div class="flex min-w-48 flex-col gap-1.5 p-1 text-xs">
  {#each rows as r}
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full {r.dot}"></span>
      <span class="flex-1"><Label label={r.label} /></span>
      <span class="tabular-nums">
        {#if byPoints}<Label label={str.PointsShort} params={{ count: r.value }} />{:else}<Label label={str.IssueCount} params={{ count: r.value }} />{/if}
      </span>
      {#if r.pct !== undefined}<span class="w-9 text-right tabular-nums text-muted-foreground">{r.pct}</span>{/if}
    </div>
  {/each}
  {#if capacity !== undefined}
    <div class="flex items-center gap-2 border-t pt-1.5 {scope > capacity ? 'text-amber-500' : ''}">
      <span class="size-2"></span>
      <span class="flex-1"><Label label={str.Capacity} /></span>
      <span class="tabular-nums">{capacity}</span>
      <span class="w-9"></span>
    </div>
  {/if}
  {#if byPoints && unpointed > 0}
    <div class="text-amber-500"><Label label={str.Unpointed} params={{ count: unpointed }} /></div>
  {/if}
</div>
