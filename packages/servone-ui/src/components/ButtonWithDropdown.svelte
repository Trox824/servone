<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { type Asset, type IntlString, translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { AnySvelteComponent, ButtonKind, ButtonSize, LabelAndProps, SelectPopupValueType } from '../original'
  import ui, { Icon, Label, registerFocus, showPopup, tooltip, eventToHTMLElement } from '../original'
  import SelectPopup from './SelectPopup.svelte'
  import { ChevronDown } from '@lucide/svelte'
  import { triggerButtonClass } from '../lib/menu-classes'
  import { cn } from '../lib/utils'

  export let dropdownItems: SelectPopupValueType[]
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let kind: ButtonKind = 'primary'
  export let size: ButtonSize = 'medium'
  export let justify: 'left' | 'center' = 'center'
  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let dropdownIcon: Asset | AnySvelteComponent | undefined = undefined
  export let showTooltipMain: LabelAndProps | undefined = undefined
  export let mainButtonId: string | undefined = undefined
  export let disabled: boolean = false
  export let loading: boolean = false
  export let focusIndex: number | undefined = undefined
  export let hasDropdown: boolean = true
  export let noFocus: boolean = false

  const dispatch = createEventDispatcher()

  let mainButton: HTMLButtonElement | undefined
  let mainAriaLabel: string | undefined
  let moreOptionsLabel: string = ''

  $: isBlocked = disabled || loading
  $: tooltipLabel = showTooltipMain?.label
  $: tooltipLabelParams = showTooltipMain?.props

  $: if (label === undefined && tooltipLabel !== undefined) {
    translateCB(tooltipLabel, tooltipLabelParams ?? {}, $themeStore.language, (text) => {
      mainAriaLabel = text
    })
  } else {
    mainAriaLabel = undefined
  }

  $: translateCB(ui.string.ShowMore, {}, $themeStore.language, (text) => {
    moreOptionsLabel = text
  })

  const { idx: focusSlot, focusManager } = registerFocus(focusIndex ?? -1, {
    focus: () => {
      if (!disabled) mainButton?.focus()
      return !disabled && mainButton !== undefined
    },
    isFocus: () => document.activeElement === mainButton
  })

  $: if (focusSlot !== -1 && focusManager !== undefined) {
    focusManager.updateFocus(focusSlot, focusIndex ?? -1)
  }

  function openOptions (event: MouseEvent): void {
    showPopup(SelectPopup, { value: dropdownItems }, eventToHTMLElement(event), (picked) => {
      dispatch('dropdown-selected', picked)
    })
  }

  $: triggerClass = triggerButtonClass(kind, isBlocked, false)
  $: mainClass = cn(
    triggerClass,
    'w-full grow',
    justify === 'left' ? 'justify-start text-left' : 'justify-center text-center',
    hasDropdown ? 'rounded-r-none' : ''
  )
  $: openerClass = cn(triggerClass, 'w-7 shrink-0 justify-center rounded-l-none border-l border-l-background/20 px-0')
</script>

<div class="flex w-full">
  <button
    bind:this={mainButton}
    id={mainButtonId}
    type="button"
    class={mainClass}
    disabled={isBlocked}
    aria-label={mainAriaLabel}
    use:tooltip={showTooltipMain}
    on:click
    on:focus={() => focusManager?.setFocus(focusSlot)}
  >
    {#if icon}
      <Icon {icon} size="small" />
    {/if}
    {#if label}
      <span class={cn('min-w-0 grow truncate', justify === 'left' ? 'text-left' : 'text-center')}>
        <Label {label} params={labelParams} />
      </span>
      <slot name="content" />
    {/if}
  </button>
  {#if hasDropdown}
    <button type="button" class={openerClass} disabled={isBlocked} aria-label={moreOptionsLabel} on:click={openOptions}>
      {#if dropdownIcon}
        <Icon icon={dropdownIcon} size="small" />
      {:else}
        <ChevronDown size={14} />
      {/if}
    </button>
  {/if}
</div>
