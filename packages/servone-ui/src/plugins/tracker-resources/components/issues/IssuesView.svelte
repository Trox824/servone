<script lang="ts">
  import { type DocumentQuery, type Ref, type Space, type WithLookup } from '@hcengineering/core'
  import { type Asset, type IntlString, translateCB } from '@hcengineering/platform'
  import { ComponentExtensions, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { type Issue, TrackerEvents } from '@hcengineering/tracker'
  import {
    Button,
    Component,
    deviceOptionsStore as deviceInfo,
    IconAdd,
    type IModeSelector,
    ModeSelector,
    resolvedLocationStore,
    SearchInputAdvanced,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import { type ViewOptions, type Viewlet } from '@hcengineering/view'
  import {
    FilterBar,
    FilterButton,
    InlineFilterChips,
    SpaceHeader,
    ViewletContentView,
    ViewletSettingButton,
    defaultOptions,
    filterStore,
    getViewOptions,
    rawSearchTextStore,
    resultIssueCountStore,
    resetResultCount,
    searchHighlightEnabledStore,
    showEmptyGroupsStore,
    shouldShowSearchEmptyState,
    viewOptionStore
  } from '@hcengineering/view-resources'
  import { onDestroy, onMount } from 'svelte'
  import tracker from '../../plugin'
  import { readIsOpen, writeIsOpen } from '../../insights/storage'
  import { component as servoneComponent, icon as servoneIcon, str as servoneStr } from '../../sprints/plugin'
  import CreateIssue from '../CreateIssue.svelte'
  import GanttToolbarBar from '../gantt/GanttToolbarBar.svelte'
  import SearchEmptyState from '../SearchEmptyState.svelte'
  import FilterEmptyState from './FilterEmptyState.svelte'
  import SavedViews from './SavedViews.svelte'
  import SearchOptionsMenu from './SearchOptionsMenu.svelte'
  import SampleProjectActions from '../../onboarding/SampleProjectActions.svelte'
  import ProjectEmptyState from '../../../../onboarding/ProjectEmptyState.svelte'
  import { isWorkflowType } from '../../workflows/nav'
  import { WORKFLOW_APP_ALIAS } from '../../workflows/plugin'

  export let space: Ref<Space> | undefined = undefined
  export let query: DocumentQuery<Issue> = {}
  export let title: IntlString | undefined = undefined
  export let label: string = ''
  export let icon: Asset | undefined = undefined
  export let modeSelectorProps: IModeSelector | undefined = undefined
  export let createProps: Record<string, unknown> = {}
  export let viewOptionDefaults: Partial<ViewOptions> | undefined = undefined

  const SEARCH_MENU_KEYS = ['searchScope', 'searchHighlight']
  const ISSUE_IDENTIFIER_PATTERN = /^[a-z]+-\d+$/i
  const HEADER_VIEWLET_QUERY = {
    attachTo: tracker.class.Issue,
    variant: { $nin: ['subissue', 'component', 'milestone'] },
    descriptor: { $ne: tracker.viewlet.Gantt }
  }

  const workflowTaskTypeIds = getClient()
    .getModel()
    .findAllSync(task.class.TaskType, {})
    .filter((taskType) => isWorkflowType(taskType.parent))
    .map((taskType) => taskType._id)

  function scopeHostQuery (hostQuery: DocumentQuery<Issue>, onWorkflowPage: boolean): DocumentQuery<Issue> {
    if (onWorkflowPage || hostQuery.kind !== undefined) return hostQuery
    return { ...hostQuery, kind: { $nin: workflowTaskTypeIds } }
  }

  function refineQueryBySearch (baseQuery: DocumentQuery<Issue>, searchText: string): DocumentQuery<Issue> {
    const trimmedText = searchText.trim()
    if (trimmedText === '') return { ...baseQuery }
    if (ISSUE_IDENTIFIER_PATTERN.test(trimmedText)) return { ...baseQuery, identifier: trimmedText.toUpperCase() }
    return { ...baseQuery, title: { $like: `%${trimmedText}%` } }
  }

  function buildSettingsDefaults (
    selectedViewlet: WithLookup<Viewlet> | undefined,
    pageOverrides: Partial<ViewOptions> | undefined
  ): ViewOptions | undefined {
    const optionModel = selectedViewlet?.viewOptions
    if (pageOverrides === undefined || optionModel === undefined) return undefined
    const otherDefaults = Object.fromEntries(optionModel.other.map((entry) => [entry.key, entry.defaultValue]))
    return {
      groupBy: [optionModel.groupBy[0] ?? defaultOptions.groupBy[0]],
      orderBy: optionModel.orderBy?.[0] ?? defaultOptions.orderBy,
      ...otherDefaults,
      ...pageOverrides
    }
  }

  function rearmResultCount (_encodedText: string): void {
    resetResultCount()
  }

  let rawSearchText = ''
  let encodedSearchText = ''
  let headerSearchText = ''
  let viewlet: WithLookup<Viewlet> | undefined
  let viewOptions: ViewOptions | undefined
  let isInsightsOpen = false

  let contentQuery: DocumentQuery<Issue> = refineQueryBySearch(
    scopeHostQuery(query, $resolvedLocationStore.path[2] === WORKFLOW_APP_ALIAS),
    ''
  )

  $: isWorkflowPage = $resolvedLocationStore.path[2] === WORKFLOW_APP_ALIAS
  $: scopedQuery = scopeHostQuery(query, isWorkflowPage)

  function handleSearchChange (event: CustomEvent<{ raw: string, encoded: string }>): void {
    rawSearchText = event.detail.raw
    encodedSearchText = event.detail.encoded
  }

  const LONG_PRESS_MS = 450
  const PRESS_SLOP_PX = 8
  const SELECT_MODE_CLASS = 'issue-select-mode'
  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let pressX = 0
  let pressY = 0
  let didLongPress = false

  function cancelPress (): void {
    clearTimeout(pressTimer)
  }

  function startPress (event: PointerEvent): void {
    didLongPress = false
    const row = event.target instanceof Element ? event.target.closest('.listGrid') : null
    if (row === null || row.classList.contains('showMore')) return
    pressX = event.clientX
    pressY = event.clientY
    pressTimer = setTimeout(() => {
      document.getElementById('ui-root')?.classList.add(SELECT_MODE_CLASS)
      row.querySelector<HTMLInputElement>('.antiList-cells__checkCell input')?.click()
      didLongPress = true
    }, LONG_PRESS_MS)
  }

  function movePress (event: PointerEvent): void {
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > PRESS_SLOP_PX) cancelPress()
  }

  function swallowContextMenu (event: Event): void {
    if (!didLongPress) return
    event.preventDefault()
    event.stopPropagation()
  }

  function swallowClick (event: Event): void {
    swallowContextMenu(event)
    didLongPress = false
  }

  function leaveSelectModeWhenEmpty (): void {
    setTimeout(() => {
      if (document.querySelector('.listGrid.checking') === null) {
        document.getElementById('ui-root')?.classList.remove(SELECT_MODE_CLASS)
      }
    }, 50)
  }

  onMount(() => {
    if (!$deviceInfo.isMobile) return
    document.addEventListener('pointerdown', startPress, true)
    document.addEventListener('pointermove', movePress, true)
    document.addEventListener('pointerup', cancelPress, true)
    document.addEventListener('pointercancel', cancelPress, true)
    document.addEventListener('contextmenu', swallowContextMenu, true)
    document.addEventListener('click', swallowClick, true)
    document.addEventListener('click', leaveSelectModeWhenEmpty, true)
    return () => {
      document.removeEventListener('pointerdown', startPress, true)
      document.removeEventListener('pointermove', movePress, true)
      document.removeEventListener('pointerup', cancelPress, true)
      document.removeEventListener('pointercancel', cancelPress, true)
      document.removeEventListener('contextmenu', swallowContextMenu, true)
      document.removeEventListener('click', swallowClick, true)
      document.removeEventListener('click', leaveSelectModeWhenEmpty, true)
      cancelPress()
      document.getElementById('ui-root')?.classList.remove(SELECT_MODE_CLASS)
    }
  })

  $: rawSearchTextStore.set(rawSearchText)
  onDestroy(() => {
    rawSearchTextStore.set('')
  })

  $: searchQuery = refineQueryBySearch(scopedQuery, rawSearchText)

  $: if (title !== undefined) {
    translateCB(title, {}, $themeStore.language, (translatedTitle) => {
      label = translatedTitle
    })
  }

  $: isChartLayoutActive = viewlet?.descriptor === tracker.viewlet.Gantt
  $: isUpstreamChartLayout = isChartLayoutActive && space === undefined
  $: if (isChartLayoutActive && viewlet !== undefined) {
    viewOptions = getViewOptions(viewlet, $viewOptionStore)
  }

  $: settingsDefaults = buildSettingsDefaults(viewlet, viewOptionDefaults)
  $: pageViewOptions =
    viewOptions === undefined || viewOptionDefaults === undefined
      ? viewOptions
      : { ...viewOptions, ...viewOptionDefaults }
  $: effectiveViewOptions =
    pageViewOptions !== undefined && $deviceInfo.isMobile
      ? { ...pageViewOptions, shouldShowAll: false }
      : pageViewOptions
  $: hiddenSettingKeys = [
    ...SEARCH_MENU_KEYS,
    ...(isChartLayoutActive ? ['ganttGroupBy'] : Object.keys(viewOptionDefaults ?? {}))
  ]

  $: searchHighlightEnabledStore.set((viewOptions?.searchHighlight ?? true) !== false)
  $: areEmptyGroupsShown = effectiveViewOptions?.shouldShowAll !== false
  $: showEmptyGroupsStore.set(areEmptyGroupsShown)

  $: rearmResultCount(encodedSearchText)
  const stopWatchingFilters = filterStore.subscribe(() => {
    resetResultCount()
  })
  onDestroy(stopWatchingFilters)

  $: isSearchCardShown = shouldShowSearchEmptyState($rawSearchTextStore, $resultIssueCountStore, areEmptyGroupsShown)
  $: narrowingLabel =
    modeSelectorProps !== undefined && modeSelectorProps.mode !== modeSelectorProps.config[0]?.[0]
      ? modeSelectorProps.config.find(([modeId]) => modeId === modeSelectorProps?.mode)?.[1]
      : undefined
  $: isFilterCardShown =
    !isSearchCardShown &&
    $rawSearchTextStore.trim() === '' &&
    $resultIssueCountStore === 0 &&
    !areEmptyGroupsShown &&
    ($filterStore.length > 0 || narrowingLabel !== undefined)

  function showAllModes (): void {
    const firstModeId = modeSelectorProps?.config[0]?.[0]
    if (firstModeId !== undefined) modeSelectorProps?.onChange(firstModeId)
  }

  $: viewPath = $resolvedLocationStore.path.join('/')
  $: isInsightsOpen = readIsOpen(viewPath)
  $: showInsightsPanel = isInsightsOpen && !isUpstreamChartLayout

  function setInsightsOpen (nextIsOpen: boolean): void {
    isInsightsOpen = nextIsOpen
    writeIsOpen(viewPath, nextIsOpen)
  }

  function openCreateIssue (): void {
    showPopup(CreateIssue, { space, shouldSaveDraft: !isWorkflowPage, ...createProps }, 'top')
  }

  $: createItemDialogProps = { shouldSaveDraft: !isWorkflowPage, ...createProps }
</script>

<SpaceHeader
  _class={tracker.class.Issue}
  {icon}
  bind:viewlet
  bind:search={headerSearchText}
  showLabelSelector={$$slots.label_selector}
  viewletQuery={HEADER_VIEWLET_QUERY}
  {label}
  {space}
  resultQuery={contentQuery}
  modeSelectorProps={isUpstreamChartLayout || viewOptions?.showQuickModeSelector === false ? undefined : modeSelectorProps}
  overrideSearch={true}
  shrinkSearch={isUpstreamChartLayout}
>
  <svelte:fragment slot="header-tools">
    <ViewletSettingButton
      bind:viewOptions
      {viewlet}
      defaultViewOptions={settingsDefaults}
      hideGroupingAndOrdering={isChartLayoutActive}
      showConfigureColumns={!isChartLayoutActive}
      hideKeys={hiddenSettingKeys}
    />
  </svelte:fragment>
  <svelte:fragment slot="search">
    {#if isUpstreamChartLayout}
      <GanttToolbarBar section="cluster" />
      <InlineFilterChips _class={tracker.class.Issue} {space} constrained />
      <FilterButton _class={tracker.class.Issue} {space} />
      {#if modeSelectorProps !== undefined && viewOptions?.showQuickModeSelector !== false}
        <ModeSelector kind="subtle" props={modeSelectorProps} />
      {/if}
      <SearchInputAdvanced
        value={rawSearchText}
        scope={viewOptions?.searchScope ?? 'all'}
        collapsed={true}
        on:change={handleSearchChange}
      />
      {#if viewlet !== undefined && viewOptions !== undefined}
        <SearchOptionsMenu {viewlet} {viewOptions} />
      {/if}
    {:else}
      <SearchInputAdvanced
        value={rawSearchText}
        scope={viewOptions?.searchScope ?? 'all'}
        collapsed={true}
        on:change={handleSearchChange}
      />
      {#if viewlet !== undefined && viewOptions !== undefined}
        <SearchOptionsMenu {viewlet} {viewOptions} />
      {/if}
      <FilterButton _class={tracker.class.Issue} {space} />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="extra-trailing">
    {#if isUpstreamChartLayout}
      <GanttToolbarBar section="trailing" />
    {:else}
      <SavedViews _class={tracker.class.Issue} {viewlet} {viewOptions} />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="label_selector">
    <slot name="label_selector" />
  </svelte:fragment>
  <svelte:fragment slot="type_selector">
    <slot name="type_selector" {viewlet} />
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <SampleProjectActions {space} />
    <slot name="actions" />
    <ComponentExtensions
      extension={tracker.extensions.IssueListHeader}
      props={{ size: 'small', kind: 'tertiary', space }}
    />
    {#if !isUpstreamChartLayout}
      <Button
        icon={servoneIcon.insights}
        kind="icon"
        selected={isInsightsOpen}
        showTooltip={{ label: servoneStr.Insights }}
        on:click={() => {
          setInsightsOpen(!isInsightsOpen)
        }}
      />
    {/if}
    {#if viewlet?.descriptor !== tracker.viewlet.Kanban}
      <Button
        kind="primary"
        icon={IconAdd}
        iconProps={{ size: 'medium' }}
        shape={$deviceInfo.isMobile ? 'circle' : 'round'}
        dataId={'btnNewIssue'}
        showTooltip={{ label: isWorkflowPage ? servoneStr.NewItem : tracker.string.NewIssue }}
        on:click={openCreateIssue}
      />
    {/if}
  </svelte:fragment>
</SpaceHeader>

{#if effectiveViewOptions !== undefined}
  <FilterBar
    _class={tracker.class.Issue}
    {space}
    query={searchQuery}
    viewOptions={effectiveViewOptions}
    hideChips={true}
    on:change={(event) => {
      contentQuery = event.detail
    }}
  />
{/if}

<slot name="afterHeader" />

{#if !isUpstreamChartLayout}
  <div class="below-header-filters" data-empty={$filterStore.length === 0 ? 'true' : 'false'}>
    <InlineFilterChips _class={tracker.class.Issue} {space} />
  </div>
{/if}

<div class="view-split" class:view-split-open={showInsightsPanel}>
  <div class="view-split-main" class:view-split-main-open={showInsightsPanel}>
    {#if viewlet !== undefined && effectiveViewOptions !== undefined}
      <ViewletContentView
        _class={tracker.class.Issue}
        {viewlet}
        query={contentQuery}
        {space}
        viewOptions={effectiveViewOptions}
        createItemDialog={CreateIssue}
        createItemLabel={tracker.string.AddIssueTooltip}
        createItemEvent={TrackerEvents.IssuePlusButtonClicked}
        {createItemDialogProps}
      />
    {/if}
  </div>
  {#if showInsightsPanel}
    <div class="view-split-dock">
      {#key viewPath}
        <Component
          is={servoneComponent.Insights}
          props={{ query: contentQuery, viewlet, viewOptions: effectiveViewOptions, label, viewPath }}
          on:close={() => {
            setInsightsOpen(false)
          }}
        />
      {/key}
    </div>
  {/if}
</div>

{#if isSearchCardShown}
  <div class="search-empty-state-overlay">
    <SearchEmptyState searchText={$rawSearchTextStore} activeFilters={$filterStore.map((filter) => filter.key.key)} />
  </div>
{:else if isFilterCardShown}
  <div class="search-empty-state-overlay">
    <FilterEmptyState modeLabel={narrowingLabel} hasFilters={$filterStore.length > 0} onShowAll={showAllModes} />
  </div>
{:else if space !== undefined && !isWorkflowPage}
  <ProjectEmptyState {space} />
{/if}

<style lang="scss">
  .below-header-filters {
    display: flex;
    align-items: center;
    padding: 4px 12px;
    min-height: 28px;
    border-bottom: 1px solid var(--theme-divider-color);

    &[data-empty='true'] {
      display: none;
    }
  }

  .view-split,
  .view-split-main {
    display: contents;
  }

  .view-split-open {
    display: flex;
    flex-direction: row;
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    container-type: inline-size;
  }

  .view-split-main-open {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .view-split-dock {
    display: flex;
    flex-direction: column;
    flex: 0 0 440px;
    width: 440px;
    min-height: 0;
    border-left: 1px solid var(--theme-divider-color);
    background-color: var(--theme-bg-color);
  }

  @container (max-width: 900px) {
    .view-split-dock {
      position: absolute;
      inset: 0 0 0 auto;
      max-width: 100%;
      z-index: 102;
      box-shadow: var(--theme-popup-shadow);
    }
  }

  .search-empty-state-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 101;
    pointer-events: none;

    :global(.search-empty-state) {
      pointer-events: auto;
    }
  }

  :global(.hulyComponent:has(> .search-empty-state-overlay)) {
    position: relative;
  }
</style>
