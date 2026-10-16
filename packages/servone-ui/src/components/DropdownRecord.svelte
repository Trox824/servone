<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import ui from '@hcengineering/ui/src/plugin'
  import { showPopup, Label } from '../original'
  import type { ButtonKind, ButtonSize } from '../original'
  import DropdownRecordPopup from './DropdownRecordPopup.svelte'
  import { ChevronDown } from '@lucide/svelte'
  import { triggerButtonClass } from '../lib/menu-classes'

  export let items: Record<any, IntlString>
  export let selected: any | undefined = undefined
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let width: string | undefined = '10rem'

  const dispatch = createEventDispatcher()

  let wrapperElement: HTMLElement
  let isOpen = false

  $: shownLabel = selected ? items[selected] : ui.string.NotSelected
  $: triggerStyle = width ? `width: ${width}; max-width: 12rem` : 'max-width: 12rem'

  function openPopup (): void {
    if (isOpen) return
    isOpen = true
    showPopup(DropdownRecordPopup, { items, selected }, wrapperElement, (chosenKey) => {
      if (chosenKey !== null && chosenKey !== undefined) dispatch('select', chosenKey)
      isOpen = false
    })
  }
</script>

<div class="min-w-0" bind:this={wrapperElement}>
  <button type="button" class={triggerButtonClass(kind, false, isOpen)} style={triggerStyle} on:click={openPopup}>
    <span class="flex-1 min-w-0 truncate text-left pointer-events-none"><Label label={shownLabel} /></span>
    <ChevronDown size={14} class="shrink-0 pointer-events-none" />
  </button>
</div>
