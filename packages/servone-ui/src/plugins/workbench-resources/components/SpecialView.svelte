<script lang="ts">
  import {
    type Class,
    type Doc,
    type DocumentQuery,
    type FindOptions,
    type Ref,
    type Space,
    type WithLookup,
    mergeQueries
  } from '@hcengineering/core'
  import { type Asset, getResource, type IntlString, type Resource } from '@hcengineering/platform'
  import { ComponentExtensions, getClient } from '@hcengineering/presentation'
  import {
    type AnyComponent,
    type AnySvelteComponent,
    Breadcrumb,
    Button,
    Component,
    Header,
    IconAdd,
    type IModeSelector,
    Loading,
    ModeSelector,
    SearchInput,
    showPopup
  } from '@hcengineering/ui'
  import view, {
    type BuildModelKey,
    type Viewlet,
    type ViewletDescriptor,
    type ViewletPreference,
    type ViewOptions
  } from '@hcengineering/view'
  import {
    FilterBar,
    FilterButton,
    filterStore,
    getResultOptions,
    getResultQuery,
    getViewletSpecialActions,
    ViewletSelector,
    ViewletSettingButton
  } from '@hcengineering/view-resources'
  import { type ParentsNavigationModel } from '@hcengineering/workbench'
  import { deepEqual } from 'fast-equals'
  import type { ComponentType } from 'svelte'
  import { writable } from 'svelte/store'
  import EmptyState from '../../../components/EmptyState.svelte'
  import { provideEmptyState, type EmptyStateInfo } from '../../../lib/empty-state'
  import { emptyCopy, newDocument } from '../../../onboarding/empty-copy'
  import ComponentNavigator from './ComponentNavigator.svelte'

  export let _class: Ref<Class<Doc>>
  export let space: Ref<Space> | undefined = undefined
  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  export let label: IntlString
  export let createEvent: string | undefined = undefined
  export let createLabel: IntlString | undefined = undefined
  export let createComponent: AnyComponent | undefined = undefined
  export let createComponentProps: Record<string, any> = {}
  export let createButton: AnyComponent | undefined = undefined
  export let isCreationDisabled = false
  export let descriptors: Array<Ref<ViewletDescriptor>> | undefined = undefined
  export let baseQuery: DocumentQuery<Doc> | undefined = undefined
  export let modes: IModeSelector<any> | undefined = undefined
  export let navigationModel: ParentsNavigationModel | undefined = undefined
  export let queryBuilder: Resource<() => Promise<DocumentQuery<Doc>>> | undefined = undefined
  export let defaultViewletDescriptor: Ref<ViewletDescriptor> | undefined = undefined
  export let defaultViewOptions: ViewOptions | undefined = undefined
  export let defaultConfig: Array<BuildModelKey | string> | undefined = undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()

  const viewUnavailableTitle = 'ui:string:ServoneViewUnavailable' as IntlString
  const createLabelOverrides: Record<string, IntlString> = {
    'contact:string:Guest': 'contact:string:ServoneCreateGuest' as IntlString,
    'recruit:string:ApplicationCreateLabel': 'recruit:string:CreateApplication' as IntlString
  }
  const pluralLabels: Record<string, IntlString> = {
    'contact:string:Employee': 'contact:string:Employees' as IntlString,
    'contact:string:Person': 'contact:string:Persons' as IntlString,
    'contact:string:Organization': 'contact:string:Organizations' as IntlString,
    'contact:string:Guest': 'contact:string:ServoneGuests' as IntlString,
    'tracker:string:AllProjects': 'tracker:string:ServoneProjects' as IntlString,
    'documents:string:AllDocumentSpaces': 'documents:string:ServoneDocumentSpaces' as IntlString
  }

  let viewlet: WithLookup<Viewlet> | undefined
  let preference: ViewletPreference | undefined
  let viewlets: Array<WithLookup<Viewlet>> = []
  let viewOptions: ViewOptions | undefined
  let hasViewletList = false
  let isFilterVisible = false
  let searchText = ''

  let pageQuery: DocumentQuery<Doc> = {}
  let isQueryLoaded = queryBuilder === undefined
  let latestQueryRequest = 0
  let resultQuery: DocumentQuery<Doc> | undefined

  let trackedRawOptions: FindOptions<Doc> | undefined
  let resolvedOptions: FindOptions<Doc> | undefined
  let isOptionsResolved = false
  let latestOptionsRequest = 0

  const emptyStateInfo = writable<EmptyStateInfo>({ label, hasCreate: false, filtered: false })
  provideEmptyState(emptyStateInfo)

  $: if (_class === 'document:class:Teamspace' && createComponent === undefined) {
    createLabel = 'document:string:CreateTeamspace' as IntlString
    createComponent = 'document:component:CreateTeamspace' as AnyComponent
  }

  $: mixinBaseQuery = hierarchy.classHierarchyMixin(_class, view.mixin.BaseQuery)?.baseQuery ?? {}
  $: mergedBaseQuery = mergeQueries(mergeQueries(baseQuery ?? {}, mixinBaseQuery), viewlet?.baseQuery ?? {})

  $: void refreshPageQuery(mergedBaseQuery, viewOptions, viewlet, queryBuilder)

  $: searchQuery = searchText === '' ? pageQuery : { ...pageQuery, $search: searchText }
  $: resultQuery = isQueryLoaded ? searchQuery : undefined

  $: trackRawOptions(viewlet?.options)
  $: void refreshFindOptions(viewlet?.options, viewlet?.viewOptions?.other, viewOptions)
  $: contentOptions = isOptionsResolved ? resolvedOptions : viewlet?.options

  $: viewletActions = viewlet !== undefined ? getViewletSpecialActions(client, viewlet) : []

  $: shownCreateLabel = createLabel === undefined ? undefined : createLabelOverrides[createLabel] ?? createLabel
  $: hasCreatePair = Boolean(createLabel) && Boolean(createComponent)

  $: emptyStateInfo.set({
    icon,
    iconProps,
    label: pluralLabels[label] ?? label,
    hasCreate: (createLabel !== undefined && createComponent !== undefined) || createButton !== undefined,
    filtered: searchText !== '' || $filterStore.length > 0,
    copy: _class === 'document:class:Teamspace'
      ? { message: emptyCopy.docs, actions: [{ label: emptyCopy.docsAction, run: newDocument }] }
      : undefined
  })

  $: headerAdaptive = modes !== undefined ? 'doubleRow' : isFilterVisible ? 'freezeActions' : 'disabled'
  $: hideHeaderActions = !hasCreatePair && !createButton && viewletActions.length === 0
  $: viewletQuery = buildViewletQuery(_class, descriptors)

  $: descriptorComponent = viewlet?.$lookup?.descriptor?.component
  $: isResolving =
    viewlet?.$lookup?.descriptor?.component === undefined ||
    viewlet.attachTo !== _class ||
    (preference !== undefined && preference.attachedTo !== viewlet._id)

  $: contentProps =
    viewlet === undefined || viewOptions === undefined
      ? undefined
      : {
          _class,
          space,
          options: contentOptions,
          config: preference?.config ?? defaultConfig ?? viewlet.config,
          viewlet,
          viewOptions,
          viewOptionsConfig: viewlet.viewOptions?.other,
          createItemDialog: createComponent,
          createItemLabel: createLabel,
          query: resultQuery,
          totalQuery: pageQuery,
          ...viewlet.props
        }

  function buildViewletQuery (attachTo: Ref<Class<Doc>>, allowedDescriptors: Array<Ref<ViewletDescriptor>> | undefined): DocumentQuery<Viewlet> {
    const query: DocumentQuery<Viewlet> = { attachTo, variant: { $exists: false } }
    if (allowedDescriptors !== undefined) query.descriptor = { $in: allowedDescriptors }
    return query
  }

  async function refreshPageQuery (
    baseForPage: DocumentQuery<Doc>,
    currentOptions: ViewOptions | undefined,
    currentViewlet: WithLookup<Viewlet> | undefined,
    builderResource: Resource<() => Promise<DocumentQuery<Doc>>> | undefined
  ): Promise<void> {
    const requestId = ++latestQueryRequest
    let nextQuery: DocumentQuery<Doc> = { ...baseForPage }
    if (builderResource === undefined) {
      pageQuery = nextQuery
    } else {
      const buildQuery = await getResource(builderResource)
      nextQuery = mergeQueries(nextQuery, (await buildQuery()) ?? {})
    }
    if (currentOptions !== undefined && currentViewlet !== undefined) {
      nextQuery = await getResultQuery(hierarchy, nextQuery, currentViewlet.viewOptions?.other, currentOptions)
    }
    if (requestId !== latestQueryRequest) return
    pageQuery = nextQuery
    isQueryLoaded = true
  }

  function trackRawOptions (rawOptions: FindOptions<Doc> | undefined): void {
    if (deepEqual(rawOptions, trackedRawOptions)) return
    trackedRawOptions = rawOptions
    isOptionsResolved = false
  }

  async function refreshFindOptions (
    rawOptions: FindOptions<Doc> | undefined,
    optionsConfig: NonNullable<Viewlet['viewOptions']>['other'] | undefined,
    currentOptions: ViewOptions | undefined
  ): Promise<void> {
    const requestId = ++latestOptionsRequest
    const computedOptions = await getResultOptions(rawOptions, optionsConfig, currentOptions)
    if (requestId !== latestOptionsRequest) return
    resolvedOptions = computedOptions
    isOptionsResolved = true
  }

  function applyFilterQuery (event: CustomEvent<DocumentQuery<Doc>>): void {
    resultQuery = { ...pageQuery, ...event.detail }
  }

  function openCreateDialog (): void {
    if (createComponent !== undefined) showPopup(createComponent, { ...createComponentProps, space }, 'top')
  }
