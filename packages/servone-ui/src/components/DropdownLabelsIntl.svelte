<script lang="ts">
  import type { IntlString, Asset } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { deepEqual } from 'fast-equals'
  import type { AnySvelteComponent, TooltipAlignment, ButtonKind, ButtonSize, DropdownIntlItem } from '../original'
  import { showPopup, closePopup, registerFocus, tooltip, Label, Icon } from '../original'
  import DropdownLabelsPopupIntl from './DropdownLabelsPopupIntl.svelte'
  import ui from '@hcengineering/ui/src/plugin'
  import { ChevronDown } from '@lucide/svelte'
  import { triggerButtonClass } from '../lib/menu-classes'
  import { cn } from '../lib/utils'

  type ItemId = DropdownIntlItem['id']

  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let label: IntlString = ui.string.DropdownDefaultLabel
  export let params: Record<string, any> = {}
  export let items: DropdownIntlItem[]
  export let multiselect: boolean = false
  export let selected: ItemId | ItemId[] | undefined = multiselect ? [] : undefined
  export let disabled: boolean = false
  export let kind: ButtonKind = 'regular'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let minWidth: string | undefined = undefined
  export let labelDirection: TooltipAlignment | undefined = undefined
  export let shouldUpdateUndefined: boolean = true
  export let minW0: boolean = true
  export let focusIndex: number = -1
  export let dataId: string | undefined = undefined
  export let noFocus: boolean = false
  export let withSearch: boolean = false

  const dispatch = createEventDispatcher()

  let outerWrapper: HTMLDivElement | undefined
  let triggerButton: HTMLButtonElement | undefined
  let isPopupOpen = false
  let previousItems: DropdownIntlItem[] | undefined

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

  function findChosenItems (
    options: DropdownIntlItem[],
    current: ItemId | ItemId[] | undefined,
    isMultiple: boolean
  ): DropdownIntlItem[] {
    if (isMultiple) {
      return Array.isArray(current) ? options.filter((option) => current.includes(option.id)) : []
    }
    const match = options.find((option) => option.id === current)
    return match === undefined ? [] : [match]
  }

  $: availableItems = items ?? []
  $: chosenItems = findChosenItems(availableItems, selected, multiselect)

  $: if (shouldUpdateUndefined && selected === undefined && availableItems.length > 0) {
    selected = multiselect ? [availableItems[0].id] : availableItems[0].id
    dispatch('selected', selected)
  }

  function openPopup (): void {
    if (isPopupOpen || outerWrapper === undefined) return
    isPopupOpen = true
    showPopup(
      DropdownLabelsPopupIntl,
      { items, selected, params, withSearch, multiselect },
      outerWrapper,
      (picked: ItemId | undefined) => {
        if (picked) {
          selected = picked
          dispatch('selected', picked)
        }
        isPopupOpen = false
      },
      (updated: ItemId[] | undefined) => {
        if (updated !== null && updated !== undefined) {
          selected = updated
          dispatch('selected', updated)
        }
      }
    )
  }

  function reopenOnItemsChange (nextItems: DropdownIntlItem[]): void {
    if (previousItems === undefined) {
      previousItems = nextItems
      return
    }
    if (deepEqual(previousItems, nextItems)) return
    previousItems = nextItems
    if (isPopupOpen) {
      closePopup()
      isPopupOpen = false
      openPopup()
    }
  }

  $: reopenOnItemsChange(items)

  $: triggerClass = cn(
    triggerButtonClass(kind, disabled, isPopupOpen),
    justify === 'left' ? 'justify-start' : 'justify-center'
  )
  $: wrapperClass = minW0 ? 'min-w-0' : ''
</script>

<div
  bind:this={outerWrapper}
  class={wrapperClass}
  style:width
  style:min-width={width === undefined ? minWidth : undefined}
>
  <button
    bind:this={triggerButton}
    type="button"
    class={triggerClass}
    data-id={dataId}
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={isPopupOpen}
    use:tooltip={{ label, direction: labelDirection }}
    on:click={openPopup}
    on:focus={() => focusManager?.setFocus(focusSlot)}
  >
    {#if icon}
      <Icon {icon} {iconProps} size="small" />
    {/if}
    <span class="mr-2 min-w-0 grow truncate text-left">
      {#if chosenItems.length > 0}
        {#each chosenItems as chosenItem, position (chosenItem.id)}
          <span class={position > 0 ? 'ml-3' : ''}>
            <Label label={chosenItem.label} params={chosenItem.params ?? params} />
          </span>
        {/each}
      {:else}
        <Label {label} {params} />
      {/if}
    </span>
    <ChevronDown size={14} class="shrink-0" />
  </button>
</div>
