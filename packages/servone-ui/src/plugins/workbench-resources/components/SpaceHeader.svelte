<script lang="ts">
  import core, {
    type Class,
    type Doc,
    type DocumentQuery,
    type Ref,
    type Space,
    type WithLookup
  } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import {
    type AnyComponent,
    Breadcrumbs,
    Button,
    Header,
    IconAdd,
    LinkWrapper,
    SearchInput,
    showPopup
  } from '@hcengineering/ui'
  import view, { type ViewOptions, type Viewlet } from '@hcengineering/view'
  import { classIcon, DocNavLink, FilterButton, ViewletSelector, ViewletSettingButton } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import plugin from '../plugin'

  export let spaceId: Ref<Space> | undefined
  export let createItemDialog: AnyComponent | undefined
  export let createItemLabel: IntlString = presentation.string.Create
  export let search: string
  export let viewletQuery: DocumentQuery<Viewlet>
  export let viewlet: Viewlet | undefined = undefined
  export let viewlets: Array<WithLookup<Viewlet>> = []
  export let _class: Ref<Class<Doc>> | undefined = undefined
  export let viewOptions: ViewOptions | undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const spaceQuery = createQuery()
  const initialSpaceId = spaceId

  const createLabelOverrides: Record<string, IntlString> = {
    'lead:string:LeadCreateLabel': 'lead:string:CreateLead' as IntlString,
    'recruit:string:ApplicationCreateLabel': 'recruit:string:CreateApplication' as IntlString
  }

  let space: Space | undefined

  $: spaceQuery.query(core.class.Space, { _id: spaceId }, (foundSpaces) => (space = foundSpaces[0]), { limit: 1 })

  $: if (spaceId !== initialSpaceId) {
    search = ''
    dispatch('search', '')
  }

  $: spaceClassId = space?._class
  $: editorComponent = spaceClassId === undefined ? undefined : findEditorComponent(spaceClassId)
  $: spaceIcon = spaceClassId === undefined ? undefined : classIcon(client, spaceClassId)
  $: description = space?.description ?? ''
  $: shownCreateLabel = createLabelOverrides[createItemLabel] ?? createItemLabel

  function findEditorComponent (startClassId: Ref<Class<Doc>>): AnyComponent {
    let currentClassId: Ref<Class<Doc>> | undefined = startClassId
    while (currentClassId !== undefined) {
      const classDoc = hierarchy.getClass(currentClassId)
      const editorMixin = hierarchy.as(classDoc, view.mixin.ObjectEditor)
      if (editorMixin.editor === undefined && classDoc.extends !== undefined) {
        currentClassId = classDoc.extends
      } else {
        return editorMixin.editor ?? plugin.component.SpacePanel
      }
    }
    return plugin.component.SpacePanel
  }

  function openCreateDialog (): void {
    if (createItemDialog !== undefined) showPopup(createItemDialog, { space: spaceId }, 'top')
  }
</script>

{#if space === undefined}
  <div class="hulyHeader-container"></div>
{:else}
  <Header hideActions={createItemDialog === undefined}>
    <svelte:fragment slot="beforeTitle">
      <ViewletSelector {viewletQuery} ignoreFragment bind:viewlet bind:viewlets />
      <ViewletSettingButton bind:viewOptions bind:viewlet />
    </svelte:fragment>

    <DocNavLink object={space} component={editorComponent} noUnderline>
      <Breadcrumbs items={[{ icon: spaceIcon, title: space.name }]} size="large" hideAfter={description === ''}>
        <svelte:fragment slot="afterLabel">
          <LinkWrapper text={description} />
        </svelte:fragment>
      </Breadcrumbs>
    </DocNavLink>

    <svelte:fragment slot="search">
      <SearchInput bind:value={search} collapsed on:change={() => dispatch('search', search)} />
      <FilterButton {_class} space={spaceId} />
    </svelte:fragment>

    <svelte:fragment slot="actions">
      {#if createItemDialog !== undefined}
        <Button icon={IconAdd} label={shownCreateLabel} kind="primary" size="small" on:click={openCreateDialog} />
      {/if}
    </svelte:fragment>
  </Header>
{/if}
