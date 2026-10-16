<!-- Closes with the chosen number, `null` for clear, or `undefined` when dismissed. -->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { formatPoints, scaleValues } from '../lib/scale'
  import type { EstimateScale } from '../lib/types'

  export let value: number | null = null
  export let scale: EstimateScale = 'fibonacci'
  /** Offer "clear" even with no current value (bulk edit). */
  export let allowClear = false
  /** Why the estimate is asked for (e.g. before moving to done). */
  export let hint: IntlString | undefined = undefined

  const dispatch = createEventDispatcher()
  $: values = scaleValues(scale)
</script>

<div class="flex flex-col gap-2 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
  {#if hint !== undefined}
    <p class="max-w-48 text-xs text-muted-foreground"><Label label={hint} /></p>
  {/if}
  <div class="grid grid-cols-4 gap-1">
    {#each values as v}
      <button
        type="button"
        class="h-8 min-w-10 rounded-md border px-2 text-sm tabular-nums hover:bg-accent {v === value
          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary'
          : ''}"
        on:click={() => dispatch('close', v)}
      >
        {formatPoints(v, scale)}
      </button>
    {/each}
  </div>
  {#if value !== null || allowClear}
    <button type="button" class="h-7 rounded-md text-xs text-muted-foreground hover:bg-accent" on:click={() => dispatch('close', null)}>
      ✕
    </button>
  {/if}
</div>
