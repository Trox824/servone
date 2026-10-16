<script lang="ts">
  import { getEmbeddedLabel, translateCB, type Asset, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'
  import type { AnySvelteComponent } from '../original'
  import { Icon, Label, tooltip } from '../original'
  import presentation from '@hcengineering/presentation'
  import { X } from '@lucide/svelte'
  import { cn } from '../lib/utils'

  export let label: string | undefined = undefined
  export let labelIntl: IntlString | undefined = undefined
  export let boldLabel: string | undefined = undefined
  export let boldLabelIntl: IntlString | undefined = undefined
  export let highlighted: boolean = false
  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  export let maxSize: string | undefined = undefined
  export let orientation: 'horizontal' | 'vertical' = 'horizontal'
  export let kind: 'primary' | 'secondary' = 'primary'
  export let canClose: boolean = true
  export let readonly: boolean = false

  const dispatch = createEventDispatcher<{ close: undefined; contextmenu: MouseEvent }>()

  let closeButtonName: string = ''

  $: translateCB(presentation.string.Close, {}, $themeStore.language, (text) => {
    closeButtonName = text
  })

  function handleContextMenu (event: MouseEvent): void {
    if (readonly) return
    event.preventDefault()
    event.stopPropagation()
    dispatch('contextmenu', event)
  }

  $: hasPlainLabel = label !== undefined && label !== ''
  $: tooltipLabel = hasPlainLabel ? getEmbeddedLabel(label ?? '') : labelIntl
  $: isVertical = orientation === 'vertical'
  $: sizeLimitStyle = isVertical
    ? `max-height: ${maxSize}; max-width: auto`
    : `max-width: ${maxSize}; max-height: auto`
  $: stateClasses = highlighted
    ? 'bg-background text-foreground shadow-sm cursor-default'
    : kind === 'primary'
      ? 'bg-muted text-muted-foreground cursor-pointer hover:bg-accent hover:text-accent-foreground'
      : 'border border-input text-muted-foreground cursor-pointer hover:text-accent-foreground'
  $: rootClasses = cn(
    'inline-flex items-center gap-1.5 h-8 rounded-md px-2 text-xs font-medium overflow-hidden',
    isVertical && 'h-auto min-h-16 w-7 py-0 [writing-mode:vertical-rl] [text-orientation:sideways]',
    stateClasses
  )
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class={rootClasses}
  style={maxSize !== undefined ? sizeLimitStyle : undefined}
  use:tooltip={{ label: tooltipLabel, direction: 'bottom' }}
  on:click
  on:contextmenu={handleContextMenu}
>
  <slot name="prefix" />
  {#if icon !== undefined}
    <div class="flex items-center justify-center shrink-0">
      <Icon {icon} {iconProps} size={'x-small'} />
    </div>
  {/if}
  <span class="truncate flex-1">
    {#if hasPlainLabel}
      {label}
    {:else if labelIntl !== undefined}
      <Label label={labelIntl} />
    {/if}
    {#if boldLabel}
      <span class="font-bold text-foreground">{boldLabel}</span>
    {:else if boldLabelIntl !== undefined}
      <span class="font-bold text-foreground"><Label label={boldLabelIntl} /></span>
    {/if}
  </span>
  {#if canClose && !readonly}
    <button
      type="button"
      aria-label={closeButtonName}
      class="flex items-center justify-center shrink-0 rounded-sm hover:bg-accent"
      on:click={() => dispatch('close')}
    >
      <X class="size-3.5" />
    </button>
  {:else if !$$slots.postfix}
    <div></div>
  {/if}
  <slot name="postfix" />
</div>
