<script lang="ts">
  import type { Event } from '@hcengineering/calendar'
  import type { Class, DocumentQuery, Ref, Space, WithLookup } from '@hcengineering/core'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { type AnyComponent, Breadcrumb, Button, Component, Header, IconAdd, Loading, showPopup } from '@hcengineering/ui'
  import type { Viewlet, ViewletPreference } from '@hcengineering/view'
  import { ViewletSelector, getViewOptions, viewOptionStore } from '@hcengineering/view-resources'
  import { writable } from 'svelte/store'
  import { provideEmptyState, type EmptyStateInfo } from '../../../lib/empty-state'
  import calendar from '../plugin'

  export let _class: Ref<Class<Event>> = calendar.class.Event
  export let space: Ref<Space> | undefined = undefined
  export let query: DocumentQuery<Event> = {}
  export let viewIcon: Asset = calendar.icon.Calendar
  export let viewLabel: IntlString = calendar.string.Events
  export let createComponent: AnyComponent | undefined = calendar.component.CreateEvent
  export let createLabel: IntlString | undefined = calendar.string.CreateEvent

  const search = ''
  let viewlet: WithLookup<Viewlet> | undefined
  let loading = true
  let preference: ViewletPreference | undefined
  let viewlets: Array<WithLookup<Viewlet>> = []

  const emptyState = writable<EmptyStateInfo>({ label: viewLabel, hasCreate: true, filtered: false })
  provideEmptyState(emptyState)

  $: emptyState.set({
    icon: viewIcon,
    label: viewLabel,
    hasCreate: createComponent !== undefined,
    filtered: search !== ''
  })

  $: resolvedQuery = { ...query } as DocumentQuery<Event>
  $: viewOptions = viewlet !== undefined ? getViewOptions(viewlet, $viewOptionStore) : undefined
  $: descriptorComponent = viewlet?.$lookup?.descriptor?.component

  function openCreate (): void {
    if (createComponent === undefined) return
    showPopup(createComponent, {}, 'top')
  }
</script>

<Header adaptive={'disabled'}>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector
      viewletQuery={{ attachTo: _class }}
      bind:viewlet
      bind:loading
      bind:preference
      bind:viewlets
    />
  </svelte:fragment>
  <Breadcrumb icon={viewIcon} label={viewLabel} size={'large'} isCurrent />
  <svelte:fragment slot="actions">
    <Button icon={IconAdd} label={createLabel} kind={'primary'} size={'small'} on:click={openCreate} />
  </svelte:fragment>
</Header>

<div class="body-column">
  {#if descriptorComponent !== undefined}
    {#if loading}
      <Loading />
    {:else if viewlet !== undefined && viewOptions !== undefined}
      <Component
        is={descriptorComponent}
        props={{
          _class,
          space,
          options: viewlet.options,
          config: preference?.config ?? viewlet.config,
          viewOptions,
          viewlet,
          query: resolvedQuery,
          search,
          createComponent
        }}
      />
    {/if}
  {/if}
</div>

<style>
  .body-column {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
