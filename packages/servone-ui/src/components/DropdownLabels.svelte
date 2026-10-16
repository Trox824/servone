<script lang="ts">
  import type { IntlString, Asset } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import type { AnySvelteComponent, DropdownTextItem, TooltipAlignment, ButtonKind, ButtonSize } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import { showPopup, getFocusManager, registerFocus, tooltip, Label, Icon } from '../original'
  import DropdownLabelsPopup from './DropdownLabelsPopup.svelte'
  import { ChevronDown } from '@lucide/svelte'
  import { triggerButtonClass } from '../lib/menu-classes'
  import { cn } from '../lib/utils'

  type ItemId = DropdownTextItem['id']

  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let placeholder: IntlString | undefined = ui.string.SearchDots
  export let items: DropdownTextItem[]
  export let multiselect: boolean = false
  export let selected: ItemId | ItemId[] | undefined = multiselect ? [] : undefined
  export let allowDeselect: boolean = false
  export let showDropdownIcon: boolean = false
  export let dataId: string | undefined = undefined
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let labelDirection: TooltipAlignment | undefined = undefined
  export let focusIndex: number = -1
  export let autoSelect: boolean = true
  export let useFlexGrow: boolean = false
  export let minW0: boolean = true
  export let disabled: boolean = false
  export let loading: boolean = false
  export let enableSearch: boolean = true

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

  function findChosenItems (
    options: DropdownTextItem[],
    current: ItemId | ItemId[] | undefined,
    isMultiple: boolean
  ): DropdownTextItem[] {
    if (isMultiple) {
      return Array.isArray(current) ? options.filter((option) => current.includes(option.id)) : []
    }
    const match = options.find((option) => option.id === current)
    return match === undefined ? [] : [match]
  }

  $: availableItems = items ?? []
  $: chosenItems = findChosenItems(availableItems, selected, multiselect)
  $: isMuted = !multiselect && chosenItems.length === 0

  $: if (autoSelect && selected === undefined && availableItems.length > 0) {
    selected = multiselect ? [availableItems[0].id] : availableItems[0].id
  }

  function openPopup (): void {
    if (isPopupOpen || outerWrapper === undefined) return
    isPopupOpen = true
    showPopup(
      DropdownLabelsPopup,
      { placeholder, items, multiselect, selected, enableSearch },
      outerWrapper,
      (picked: ItemId | undefined) => {
        if (picked !== null && picked !== undefined) {
          if (allowDeselect && picked === selected) {
            selected = undefined
            dispatch('selected', undefined)
          } else {
            selected = picked
            dispatch('selected', picked)
          }
        }
        isPopupOpen = false
        surroundingFocusManager?.setFocusPos(focusIndex)
      },
      (updated: ItemId[] | undefined) => {
        if (updated !== null && updated !== undefined) {
          selected = updated
          dispatch('selected', updated)
        }
      }
    )
  }

  $: triggerClass = cn(
    triggerButtonClass(kind, disabled, isPopupOpen),
    justify === 'left' ? 'justify-start' : 'justify-center'
  )
  $: wrapperClass = cn(minW0 ? 'min-w-0' : '', useFlexGrow ? 'flex-grow' : '')
</script>

<div bind:this={outerWrapper} class={wrapperClass} style:width>
  <button
    bind:this={triggerButton}
    type="button"
    class={triggerClass}
    data-id={dataId}
    {disabled}
    use:tooltip={{ label, direction: labelDirection }}
    on:click={openPopup}
    on:focus={() => focusManager?.setFocus(focusSlot)}
  >
    {#if icon}
      <Icon {icon} size="small" />
    {/if}
    <span class={cn('min-w-0 grow truncate text-left', isMuted ? 'text-muted-foreground' : '')}>
      {#if $$slots.content}
        <slot name="content" />
      {:else if multiselect && chosenItems.length > 0}
        {#each chosenItems as chosenItem, position (chosenItem.id)}
          <span class={position > 0 ? 'ml-3' : ''}>{chosenItem.label}</span>
        {/each}
      {:else if chosenItems.length > 0}
        {chosenItems[0].label}
      {:else}
        <Label label={label ?? ui.string.NotSelected} />
      {/if}
    </span>
    {#if showDropdownIcon}
      <ChevronDown size={14} class="shrink-0" />
    {/if}
  </button>
</div>
