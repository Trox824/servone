<script lang="ts">
  import type { DocumentQuery, Ref, WithLookup } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { isCreateAllowed } from '@hcengineering/presentation'
  import type { Component, Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Breadcrumbs, SearchInput, showPopup, Header } from '@hcengineering/ui'
  import type { ViewOptions, Viewlet } from '@hcengineering/view'
  import { FilterBar, FilterButton, filterStore, ViewletSelector, ViewletSettingButton } from '@hcengineering/view-resources'
  import { writable } from 'svelte/store'
  import tracker from '../../plugin'
  import { type ComponentsFilterMode, activeProjects, componentsTitleMap } from '../../utils'
  import ComponentsContent from './ComponentsContent.svelte'
  import NewComponent from './NewComponent.svelte'
  import { provideEmptyState, type EmptyStateInfo } from '../../../../lib/empty-state'

  export let label: IntlString
  export let query: DocumentQuery<Component> = {}
  export let search: string = ''
  export let filterMode: ComponentsFilterMode = 'all'

  const projectSpace: Ref<Project> = typeof query.space === 'string' ? (query.space as Ref<Project>) : tracker.project.DefaultProject

  let activeViewlet: WithLookup<Viewlet> | undefined
  let availableViewlets: Array<WithLookup<Viewlet>> = []
  let activeViewOptions: ViewOptions | undefined

  const emptyStateStore = writable<EmptyStateInfo>({
    label: tracker.string.Components,
    hasCreate: false,
    filtered: false
  })
  provideEmptyState(emptyStateStore)

  function withSearchText (baseQuery: DocumentQuery<Component>, text: string): DocumentQuery<Component> {
    const nextQuery: DocumentQuery<Component> = { ...baseQuery }
    if (text !== '') {
      nextQuery.$search = text
    }
    return nextQuery
  }

  function openNewComponent (): void {
    showPopup(NewComponent, { space: projectSpace, targetElement: null }, 'top')
  }

  $: currentProject = $activeProjects.get(projectSpace)
  $: canCreateComponent = currentProject !== undefined && isCreateAllowed(tracker.class.Component, currentProject)
  $: breadcrumbItems = [{ icon: tracker.icon.Component, label }, { label: componentsTitleMap[filterMode] }]
  $: searchQuery = withSearchText(query, search)
  let listQuery: DocumentQuery<Component> = {}
  $: listQuery = { ...searchQuery }

  $: emptyStateStore.set({
    icon: tracker.icon.Component,
    label: tracker.string.Components,
    hasCreate: canCreateComponent,
    filtered: search !== '' || $filterStore.length > 0 || filterMode !== 'all'
  })
</script>

<Header adaptive={'freezeActions'} hideActions={!canCreateComponent}>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector
      bind:viewlet={activeViewlet}
      bind:viewlets={availableViewlets}
      viewletQuery={{ attachTo: tracker.class.Component }}
    />
    <ViewletSettingButton bind:viewOptions={activeViewOptions} viewlet={activeViewlet} />
  </svelte:fragment>

  <Breadcrumbs items={breadcrumbItems} />

  <svelte:fragment slot="search">
    <SearchInput bind:value={search} collapsed />
    <FilterButton _class={tracker.class.Component} space={projectSpace} />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    {#if canCreateComponent}
      <Button
        icon={IconAdd}
        label={tracker.string.NewComponent}
        kind={'primary'}
        size={'small'}
        on:click={openNewComponent}
      />
    {/if}
  </svelte:fragment>
</Header>

<FilterBar
  _class={tracker.class.Component}
  space={projectSpace}
  query={searchQuery}
  viewOptions={activeViewOptions}
  on:change={(event) => (listQuery = event.detail)}
/>

{#if activeViewlet && activeViewOptions}
  <ComponentsContent
    viewlet={activeViewlet}
    query={{ ...listQuery }}
    space={projectSpace}
    viewOptions={activeViewOptions}
  />
{/if}
