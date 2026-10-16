<script lang="ts">
  import core, { type Class, type Doc, type Ref, type Space, type WithLookup } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient, reduceCalls } from '@hcengineering/presentation'
  import {
    type AnyComponent,
    Component,
    getCurrentLocation,
    locationStorageKeyId,
    navigate,
    resolvedLocationStore
  } from '@hcengineering/ui'
  import view, { type ViewOptions, type Viewlet } from '@hcengineering/view'
  import {
    activeViewlet,
    getViewOptions,
    makeViewletKey,
    updateActiveViewlet,
    viewOptionStore
  } from '@hcengineering/view-resources'
  import workbench, { type ViewConfiguration } from '@hcengineering/workbench'
  import { onDestroy } from 'svelte'
  import PendingComponent from '../../../components/PendingComponent.svelte'
  import { buildNavModel } from '../utils'
  import SpaceContent from './SpaceContent.svelte'
  import SpaceHeader from './SpaceHeader.svelte'

  export let currentSpace: Ref<Space> | undefined
  export let currentView: ViewConfiguration | undefined
  export let createItemDialog: AnyComponent | undefined = undefined
  export let createItemLabel: IntlString | undefined = undefined

  interface StoredLocation {
    path?: Array<string | null | undefined>
  }

  const WORKBENCH_SEGMENT = 'workbench'
  const client = getClient()
  const hierarchy = client.getHierarchy()

  let viewletKey = makeViewletKey()
  const stopWatchingLocation = resolvedLocationStore.subscribe((resolvedLocation) => {
    viewletKey = makeViewletKey(resolvedLocation)
  })
  onDestroy(stopWatchingLocation)

  let loadedSpace: Space | undefined
  let customHeader: AnyComponent | undefined
  let listedClass: Ref<Class<Doc>> | undefined
  let viewlets: Array<WithLookup<Viewlet>> = []
  let viewlet: Viewlet | undefined
  let viewOptions: ViewOptions | undefined
  let searchText = ''
  let isOpeningDefaultSpecial = false

  $: activeViewletId = $activeViewlet[viewletKey]
  $: viewClassId = currentView?.class
  $: void loadPage(activeViewletId, currentSpace, viewClassId)

  $: isNothingSelected = currentSpace === undefined && currentView === undefined
  $: if (isNothingSelected) {
    void openDefaultSpecial()
  } else {
    isOpeningDefaultSpecial = false
  }

  function findCustomHeader (startClassId: Ref<Class<Doc>>): AnyComponent | undefined {
    let currentClassId: Ref<Class<Doc>> | undefined = startClassId
    while (currentClassId !== undefined) {
      const classDoc = hierarchy.getClass(currentClassId)
      const headerMixin = hierarchy.as(classDoc, view.mixin.SpaceHeader)
      if (headerMixin.header === undefined && classDoc.extends !== undefined) {
        currentClassId = classDoc.extends
      } else {
        return headerMixin.header
      }
    }
    return undefined
  }

  const loadPage = reduceCalls(
    async (
      activeId: Ref<Viewlet> | null | undefined,
      spaceId: Ref<Space> | undefined,
      viewClass: Ref<Class<Doc>> | undefined
    ): Promise<void> => {
      if (spaceId === undefined) {
        loadedSpace = undefined
        return
      }
      const foundSpace = await client.findOne(core.class.Space, { _id: spaceId })
      const foundHeader = foundSpace === undefined ? undefined : findCustomHeader(foundSpace._class)

      if (viewClass !== undefined) {
        const foundViewlets = await client.findAll(
          view.class.Viewlet,
          { attachTo: viewClass, variant: { $exists: false } },
          { lookup: { descriptor: view.class.ViewletDescriptor } }
        )
        viewlets = foundViewlets
        if (foundHeader !== undefined) {
          viewlet = updateActiveViewlet(foundViewlets, activeId)
          viewOptions = getViewOptions(viewlet, $viewOptionStore)
        }
        listedClass = viewClass
      }
      loadedSpace = foundSpace
      customHeader = foundHeader
    }
  )

  function hasRestorableLocation (appAlias: string): boolean {
    const rawEntry = localStorage.getItem(`${locationStorageKeyId}_${appAlias}`)
    if (rawEntry === null) return false
    try {
      const storedLocation: StoredLocation | null = JSON.parse(rawEntry)
      return storedLocation?.path?.[3] != null
    } catch (err) {
      if (err instanceof SyntaxError) return false
      throw err
    }
  }

  async function openDefaultSpecial (): Promise<void> {
    const startLocation = getCurrentLocation()
    const appAlias = startLocation.path[2]
    if (
      startLocation.path[0] !== WORKBENCH_SEGMENT ||
      appAlias === undefined ||
      startLocation.path[3] !== undefined ||
      hasRestorableLocation(appAlias)
    ) {
      isOpeningDefaultSpecial = false
      return
    }

    isOpeningDefaultSpecial = true
    const application = await client.findOne(workbench.class.Application, { alias: appAlias })
    const navModel = await buildNavModel(client, application)
    const specials = navModel?.specials ?? []
    const targetSpecial = specials.find((special) => special.position === 'top') ?? specials[0]

    const latestLocation = getCurrentLocation()
    if (
      targetSpecial === undefined ||
      latestLocation.path[2] !== appAlias ||
      latestLocation.path[3] !== undefined
    ) {
      isOpeningDefaultSpecial = false
      return
    }
    navigate({ ...latestLocation, path: [...latestLocation.path.slice(0, 3), targetSpecial.id] })
  }
</script>

{#if isOpeningDefaultSpecial && currentSpace === undefined}
  <PendingComponent />
{:else if listedClass !== undefined && loadedSpace !== undefined}
  {#if customHeader !== undefined}
    <Component
      is={customHeader}
      props={{ spaceId: loadedSpace._id, viewlets, viewlet, createItemDialog, createItemLabel }}
      on:change={(event) => (viewlet = event.detail)}
    />
  {:else}
    <SpaceHeader
      viewletQuery={{ attachTo: currentView?.class, variant: { $exists: false } }}
      spaceId={loadedSpace._id}
      _class={listedClass}
      {createItemDialog}
      {createItemLabel}
      bind:viewOptions
      bind:search={searchText}
      bind:viewlet
    />
  {/if}
  {#if viewOptions !== undefined}
    <SpaceContent
      space={loadedSpace._id}
      _class={listedClass}
      {createItemDialog}
      {viewOptions}
      {createItemLabel}
      {viewlet}
      bind:search={searchText}
    />
  {/if}
{/if}
