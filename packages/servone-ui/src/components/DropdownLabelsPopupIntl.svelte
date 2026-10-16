<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { type IntlString, translate } from '@hcengineering/platform'
  import ui from '@hcengineering/ui/src/plugin'
  import type { DropdownIntlItem } from '../original'
  import { deviceOptionsStore, Icon, IconCheck, languageStore, resizeObserver, Label } from '../original'
  import MenuSearch from './MenuSearch.svelte'
  import { menuPopupClass, menuItemClass, menuCheckClass, menuScrollClass } from '../lib/menu-classes'

  export let items: DropdownIntlItem[]
  export let selected: DropdownIntlItem['id'] | Array<DropdownIntlItem['id']> | undefined = undefined
  export let multiselect: boolean = false
  export let params: Record<string, any> = {}
  export let withSearch: boolean = false
  export let searchPlaceholder: IntlString = ui.string.Search

  const dispatch = createEventDispatcher()

  let filterText = ''
  let translatedByLabel: Map<IntlString, string> | undefined
  let rowButtons: Array<HTMLButtonElement | undefined> = []

  async function buildLookup (sourceItems: DropdownIntlItem[], language: string): Promise<Map<IntlString, string>> {
    const entries = await Promise.all(
      sourceItems.map(async (entry): Promise<[IntlString, string]> => [
        entry.label,
        (await translate(entry.label, entry.params ?? {}, language)).toLowerCase()
      ])
    )
    return new Map(entries)
  }

  let latestBuildId = 0

  async function refreshLookup (sourceItems: DropdownIntlItem[], isSearching: boolean, language: string): Promise<void> {
    latestBuildId += 1
    const buildId = latestBuildId
    if (!isSearching) {
      translatedByLabel = undefined
      return
    }
    const freshLookup = await buildLookup(sourceItems, language)
    if (buildId === latestBuildId) translatedByLabel = freshLookup
  }

  $: void refreshLookup(items, withSearch, $languageStore)

  $: listedItems = withSearch
    ? items.filter((entry) => translatedByLabel?.get(entry.label)?.includes(filterText.toLowerCase()) === true)
    : items

  $: rowButtons = rowButtons.slice(0, listedItems.length)

  function isChosen (entryId: string | number, currentSelection: typeof selected): boolean {
    return Array.isArray(currentSelection) ? currentSelection.includes(entryId) : entryId === currentSelection
  }

  function pickEntry (entryId: string | number): void {
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

  function focusRow (position: number): void {
    rowButtons[position]?.focus()
  }

  function onRowKeyDown (event: KeyboardEvent, position: number): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.stopPropagation()
    event.preventDefault()
    const rowCount = listedItems.length
    if (rowCount === 0) return
    const step = event.key === 'ArrowDown' ? 1 : -1
    focusRow((position + step + rowCount) % rowCount)
  }

  function onRootKeyDown (event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.stopPropagation()
    event.preventDefault()
    if (listedItems.length === 0) return
    focusRow(event.key === 'ArrowDown' ? 0 : listedItems.length - 1)
  }

  function notifySearch (): void {
    dispatch('search', filterText)
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class={menuPopupClass}
  on:keydown={onRootKeyDown}
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
>
  {#if withSearch}
    <MenuSearch
      bind:value={filterText}
      placeholder={searchPlaceholder}
      autoFocus={!$deviceOptionsStore.isMobile}
      on:change={notifySearch}
      on:input={notifySearch}
    />
  {/if}
  <div class={menuScrollClass}>
    {#each listedItems as entry, position (entry.id)}
      <!-- svelte-ignore a11y-mouse-events-have-key-events -->
      <button
        type="button"
        class={menuItemClass}
        bind:this={rowButtons[position]}
        on:mouseover={() => { focusRow(position) }}
        on:keydown={(event) => { onRowKeyDown(event, position) }}
        on:click={() => { pickEntry(entry.id) }}
      >
        {#if entry.icon !== undefined}
          <Icon icon={entry.icon} size={'small'} iconProps={entry.iconProps} />
        {/if}
        <span class="flex-1 truncate text-left">
          <Label label={entry.label} params={entry.params ?? params} />
        </span>
        <span class={menuCheckClass}>
          {#if isChosen(entry.id, selected)}
            <Icon icon={IconCheck} size={'small'} />
          {/if}
        </span>
      </button>
    {/each}
  </div>
</div>
