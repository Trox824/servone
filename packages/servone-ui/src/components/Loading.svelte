<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
  import Spinner from './Spinner.svelte'
  import { Label, type ButtonSize } from '../original'
  import { cn } from '../lib/utils'

  export let shrink: boolean = false
  export let label: string = ''
  export let size: ButtonSize = 'medium'

  const PROGRESS_DELAY_MS = 50
  const loadingLabel = 'ui:string:ServoneLoading' as IntlString
  const dispatch = createEventDispatcher<{ progress: undefined }>()

  onMount(() => {
    const progressTimer = setTimeout(() => dispatch('progress'), PROGRESS_DELAY_MS)
    return () => clearTimeout(progressTimer)
  })
</script>

<div
  class={cn('flex items-center justify-center', !shrink && 'h-full w-full')}
  role={shrink ? undefined : 'status'}
>
  <span class="sr-only">
    {#if label !== ''}{label}{:else}<Label label={loadingLabel} />{/if}
  </span>
  <div
    class={cn(
      'relative flex items-center gap-2 animate-[reveal_150ms_ease-out_300ms_both] motion-reduce:animate-[reveal_1ms_ease-out_300ms_both]',
      label !== '' && 'pb-3'
    )}
  >
    <Spinner {size} />
    {#if label !== ''}
      <span
        aria-hidden="true"
        class="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase text-muted-foreground"
      >{label}</span>
    {/if}
    <slot />
  </div>
</div>
