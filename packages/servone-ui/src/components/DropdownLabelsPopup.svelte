<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import ui from '@hcengineering/ui/src/plugin'
  import { deviceOptionsStore, resizeObserver, ListView, Icon, IconCheck } from '../original'
  import type { DropdownTextItem } from '../original'
  import MenuSearch from './MenuSearch.svelte'
  import { menuPopupClass, menuItemClass, menuCheckClass, menuScrollClass } from '../lib/menu-classes'

  export let placeholder: IntlString = ui.string.SearchDots
  export let placeholderParam: any | undefined = undefined
  export let items: DropdownTextItem[]
  export let selected: DropdownTextItem['id'] | Array<DropdownTextItem['id']> | undefined = undefined
  export let multiselect: boolean = false
  export let enableSearch: boolean = true

  const dispatch = createEventDispatcher()

  let filterText = ''
  let highlightedRow = 0
  let listView: ListView

  $: visibleEntries = items.filter((entry) => entry.label.toLowerCase().includes(filterText.toLowerCase()))

  function isChosen (entryId: string, currentSelection: typeof selected): boolean {
    return Array.isArray(currentSelection) ? currentSelection.includes(entryId) : entryId === currentSelection
  }

  function pickEntry (entryId: string): void {
    if (multiselect && Array.isArray(selected)) {
      if (selected.includes(entryId)) {
        selected.splice(selected.indexOf(entryId), 1)
        selected = selected
      } else {
        selected = [...selected, entryId]
      }
      dispatch('update', selected)
    } else {
      dispatch('close', entryId)
    }
  }

  function pickHighlighted (): void {
    const entry = visibleEntries[highlightedRow]
    if (entry === undefined) return
    if (multiselect && Array.isArray(selected)) {
      selected = selected.includes(entry.id) ? selected.filter((id) => id !== entry.id) : [...selected, entry.id]
      dispatch('update', selected)
    } else {
      dispatch('close', entry.id)
    }
  }

  function onKeyDown (event: KeyboardEvent): void {
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.stopPropagation()
      event.preventDefault()
      listView.select(highlightedRow + (event.code === 'ArrowUp' ? -1 : 1))
    } else if (event.code === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      pickHighlighted()
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class={menuPopupClass}
  on:keydown={onKeyDown}
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
>
  {#if enableSearch}
    <MenuSearch
      bind:value={filterText}
      {placeholder}
      {placeholderParam}
      autoFocus={!$deviceOptionsStore.isMobile}
      on:change
      on:input
    />
  {/if}
  <div class={menuScrollClass}>
    <ListView bind:this={listView} kind={'full-size'} count={visibleEntries.length} bind:selection={highlightedRow}>
      <svelte:fragment slot="item" let:item={rowIndex}>
        {@const entry = visibleEntries[rowIndex]}
        {#if entry !== undefined}
          <button type="button" class={menuItemClass} on:click={() => { pickEntry(entry.id) }}>
            <span class="flex-1 truncate text-left">{entry.label}</span>
            <span class={menuCheckClass}>
              {#if isChosen(entry.id, selected)}
                <Icon icon={IconCheck} size={'small'} />
              {/if}
            </span>
          </button>
        {/if}
      </svelte:fragment>
    </ListView>
  </div>
</div>
