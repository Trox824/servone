<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, onMount } from 'svelte'
  import ui from '@hcengineering/ui/src/plugin'
  import { deviceOptionsStore, resizeObserver, ListView, Icon } from '../original'
  import type { AnySvelteComponent, ListItem } from '../original'
  import MenuSearch from './MenuSearch.svelte'
  import { menuPopupClass, menuItemClass, menuScrollClass } from '../lib/menu-classes'

  export let icon: Asset | AnySvelteComponent
  export let placeholder: IntlString = ui.string.SearchDots
  export let items: ListItem[]
  export let withSearch: boolean = true

  const dispatch = createEventDispatcher()

  let filterText = ''
  let highlightedRow = 0
  let listView: ListView
  let searchField: MenuSearch | undefined

  $: listedEntries = items.filter((entry) => entry.label.toLowerCase().includes(filterText.toLowerCase()))

  onMount(() => {
    if (!$deviceOptionsStore.isMobile) searchField?.focus()
  })

  function pickEntry (entry: ListItem | undefined): void {
    if (entry === undefined) return
    if (entry.isSelectable === true || entry.isSelectable === undefined) dispatch('close', entry)
  }

  function onKeyDown (event: KeyboardEvent): void {
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.stopPropagation()
      event.preventDefault()
      listView.select(highlightedRow + (event.code === 'ArrowUp' ? -1 : 1))
    } else if (event.code === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      pickEntry(listedEntries[highlightedRow])
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
  {#if withSearch}
    <MenuSearch
      bind:this={searchField}
      bind:value={filterText}
      {placeholder}
      autoFocus={!$deviceOptionsStore.isMobile}
    />
  {/if}
  <div class={menuScrollClass}>
    <ListView bind:this={listView} kind={'full-size'} count={listedEntries.length} bind:selection={highlightedRow}>
      <svelte:fragment slot="item" let:item={rowIndex}>
        {@const entry = listedEntries[rowIndex]}
        {#if entry !== undefined}
          <button
            type="button"
            class={menuItemClass}
            disabled={entry.isSelectable === false}
            on:click={() => { pickEntry(entry) }}
          >
            {#if entry.image !== undefined || entry.icon !== undefined || icon !== undefined}
              <span class="flex items-center justify-center w-6 h-6 shrink-0 rounded-full overflow-hidden">
                {#if entry.image}
                  <img class="max-w-full" src={entry.image} alt={entry.label} />
                {:else if entry.icon}
                  <Icon icon={entry.icon} size={'medium'} iconProps={entry.iconProps} />
                {:else if typeof icon === 'string'}
                  <Icon {icon} size={'small'} />
                {:else}
                  <svelte:component this={icon} size={'small'} />
                {/if}
              </span>
            {/if}
            <span
              class="flex-1 truncate text-left {entry.fontWeight === 'medium'
                ? 'font-medium'
                : entry.fontWeight === 'semi-bold'
                  ? 'font-semibold'
                  : 'font-normal'}"
              style:padding-left={entry.paddingLeft ? `${entry.paddingLeft}rem` : undefined}
            >
              {entry.label}
            </span>
          </button>
        {/if}
      </svelte:fragment>
    </ListView>
  </div>
</div>
