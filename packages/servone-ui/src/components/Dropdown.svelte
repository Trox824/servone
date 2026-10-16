<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { getFocusManager, registerFocus, showPopup, tooltip, Label, Icon } from '../original'
  import type { AnySvelteComponent, ButtonKind, ButtonSize, ListItem, TooltipAlignment } from '../original'
  import DropdownPopup from './DropdownPopup.svelte'
  import { triggerButtonClass } from '../lib/menu-classes'
  import { cn } from '../lib/utils'

  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let placeholder: IntlString
  export let items: ListItem[] = []
  export let selected: ListItem | undefined = undefined
  export let disabled: boolean = false
  export let padding: string = '0 .75rem'
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let stretchWidth: boolean | undefined = undefined
  export let labelDirection: TooltipAlignment | undefined = undefined
  export let focusIndex: number = -1
  export let withSearch: boolean = true

  const dispatch = createEventDispatcher()
  const surroundingFocusManager = getFocusManager()

  let outerWrapper: HTMLDivElement | undefined
  let triggerButton: HTMLButtonElement | undefined
  let isPopupOpen = false

  const { idx: focusSlot, focusManager } = registerFocus(focusIndex, {
    focus: () => {
      if (!disabled) triggerButton?.focus()
      return !disabled && triggerButton !== undefined
    },
    isFocus: () => document.activeElement === triggerButton
  })

  $: if (focusSlot !== -1 && focusManager !== undefined) {
    focusManager.updateFocus(focusSlot, focusIndex)
  }

  function openPopup (): void {
    if (isPopupOpen || disabled || outerWrapper === undefined) return
    isPopupOpen = true
    showPopup(DropdownPopup, { title: label, items, icon, withSearch }, outerWrapper, (pickedItem: ListItem | undefined) => {
      if (pickedItem) {
        selected = pickedItem
        dispatch('selected', pickedItem)
      }
      isPopupOpen = false
      surroundingFocusManager?.setFocusPos(focusIndex)
    })
  }

  $: shownIcon = selected?.icon ?? icon
  $: shownIconProps = selected?.icon ? selected.iconProps : undefined
  $: triggerClass = cn(
    triggerButtonClass(kind, disabled, isPopupOpen),
    justify === 'left' ? 'justify-start' : 'justify-center',
    stretchWidth ? 'w-full' : ''
  )
  $: wrapperClass = cn('min-w-0', stretchWidth ? 'flex flex-1 items-center justify-center' : '')
</script>

<div bind:this={outerWrapper} class={wrapperClass}>
  <button
    bind:this={triggerButton}
    type="button"
    class={triggerClass}
    style:width={stretchWidth ? undefined : width}
    {disabled}
    use:tooltip={{ label, direction: labelDirection }}
    on:click={openPopup}
    on:focus={() => focusManager?.setFocus(focusSlot)}
  >
    {#if icon && shownIcon}
      <Icon icon={shownIcon} iconProps={shownIconProps} size="small" />
    {/if}
    <span class={cn('min-w-0 grow truncate text-left', selected ? '' : 'text-muted-foreground')}>
      {#if selected}
        {selected.label}
      {:else}
        <Label label={placeholder} />
      {/if}
    </span>
  </button>
</div>
