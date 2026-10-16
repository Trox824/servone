<script lang="ts">
  import { languageStore } from '@hcengineering/theme'
  import { onDestroy } from 'svelte'
  import { MAX_CALL_MINUTES } from '../context'
  import { callConnectedAt, formatRemaining, isEnding, remainingMs } from '../limit'
  import { textOf } from '../strings'

  export let compact: boolean = false

  const TICK_INTERVAL_MS = 1000

  let nowMs = Date.now()
  const tickerId = setInterval(() => {
    nowMs = Date.now()
  }, TICK_INTERVAL_MS)
  onDestroy(() => {
    clearInterval(tickerId)
  })

  $: translate = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: remaining = $callConnectedAt === undefined ? undefined : remainingMs($callConnectedAt, nowMs, MAX_CALL_MINUTES)
  $: ending = remaining !== undefined && isEnding(remaining)
  $: fullLabel = translate('BetaChip', { minutes: MAX_CALL_MINUTES })
  $: timeLeft = remaining === undefined ? undefined : translate('BetaTimeLeft', { time: formatRemaining(remaining) })
</script>

<span
  class="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium tabular-nums {ending
    ? 'border-destructive/40 bg-destructive/15 text-destructive'
    : 'border-border text-muted-foreground'}"
  title={fullLabel}
>
  {#if compact && timeLeft !== undefined}
    Beta · {timeLeft}
  {:else}
    {fullLabel}{#if timeLeft !== undefined}
      · {timeLeft}{/if}
  {/if}
</span>
