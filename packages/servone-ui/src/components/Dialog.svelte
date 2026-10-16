<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { X, Maximize2, Minimize2 } from '@lucide/svelte'
  import { Label, resizeObserver, tooltip, deviceOptionsStore, checkAdaptiveMatching } from '../original'
  import ui from '@hcengineering/ui/src/plugin'

  export let label: IntlString | undefined = undefined
  export let isFullSize: boolean = false
  export let padding: string = '1rem'

  const dispatch = createEventDispatcher()

  let userWantsFullSize = false
  let lastReportedFullSize = false

  export function maximize (): void {
    userWantsFullSize = true
  }

  $: isNarrowScreen = checkAdaptiveMatching($deviceOptionsStore.size, 'md')
  $: isEffectiveFullSize = isNarrowScreen || userWantsFullSize
  $: canToggleFullSize = isFullSize && !isNarrowScreen

  $: if (isEffectiveFullSize !== lastReportedFullSize) {
    lastReportedFullSize = isEffectiveFullSize
    dispatch('fullsize', isEffectiveFullSize)
  }

  const headerButtonClass =
    'flex size-7 items-center justify-center rounded-sm opacity-70 outline-none hover:bg-accent hover:opacity-100'
</script>

<form
  class="antiDialog flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
  class:fullsize={isEffectiveFullSize}
  on:submit|preventDefault
  use:resizeObserver={() => dispatch('changeContent')}
>
  <div class="flex shrink-0 grow-0 items-center justify-between gap-2 border-b border-border p-4">
    <div class="flex min-w-0 items-center gap-1.5">
      <button type="button" class={headerButtonClass} on:click={() => dispatch('close')}>
        <X size={16} />
      </button>
      {#if label}
        <span
          class="truncate text-base leading-none font-semibold tracking-tight text-foreground"
          use:tooltip={{ label }}
        >
          <Label {label} />
        </span>
      {/if}
      {#if $$slots.title}
        <slot name="title" />
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      {#if $$slots.utils}
        <slot name="utils" />
      {/if}
      {#if $$slots.utils && canToggleFullSize}
        <div class="h-4 w-px bg-border"></div>
      {/if}
      {#if canToggleFullSize}
        <button
          type="button"
          id="btnDialogFullScreen"
          class="{headerButtonClass} {isEffectiveFullSize ? 'bg-accent' : ''}"
          use:tooltip={{ label: isEffectiveFullSize ? ui.string.NormalSize : ui.string.FullSize }}
          on:click={() => {
            userWantsFullSize = !userWantsFullSize
          }}
        >
          {#if isEffectiveFullSize}
            <Minimize2 size={16} />
          {:else}
            <Maximize2 size={16} />
          {/if}
        </button>
      {/if}
    </div>
  </div>
  <div class="min-h-0 grow overflow-auto p-4" style:padding>
    <slot />
  </div>
  {#if $$slots.footerLeft || $$slots.footerRight}
    <div class="flex shrink-0 items-center justify-between gap-2 border-t border-border p-4">
      <div class="flex items-center gap-2">
        {#if $$slots.footerLeft}
          <slot name="footerLeft" />
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if $$slots.footerRight}
          <slot name="footerRight" />
        {/if}
      </div>
    </div>
  {/if}
</form>
