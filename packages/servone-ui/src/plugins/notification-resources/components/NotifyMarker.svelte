<script lang="ts">
  import { cn } from '$lib/utils'

  export let count: number = 0
  export let kind: 'primary' | 'simple' = 'primary'
  export let size: 'xx-small' | 'x-small' | 'small' | 'medium' = 'small'

  const badgeSizeClasses = {
    'xx-small': 'h-2 min-w-2 px-0.5 text-[6px]',
    'x-small': 'h-3 min-w-3 px-0.5 text-[8px]',
    small: 'h-4 min-w-4 px-1 text-[10px]',
    medium: 'h-5 min-w-5 px-1 text-xs'
  }
  const dotSizeClasses = {
    'xx-small': 'size-2',
    'x-small': 'size-3',
    small: 'size-4',
    medium: 'size-5'
  }

  $: countLabel = count > 9 ? '9+' : String(count)
</script>

{#if kind === 'simple'}
   <div class={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-destructive', dotSizeClasses[size])}></div>
{:else if kind === 'primary' && count > 0}
  <div
    class={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full bg-destructive font-semibold leading-none whitespace-nowrap text-white',
      badgeSizeClasses[size]
    )}
  >
    {countLabel}
  </div>
{/if}
