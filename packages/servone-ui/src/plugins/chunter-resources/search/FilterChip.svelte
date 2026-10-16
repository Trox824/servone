<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import { ChevronDown, X } from '@lucide/svelte'
  import { buttonVariants } from '../../../lib/components/ui/button'
  import * as Popover from '../../../lib/components/ui/popover'
  import { cn } from '../../../lib/utils'
  import { searchStrings } from './strings'

  export let label: IntlString
  export let selection: string | undefined = undefined
  export let onClear: (() => void) | undefined = undefined

  let isOpen = false

  $: isActive = selection !== undefined && onClear !== undefined
</script>

<div class="inline-flex min-w-0 items-center">
  <Popover.Root bind:open={isOpen}>
    <Popover.Trigger
      class={cn(
        buttonVariants({ variant: onClear === undefined ? 'ghost' : 'outline', size: 'sm' }),
        'max-w-72 font-normal',
        isActive && 'rounded-r-none border-primary/25 bg-primary/10 hover:bg-primary/15 aria-expanded:bg-primary/15'
      )}
    >
      <span class={cn(selection === undefined ? 'font-medium' : 'text-muted-foreground')}><Label {label} /></span>
      {#if selection !== undefined}<span class="truncate font-medium">{selection}</span>{/if}
      <ChevronDown class="text-muted-foreground" />
    </Popover.Trigger>
    <Popover.Content align="start" class="w-72 gap-0 p-0">
      <slot close={() => (isOpen = false)} />
    </Popover.Content>
  </Popover.Root>
  {#if isActive}
    <button
      type="button"
      class="flex h-7 items-center rounded-r-[min(var(--radius-md),12px)] border border-l-0 border-primary/25 bg-primary/10 px-1.5 text-muted-foreground outline-none hover:bg-primary/15 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      on:click={onClear}
    >
      <X class="size-3.5" />
      <span class="sr-only"><Label label={searchStrings.RemoveFilter} /></span>
    </button>
  {/if}
</div>
