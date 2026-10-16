<script lang="ts">
  import { type DocumentQuery, SortingOrder, type WithLookup } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import type { Milestone } from '@hcengineering/tracker'
  import { Button, IconAdd, SearchInput, type TabItem, Switcher, showPopup, Header, Breadcrumbs } from '@hcengineering/ui'
  import type { ViewOptions, Viewlet } from '@hcengineering/view'
  import { FilterBar, FilterButton, filterStore, ViewletSelector, ViewletSettingButton } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import { type MilestoneViewMode, getIncludedMilestoneStatuses, milestoneTitleMap } from '../../utils'
  import MilestoneContent from './MilestoneContent.svelte'
  import NewMilestone from './NewMilestone.svelte'
  import { writable } from 'svelte/store'
  import { provideEmptyState, type EmptyStateInfo } from '../../../../lib/empty-state'

  export let label: IntlString
  export let query: DocumentQuery<Milestone> = {}
  export let search: string = ''
  export let mode: MilestoneViewMode = 'all'
  export let panelWidth: number = 0

  const targetSpace = typeof query.space === 'string' ? query.space : tracker.project.DefaultProject
  const defaultViewOptions = {
    groupBy: ['status'],
    orderBy: ['targetDate', SortingOrder.Ascending],
    shouldShowColors: true
  }
  const emptyStateInfo = writable<EmptyStateInfo>({
    icon: tracker.icon.Milestone,
    label: tracker.string.Milestones,
    hasCreate: true,
    filtered: false
  })
  provideEmptyState(emptyStateInfo)

  let viewlet: WithLookup<Viewlet> | undefined
  let viewOptions: ViewOptions | undefined
  let filteredQuery: DocumentQuery<Milestone>

  function openCreateMilestone (): void {
    showPopup(NewMilestone, { space: targetSpace, targetElement: null }, 'top')
  }

  function switchMode (nextMode: MilestoneViewMode): void {
    if (mode !== nextMode) mode = nextMode
  }

  const modeItems: TabItem[] = [
    { id: 'all', labelIntl: tracker.string.AllMilestones, action: () => switchMode('all') },
    { id: 'planned', labelIntl: tracker.string.PlannedMilestones, action: () => switchMode('planned') },
    { id: 'active', labelIntl: tracker.string.ActiveMilestones, action: () => switchMode('active') },
    { id: 'closed', labelIntl: tracker.string.ClosedMilestones, action: () => switchMode('closed') }
  ]

  function runModeAction (event: CustomEvent<TabItem>): void {
    event.detail.action?.()
  }

  $: searchQuery = search !== '' ? { ...query, $search: search } : { ...query }
  $: filteredQuery = { ...searchQuery }
  $: statusQuery = { status: { $in: getIncludedMilestoneStatuses(mode) } }
  $: pageTitle = milestoneTitleMap[mode]
  $: contentQuery = { ...filteredQuery, ...statusQuery }

  $: emptyStateInfo.set({
    icon: tracker.icon.Milestone,
    label: tracker.string.Milestones,
    hasCreate: true,
    filtered: search !== '' || $filterStore.length > 0 || mode !== 'all'
  })
</script>

<Header adaptive={'doubleRow'}>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector viewletQuery={{ attachTo: tracker.class.Milestone }} bind:viewlet />
    <ViewletSettingButton bind:viewOptions bind:viewlet {defaultViewOptions} />
  </svelte:fragment>

  <Breadcrumbs items={[{ icon: tracker.icon.Milestone, label }, { label: pageTitle }]} />

  <svelte:fragment slot="search">
    <SearchInput bind:value={search} collapsed />
    <FilterButton _class={tracker.class.Milestone} space={targetSpace} />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    <Button icon={IconAdd} label={tracker.string.NewMilestone} kind={'primary'} size={'small'} on:click={openCreateMilestone} />
  </svelte:fragment>

  <svelte:fragment slot="extra">
    <Switcher name={'milestone-mode'} items={modeItems} selected={mode} kind={'subtle'} on:select={runModeAction} />
  </svelte:fragment>
</Header>

<FilterBar
  _class={tracker.class.Milestone}
  query={searchQuery}
  space={targetSpace}
  {viewOptions}
  on:change={(event) => {
    filteredQuery = event.detail
  }}
/>

{#if viewlet && viewOptions}
  <MilestoneContent {viewlet} query={contentQuery} space={targetSpace} {viewOptions} />
{/if}
