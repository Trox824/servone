<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import { Check } from '@lucide/svelte'
  import { cn } from '../../../lib/utils'
  import { getBooleanLabel } from '../utils'

  export let value: boolean | null | undefined
  export let inline: boolean = false

  $: isYes = value === true
  $: rootClass = cn(
    inline ? 'inline-presenter' : 'flex-presenter',
    'yesno-container',
    'max-w-fit items-center gap-1 select-none',
    isYes ? 'text-foreground' : 'text-muted-foreground'
  )
</script>

<div class={rootClass}>
  {#if isYes}
    <Check class="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
  {:else}
    <span class="w-3.5 shrink-0 text-center leading-none" aria-hidden="true">&mdash;</span>
  {/if}
  <span class="capitalize whitespace-nowrap"><Label label={getBooleanLabel(value)} /></span>
</div>
