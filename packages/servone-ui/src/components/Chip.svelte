<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { LabelAndProps } from '../original'
  import { tooltip as tooltipAction } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import { X } from '@lucide/svelte'
  import { cn } from '../lib/utils'

  export let label: string
  export let size: 'small' | 'min' = 'small'
  export let isRemovable: boolean = false
  export let backgroundColor: string | undefined = undefined
  export let tooltip: LabelAndProps | undefined = undefined

  const dispatch = createEventDispatcher()

  let removeButton: HTMLButtonElement | undefined
  let removeLabel: string = ''

  $: translateCB(ui.string.Remove, {}, $themeStore.language, (text) => {
    removeLabel = text
  })

  export function focus (): void {
    removeButton?.focus()
  }

  function removeOnBackspace (event: KeyboardEvent): void {
    if (event.key === 'Backspace') dispatch('remove')
  }

  $: pillClass = cn(
    'inline-flex max-w-[15rem] items-center gap-1 border border-transparent bg-primary font-medium text-primary-foreground',
    size === 'small' ? 'h-6 rounded-md px-2 text-xs' : 'h-5 rounded-sm px-1.5 text-[11px]'
  )
</script>

<div class={pillClass} style:background-color={backgroundColor} use:tooltipAction={tooltip}>
  <span class="truncate">{label}</span>
  {#if isRemovable}
    <button
      bind:this={removeButton}
      type="button"
      class="inline-flex items-center justify-center rounded-sm p-0 outline-none hover:bg-primary-foreground/20 focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={removeLabel}
      on:click={() => dispatch('remove')}
      on:keydown={removeOnBackspace}
    >
      <X size={12} />
    </button>
  {/if}
</div>
