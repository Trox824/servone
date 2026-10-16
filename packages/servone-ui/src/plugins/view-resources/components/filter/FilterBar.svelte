<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { AccountRole, type Class, type Doc, type DocumentQuery, type Ref, type Space, getCurrentAccount } from '@hcengineering/core'
  import { getClient, reduceCalls } from '@hcengineering/presentation'
  import { Button, IconAdd, IconClose, eventToHTMLElement, getCurrentLocation, showPopup } from '@hcengineering/ui'
  import type { Filter, FilterMode, FilteredView, ViewOptions, Viewlet } from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import { filterStore, removeFilter, selectedFilterStore, setFilters, updateFilter } from '../../filter'
  import { makeFilterQuery } from '../../filter/query-builder'
  import view from '../../plugin'
  import { activeViewlet, getActiveViewletId, makeViewletKey } from '../../utils'
  import { getViewOptions, viewOptionStore } from '../../viewOptions'
  import FilterSave from './FilterSave.svelte'
  import FilterSection from './FilterSection.svelte'
  import FilterTypePopup from './FilterTypePopup.svelte'
  import InlineFilterChips from './InlineFilterChips.svelte'

  export let _class: Ref<Class<Doc>> | undefined
  export let space: Ref<Space> | undefined
  export let query: DocumentQuery<Doc>
  export let viewOptions: ViewOptions | undefined = undefined
  export let hideSaveButtons = false
  export let hideChips = false

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const canSave = ![AccountRole.ReadOnlyGuest, AccountRole.DocGuest].includes(getCurrentAccount().role)

  async function resolveMode (modeId: Ref<FilterMode>): Promise<FilterMode | undefined> {
    return await client.findOne(view.class.FilterMode, { _id: modeId })
  }

  const rebuildQuery = reduceCalls(async function (baseQuery: DocumentQuery<Doc>, activeFilters: Filter[]): Promise<void> {
    const combinedQuery = await makeFilterQuery(baseQuery, activeFilters, resolveMode, undefined, hierarchy, () => {
      void rebuildQuery(baseQuery, activeFilters)
    })
    dispatch('change', combinedQuery)
  })

  $: void rebuildQuery(query, $filterStore)

  let lastFilterSignature: string | undefined
  $: trackFilters($filterStore)

  function trackFilters (activeFilters: Filter[]): void {
    const signature = JSON.stringify(activeFilters.map((filter) => [filter.key.key, filter.mode, filter.value]))
    if (lastFilterSignature !== undefined && signature !== lastFilterSignature && activeFilters.length > 0) {
      const filterKeys = activeFilters.map((filter) => filter.key.key).sort()
      Analytics.handleEvent('list_filtered', { object_class: _class, filter_keys: filterKeys })
    }
    lastFilterSignature = signature
  }

  let isSupported = false
  $: if (_class !== undefined) {
    isSupported = hierarchy.classHierarchyMixin(_class, view.mixin.ClassFilters) !== undefined
  }

  function findUnsavedChanges (
    selectedView: FilteredView | undefined,
    activeFilters: Filter[],
    activeViewletIds: Record<string, Ref<Viewlet> | null>,
    optionsByViewlet: Map<string, ViewOptions>
  ): boolean {
    if (selectedView === undefined) return false
    if (!getCurrentAccount().socialIds.includes(selectedView.createdBy)) return false
    if (selectedView.viewletId !== activeViewletIds[makeViewletKey(getCurrentLocation())]) return true
    if (selectedView.filters !== JSON.stringify(activeFilters)) return true
    if (selectedView.viewletId === null) return false
    const storedOptions = getViewOptions({ _id: selectedView.viewletId } as Viewlet, optionsByViewlet)
    return JSON.stringify(selectedView.viewOptions) !== JSON.stringify(storedOptions)
  }

  let hasUnsavedChanges = false
  $: hasUnsavedChanges = findUnsavedChanges($selectedFilterStore, $filterStore, $activeViewlet, $viewOptionStore)

  async function updateSelectedView (): Promise<void> {
    const selectedView = $selectedFilterStore
    if (selectedView === undefined) return
    const changes = {
      filters: JSON.stringify($filterStore),
      viewOptions,
      viewletId: getActiveViewletId()
    }
    await client.update(selectedView, changes)
    selectedFilterStore.set({ ...selectedView, ...changes })
  }

  function applyPickedFilter (pickedFilter: Filter | undefined): void {
    if (pickedFilter !== undefined) updateFilter(pickedFilter)
  }

  function openAddFilter (event: MouseEvent): void {
    const anchor = eventToHTMLElement(event)
    const highestIndex = Math.max(0, ...$filterStore.map((activeFilter) => activeFilter.index))
    showPopup(FilterTypePopup, { _class, target: anchor, space, index: highestIndex + 1, onChange: applyPickedFilter }, anchor)
  }

  function openSaveAs (): void {
    showPopup(FilterSave, { viewOptions, _class })
  }

  function handleChipChange (changedFilter: Filter): void {
    void rebuildQuery(query, $filterStore)
    updateFilter(changedFilter)
  }
</script>

{#if isSupported && $filterStore.length > 0}
  <div
    class="flex w-full min-w-0 items-center gap-2 px-3 py-1.5"
    class:filterbar-inline-container={hideChips}
    class:filterbar-container={!hideChips}
  >
    {#if hideChips}
      <div class="filterbar-chips flex min-w-0 flex-1 items-center">
        <InlineFilterChips {_class} {space} />
      </div>
    {:else}
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {#each $filterStore as activeFilter, position}
          <FilterSection
            {space}
            filter={activeFilter}
            on:change={() => { handleChipChange(activeFilter) }}
            on:remove={() => { removeFilter(position) }}
          />
        {/each}
        <Button icon={IconAdd} kind="ghost" size="small" on:click={openAddFilter} />
        <Button
          icon={IconClose}
          label={view.string.ClearFilters}
          kind="ghost"
          size="small"
          on:click={() => { setFilters([]) }}
        />
      </div>
    {/if}
    {#if canSave && !hideSaveButtons}
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <Button icon={view.icon.Views} label={view.string.SaveAs} kind="ghost" size="small" on:click={openSaveAs} />
        {#if hasUnsavedChanges}
          <Button
            icon={view.icon.Views}
            label={view.string.Save}
            kind="ghost"
            size="small"
            on:click={updateSelectedView}
          />
        {/if}
      </div>
    {/if}
  </div>
{/if}
