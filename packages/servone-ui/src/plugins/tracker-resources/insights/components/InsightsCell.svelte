<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import { str } from '../../sprints/plugin'
  import type { Cell } from '../lib/aggregate'

  export let amount: Cell
  export let isTotal = false
</script>

<span class="flex flex-col items-end leading-tight tabular-nums" class:font-medium={isTotal}>
  <span class:text-muted-foreground={amount.count === 0}>{amount.count}</span>
  {#if amount.points > 0}
    <span class="text-[11px] text-muted-foreground"><Label label={str.PointsShort} params={{ count: amount.points }} /></span>
  {/if}
</span>
