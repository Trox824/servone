<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
  import { X } from '@lucide/svelte'
  import { Label, Scroller, tooltip, type LabelAndProps } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import { cn } from '../lib/utils'
  import { intl } from '../lib/intl'

  export let type: 'type-aside' | 'type-popup' | 'type-component'
  export let width: 'large' | 'medium' | 'small' | 'x-small' | 'menu' | undefined = undefined
  export let maxWidth: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelProps: Record<string, string | number | boolean> | undefined = undefined
  export let okAction: () => Promise<void> | void = () => {}
  export let okLoading: boolean = false
  export let okTooltip: LabelAndProps | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined
  export let canSave: boolean = false
  export let okLabel: IntlString = ui.string.Ok
  export let padding: string | undefined = undefined
  export let bottomPadding: string | undefined = undefined
  export let hidden: boolean = false
  export let noTopIndent: boolean = false
  export let hideFooter: boolean = false
  export let adaptive: 'default' | 'freezeActions' | 'doubleRow' | 'disabled' = 'disabled'
  export let showCancelButton: boolean = true
  export let scrollableContent: boolean = true

  const dispatch = createEventDispatcher<{ close: undefined }>()
  const closeLabel = intl('presentation:string:Close' as IntlString)

  const scrollerPaddingByType = {
    'type-popup': 'var(--spacing-2) var(--spacing-3) var(--spacing-4)',
    'type-aside': 'var(--spacing-2) var(--spacing-1_5)',
    'type-component': 'var(--spacing-4)'
  }

  const scrollerBottomPaddingByType = {
    'type-popup': undefined,
    'type-aside': 'var(--spacing-2)',
    'type-component': 'var(--spacing-4)'
  }

  $: hasCloseButton = type === 'type-popup' || type === 'type-aside'
  $: hasHeader = label !== undefined || $$slots.beforeTitle || $$slots.title || $$slots.actions || hasCloseButton
  $: hasFooter = type !== 'type-component' && !hideFooter
  $: scrollerPadding = padding ?? scrollerPaddingByType[type]
  $: scrollerBottomPadding =
    bottomPadding !== undefined && bottomPadding !== '' ? undefined : scrollerBottomPaddingByType[type]

  function requestClose (): void {
    if (onCancel !== undefined) {
      onCancel()
    } else {
      dispatch('close')
    }
  }

  function handleWindowKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    requestClose()
  }

  function handleCancelClick (): void {
    onCancel?.()
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div
  class={cn('hulyModal-container flex flex-col overflow-hidden bg-popover text-popover-foreground', type, width)}
  class:noTopIndent
  class:hidden
  data-adaptive={adaptive}
  style:max-width={maxWidth}
>
  {#if hasHeader}
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border p-4">
      <div class="flex min-w-0 items-center gap-2">
        <slot name="beforeTitle" />
        <span class="truncate text-base font-semibold leading-none tracking-tight text-foreground">
          {#if label !== undefined}
            <Label {label} params={labelProps ?? {}} />
          {/if}
          <slot name="title" />
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
        {#if hasCloseButton}
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded-sm opacity-70 outline-none hover:bg-accent hover:opacity-100 focus-visible:bg-accent focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={$closeLabel}
            on:click={requestClose}
          >
            <X size={16} />
          </button>
        {/if}
      </div>
    </div>
  {/if}
  <slot name="beforeContent" />
  <div class="hulyModal-content min-h-0 flex-1">
    {#if scrollableContent}
      <Scroller padding={scrollerPadding} bottomPadding={scrollerBottomPadding}>
        <slot />
      </Scroller>
    {:else}
      <slot />
    {/if}
  </div>
  <slot name="afterContent" />
  {#if hasFooter}
    <div class="hulyModal-footer flex shrink-0 items-center justify-end gap-2 border-t border-border p-4">
      <button
        type="button"
        class="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        disabled={!canSave || okLoading}
        use:tooltip={okTooltip}
        on:click={okAction}
      >
        <Label label={okLabel} />
      </button>
      {#if showCancelButton}
        <button
          type="button"
          class="h-8 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
          on:click={handleCancelClick}
        >
          <Label label={ui.string.Cancel} />
        </button>
      {/if}
      {#if $$slots.buttons}
        <slot name="buttons" />
      {/if}
      <slot name="footer" />
    </div>
  {/if}
</div>
