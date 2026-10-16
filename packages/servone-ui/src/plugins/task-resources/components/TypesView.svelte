<script lang="ts">
  import { mergeQueries, type Class, type Doc, type DocumentQuery, type Ref, type Space } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import type { ProjectTypeDescriptor } from '@hcengineering/task'
  import { type AnyComponent, Button, Component, Header, IconAdd, Loading, SearchInput, showPopup } from '@hcengineering/ui'
  import type { Viewlet, ViewletDescriptor, ViewletPreference, ViewOptions } from '@hcengineering/view'
  import {
    FilterBar,
    FilterButton,
    filterStore,
    getResultOptions,
    ViewletSelector,
    ViewletSettingButton
  } from '@hcengineering/view-resources'
  import { writable } from 'svelte/store'
  import { selectedTaskTypeStore, selectedTypeStore, taskTypeStore } from '..'
  import { provideEmptyState, type EmptyStateInfo } from '../../../lib/empty-state'
  import task from '../plugin'
  import TypeSelector from './TypeSelector.svelte'

  export let _class: Ref<Class<Doc>>
  export let space: Ref<Space> | undefined = undefined
  export let label: IntlString
  export let createLabel: IntlString | undefined
  export let createComponent: AnyComponent | undefined
  export let createComponentProps: Record<string, any> = {}
  export let isCreationDisabled: boolean = false
  export let descriptors: Ref<ViewletDescriptor>[] | undefined = undefined
  export let baseQuery: DocumentQuery<Doc> | undefined = undefined
  export let descriptor: Ref<ProjectTypeDescriptor>

  const APPLICATION_CREATE_LABEL = 'recruit:string:ApplicationCreateLabel'
  const CREATE_APPLICATION_LABEL = 'recruit:string:CreateApplication' as IntlString

  const projectsQuery = createQuery()
  const emptyState = writable<EmptyStateInfo>({ label, hasCreate: false, filtered: false })
  provideEmptyState(emptyState)

  let viewlet: Viewlet | undefined
  let preference: ViewletPreference | undefined
  let viewlets: Viewlet[] = []
  let viewOptions: ViewOptions | undefined
  let searchText = ''
  let projectIds: Ref<Space>[] = []
  let resultOptions: Awaited<ReturnType<typeof getResultOptions>>
  let optionsRun = 0
  let filteredQuery: DocumentQuery<Doc> = {}

  function buildViewletQuery (attachTo: Ref<Class<Doc>>, allowed: Ref<ViewletDescriptor>[] | undefined): DocumentQuery<Viewlet> {
    const viewletQuery: DocumentQuery<Viewlet> = { attachTo, variant: { $exists: false } }
    if (allowed !== undefined) {
      viewletQuery.descriptor = { $in: allowed }
    }
    return viewletQuery
  }

  function resolveResultOptions (current: Viewlet | undefined, options: ViewOptions | undefined): void {
    const run = ++optionsRun
    void getResultOptions(current?.options ?? {}, current?.viewOptions?.other, options).then((resolved) => {
      if (run === optionsRun) resultOptions = resolved
    })
  }

  function buildSearchQuery (base: DocumentQuery<Doc>, text: string): DocumentQuery<Doc> {
    const searchQuery: DocumentQuery<Doc> = { ...base }
    if (text !== '') {
      searchQuery.$search = text
    }
    return searchQuery
  }

  function openCreate (): void {
    if (createComponent !== undefined) {
      showPopup(createComponent, createComponentProps, 'top')
    }
  }

  $: hasCreate = createLabel !== undefined && createComponent !== undefined
  $: buttonLabel = (createLabel === APPLICATION_CREATE_LABEL ? CREATE_APPLICATION_LABEL : createLabel) as IntlString

  $: viewletQuery = buildViewletQuery(_class, descriptors)

  $: resolveResultOptions(viewlet, viewOptions)

  $: projectsQuery.query(
    task.class.Project,
    { type: $selectedTypeStore },
    (projects) => {
      projectIds = projects.map((project) => project._id)
    },
    { showArchived: resultOptions?.showArchived ?? false }
  )

  $: scopedQuery = mergeQueries(mergeQueries(baseQuery ?? {}, viewlet?.baseQuery ?? {}), {
    space: { $in: projectIds }
  })
  $: searchQuery = buildSearchQuery(scopedQuery, searchText)
  $: filteredQuery = searchQuery

  $: kindQuery = (
    $selectedTaskTypeStore !== undefined
      ? { kind: $selectedTaskTypeStore }
      : {
          kind: {
            $in: [...$taskTypeStore.values()]
              .filter((taskType) => taskType.parent === $selectedTypeStore)
              .map((taskType) => taskType._id)
          }
        }
  ) as DocumentQuery<Doc>
  $: listQuery = mergeQueries(filteredQuery, kindQuery)
  $: totalQuery = mergeQueries(scopedQuery, kindQuery)

  $: emptyState.set({ label, hasCreate, filtered: searchText !== '' || $filterStore.length > 0 })

  $: isLoading =
    viewlet === undefined ||
    viewlet.$lookup?.descriptor?.component === undefined ||
    viewlet.attachTo !== _class ||
    (preference !== undefined && preference.attachedTo !== viewlet._id)
</script>

<Header adaptive={'freezeActions'} hideActions={!hasCreate}>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector bind:viewlet bind:preference bind:viewlets {viewletQuery} ignoreFragment />
    <ViewletSettingButton bind:viewOptions bind:viewlet />
  </svelte:fragment>

  <TypeSelector baseClass={_class} />

  <svelte:fragment slot="search">
    <SearchInput
      bind:value={searchText}
      collapsed
      on:change={(event) => {
        searchText = event.detail
      }}
    />
    <FilterButton {_class} {space} />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    {#if hasCreate}
      <Button icon={IconAdd} label={buttonLabel} kind={'primary'} size={'small'} disabled={isCreationDisabled} on:click={openCreate} />
    {/if}
  </svelte:fragment>
</Header>

{#if isLoading}
  <Loading />
{:else if viewOptions !== undefined && viewlet !== undefined}
  <FilterBar
    {_class}
    {space}
    query={searchQuery}
    {viewOptions}
    on:change={(event) => {
      filteredQuery = mergeQueries(scopedQuery, event.detail)
    }}
  />
  <Component
    is={viewlet.$lookup?.descriptor?.component}
    props={{
      _class,
      space,
      options: viewlet.options,
      config: preference?.config ?? viewlet.config,
      viewlet,
      viewOptions,
      viewOptionsConfig: viewlet.viewOptions?.other,
      createItemDialog: createComponent,
      createItemLabel: createLabel,
      query: listQuery,
      totalQuery
    }}
  />
{/if}
