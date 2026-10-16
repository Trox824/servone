<script lang="ts">
  import type { DocumentQuery, Ref, Space } from '@hcengineering/core'
  import { translate, type IntlString } from '@hcengineering/platform'
  import type { IssueTemplate } from '@hcengineering/tracker'
  import { Button, IconAdd, showPopup, themeStore } from '@hcengineering/ui'
  import type { ViewOptions, Viewlet } from '@hcengineering/view'
  import { FilterBar, filterStore, SpaceHeader, ViewletSettingButton } from '@hcengineering/view-resources'
  import { writable } from 'svelte/store'
  import tracker from '../../plugin'
  import { provideEmptyState, type EmptyStateInfo } from '../../../../lib/empty-state'
  import CreateIssueTemplate from './CreateIssueTemplate.svelte'
  import IssueTemplatesContent from './IssueTemplatesContent.svelte'

  export let space: Ref<Space> | undefined = undefined
  export let query: DocumentQuery<IssueTemplate> = {}
  export let title: IntlString | undefined = undefined
  export let label: string = ''

  let searchText = ''
  let viewlet: Viewlet | undefined
  let viewOptions: ViewOptions | undefined

  function buildEffectiveFilter (callerFilter: DocumentQuery<IssueTemplate>, text: string): DocumentQuery<IssueTemplate> {
    const combined: DocumentQuery<IssueTemplate> = { ...callerFilter, servoneForm: { $exists: false } }
    if (text !== '') {
      combined.$search = text
    }
    return combined
  }

  $: effectiveFilter = buildEffectiveFilter(query, searchText)

  let listQuery: DocumentQuery<IssueTemplate> = buildEffectiveFilter(query, searchText)

  $: if (label === '' && title !== undefined) {
    void translate(title, {}, $themeStore.language).then((translated) => {
      label = translated
    })
  }

  const emptyStateStore = writable<EmptyStateInfo>({
    icon: tracker.icon.IssueTemplates,
    label: tracker.string.IssueTemplates,
    hasCreate: true,
    filtered: false
  })
  provideEmptyState(emptyStateStore)

  $: emptyStateStore.set({
    icon: tracker.icon.IssueTemplates,
    label: tracker.string.IssueTemplates,
    hasCreate: true,
    filtered: searchText !== '' || $filterStore.length > 0
  })

  function openCreateTemplate (): void {
    showPopup(CreateIssueTemplate, { targetElement: null, space }, 'top')
  }
</script>

<SpaceHeader
  _class={tracker.class.IssueTemplate}
  {space}
  {label}
  adaptive={'default'}
  showLabelSelector={$$slots.label_selector}
  bind:viewlet
  bind:search={searchText}
>
  <svelte:fragment slot="header-tools">
    <ViewletSettingButton bind:viewOptions bind:viewlet />
  </svelte:fragment>
  <svelte:fragment slot="label_selector">
    <slot name="label_selector" />
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <Button
      icon={IconAdd}
      label={tracker.string.NewProcess}
      kind={'primary'}
      size={'small'}
      on:click={openCreateTemplate}
    />
  </svelte:fragment>
</SpaceHeader>

<slot name="afterHeader" />

{#if viewOptions}
  <FilterBar
    _class={tracker.class.IssueTemplate}
    {space}
    {viewOptions}
    query={effectiveFilter}
    on:change={(event) => {
      listQuery = event.detail
    }}
  />
{/if}

{#if viewlet && viewOptions}
  <IssueTemplatesContent {viewOptions} {viewlet} {space} query={listQuery} />
{/if}
