<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { deepEqual } from 'fast-equals'
  import type { ComponentType } from 'svelte'
  import { createEventDispatcher } from 'svelte'
  import {
    closePopup,
    showPopup,
    tooltip as applyTooltip,
    closeTooltip,
    registerFocus,
    Icon,
    Label,
    Spinner,
    ModernPopup
  } from '../original'
  import type { AnySvelteComponent, DropdownIntlItem, LabelAndProps } from '../original'
  import { ChevronDown } from '@lucide/svelte'
  import { triggerButtonClass, type HulyButtonKind } from '../lib/menu-classes'

  export let title: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  // svelte-ignore export_let_unused
  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'
  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconProps: any | undefined = undefined
  export let disabled: boolean = false
  export let loading: boolean = false
  // svelte-ignore export_let_unused
  export let inheritColor: boolean = false
  export let noSelection: boolean = false
  // svelte-ignore export_let_unused
  export let noPrint: boolean = false
  export let autoSelectionIfOne: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined
  export let items: DropdownIntlItem[]
  export let params: Record<string, any> = {}
  export let selected: DropdownIntlItem['id'] | undefined = undefined
  export let element: HTMLButtonElement | undefined = undefined
  export let focusIndex: number = -1
  export let id: string | undefined = undefined
  export let dataId: string | undefined = undefined

  const dispatch = createEventDispatcher<{ selected: DropdownIntlItem['id'] }>()

  function toHulyKind (buttonKind: typeof kind): HulyButtonKind {
    switch (buttonKind) {
      case 'primary':
        return 'primary'
      case 'tertiary':
        return 'ghost'
      case 'negative':
        return 'dangerous'
      default:
        return 'regular'
    }
  }

  let isOpen = false
  let popupGeneration = 0

  function chooseItem (pickedId: DropdownIntlItem['id']): void {
    selected = pickedId
    dispatch('selected', pickedId)
  }

  function openMenu (): void {
    if (isOpen) return
    if (autoSelectionIfOne && items.length === 1) {
      chooseItem(items[0].id)
      return
    }
    isOpen = true
    closeTooltip()
    popupGeneration += 1
    const ownGeneration = popupGeneration
    showPopup(
      ModernPopup,
      { items, selected: noSelection ? undefined : selected, params },
      element,
      (pickedId: DropdownIntlItem['id'] | undefined) => {
        if (ownGeneration !== popupGeneration) return
        if (pickedId) chooseItem(pickedId)
        isOpen = false
      }
    )
  }

  let previousItems: DropdownIntlItem[] | undefined = undefined

  function reopenOnItemsChange (nextItems: DropdownIntlItem[]): void {
    const hasChanged = previousItems !== undefined && !deepEqual(previousItems, nextItems)
    previousItems = nextItems
    if (!hasChanged || !isOpen) return
    closePopup()
    isOpen = false
    openMenu()
  }

  $: reopenOnItemsChange(items)

  let accessibleName: string | undefined = undefined

  $: if (label === undefined && title === undefined) {
    translateCB(
      tooltip?.label ?? ('view:string:MoreActions' as IntlString),
      tooltip?.props ?? {},
      $themeStore.language,
      (translated) => {
        accessibleName = translated
      }
    )
  } else {
    accessibleName = undefined
  }

  const { idx: focusSlot, focusManager } = registerFocus(focusIndex, {
    focus: () => {
      if (!disabled) element?.focus()
      return !disabled && element !== undefined
    },
    isFocus: () => document.activeElement === element
  })

  $: if (focusSlot !== -1 && focusManager !== undefined) focusManager.updateFocus(focusSlot, focusIndex)

  let watchedElement: HTMLButtonElement | undefined = undefined

  function reportFirstFocus (target: HTMLButtonElement | undefined): void {
    if (target === undefined || target === watchedElement) return
    watchedElement = target
    target.addEventListener('focus', () => focusManager?.setFocus(focusSlot), { once: true })
  }

  $: reportFirstFocus(element)

  $: triggerClass = triggerButtonClass(toHulyKind(kind), disabled, isOpen)
</script>

<button
  bind:this={element}
  type="button"
  class={triggerClass}
  {disabled}
  {title}
  {id}
  data-id={dataId}
  aria-label={accessibleName}
  use:applyTooltip={tooltip}
  on:click={openMenu}
>
  {#if loading}
    <Spinner size="small" />
  {:else if icon !== undefined}
    <Icon {icon} size="small" {iconProps} />
  {/if}
  {#if label !== undefined}
    <span class="truncate"><Label {label} params={labelParams} /></span>
  {/if}
  <ChevronDown size={14} class="shrink-0" />
</button>