</script>

<Header
  adaptive={headerAdaptive}
  hideActions={hideHeaderActions}
  hideExtra={modes === undefined}
  freezeBefore
>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector
      bind:viewlet
      bind:preference
      bind:viewlets
      {defaultViewletDescriptor}
      ignoreFragment
      {viewletQuery}
      on:viewlets={() => (hasViewletList = true)}
    />
    <ViewletSettingButton bind:viewOptions bind:viewlet {defaultViewOptions} {defaultConfig} />
  </svelte:fragment>

  <Breadcrumb {icon} {iconProps} {label} size="large" isCurrent />

  <svelte:fragment slot="search">
    <SearchInput bind:value={searchText} collapsed />
    <FilterButton {_class} bind:visible={isFilterVisible} />
    <slot name="searchExtra" />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    {#each viewletActions as viewletAction (viewletAction._id)}
      <ComponentExtensions
        extension={viewletAction.extension}
        props={{ _class, query: resultQuery, config: viewletAction.config ?? {} }}
      />
    {/each}
    {#if hasCreatePair}
      <Button
        icon={IconAdd}
        label={shownCreateLabel}
        kind="primary"
        size="small"
        disabled={isCreationDisabled}
        event={createEvent}
        on:click={openCreateDialog}
      />
    {:else if createButton}
      <Component is={createButton} props={{ ...createComponentProps, space }} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="extra">
    {#if modes !== undefined}
      <ModeSelector kind="subtle" props={modes} />
    {/if}
  </svelte:fragment>
</Header>

{#if hasViewletList && viewlets.length === 0}
  <EmptyState title={viewUnavailableTitle} />
{:else if isResolving}
  <Loading />
{:else if viewOptions !== undefined && viewlet !== undefined && contentProps !== undefined && descriptorComponent !== undefined}
  <FilterBar {_class} {space} query={searchQuery} {viewOptions} on:change={applyFilterQuery} />
  {#if navigationModel?.navigationComponent}
    <ComponentNavigator
      query={resultQuery}
      {space}
      mainComponent={descriptorComponent}
      mainComponentProps={contentProps}
      {...navigationModel}
    />
  {:else}
    <Component is={descriptorComponent} props={contentProps} />
  {/if}
{/if}
