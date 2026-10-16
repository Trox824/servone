<script lang="ts">
  import type { Class, Doc, Ref, Space } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { eventToHTMLElement, resolvedLocationStore, showPopup, tooltip } from '@hcengineering/ui'
  import type { Filter, ViewOptions } from '@hcengineering/view'
  import { ListFilter } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { toolbarIconButton } from '../../../../lib/search-classes'
  import { cn } from '../../../../lib/utils'
  import { intl } from '../../../../lib/intl'
  import { filterStore, getFilterKey, selectedFilterStore, updateFilter } from '../../filter'
  import view from '../../plugin'
  import FilterTypePopup from './FilterTypePopup.svelte'

  export let _class: Ref<Class<Doc>> | undefined
  export let space: Ref<Space> | undefined = undefined
  export let viewOptions: ViewOptions | undefined = undefined
  export let adaptive = false
  export let visible = false

  $: void adaptive

  const hierarchy = getClient().getHierarchy()
  const filterLabel = intl(view.string.Filter)

  $: visible = _class !== undefined && hierarchy.classHierarchyMixin(_class, view.mixin.ClassFilters) !== undefined

  function restoreSavedFilters (): void {
    const savedFilters = localStorage.getItem(getFilterKey(_class))
    if (savedFilters !== null) {
      filterStore.set(JSON.parse(savedFilters) as Filter[])
    }
  }

  resolvedLocationStore.subscribe(() => {
    if (get(selectedFilterStore) === undefined) restoreSavedFilters()
  })

  filterStore.subscribe((activeFilters) => {
    localStorage.setItem(getFilterKey(_class), JSON.stringify(activeFilters))
  })

  onDestroy(() => {
    _class = undefined
  })

  $: hasFilters = $filterStore.length > 0

  function applyPickedFilter (pickedFilter: Filter | undefined): void {
    if (pickedFilter !== undefined) updateFilter(pickedFilter)
  }

  function openAddFilter (event: MouseEvent): void {
    const anchor = eventToHTMLElement(event)
    const nextIndex = hasFilters ? Math.max(...$filterStore.map((activeFilter) => activeFilter.index)) + 1 : 1
    showPopup(
      FilterTypePopup,
      { _class, space, target: anchor, index: nextIndex, onChange: applyPickedFilter, viewOptions },
      anchor
    )
  }
</script>

{#if visible}
  <button
    type="button"
    data-id="btn-filter"
    aria-haspopup="menu"
    aria-label={$filterLabel}
    class={cn(toolbarIconButton, hasFilters && 'text-foreground')}
    use:tooltip={{ label: hasFilters ? view.string.AddFilter : view.string.Filter, direction: 'bottom' }}
    on:click={openAddFilter}
  >
    <ListFilter size={14} />
    {#if hasFilters}
      <span class="absolute -right-px -top-px size-2 rounded-full bg-primary ring-2 ring-background"></span>
    {/if}
  </button>
{/if}
