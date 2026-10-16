<script lang="ts">
  import type { Class, Doc, DocumentQuery, Ref } from '@hcengineering/core'
  import { type Asset, type IntlString, translateCB } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import type { TagCategory, TagElement, TagReference } from '@hcengineering/tags'
  import {
    type AnySvelteComponent,
    Breadcrumb,
    Button,
    Header,
    IconAdd,
    SearchInput,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import { TableBrowser } from '@hcengineering/view-resources'
  import { writable } from 'svelte/store'
  import tags from '../plugin'
  import CategoryBar from './CategoryBar.svelte'
  import CreateTagElement from './CreateTagElement.svelte'
  import type { TagElementInfo } from '../utils'
  import { provideEmptyState, type EmptyStateInfo } from '../../../lib/empty-state'

  export let title: IntlString = tags.string.Tags
  export let icon: Asset | AnySvelteComponent = tags.icon.Tags
  export let item: IntlString = tags.string.Tag
  export let createItemLabel: IntlString = tags.string.TagCreateLabel
  export let targetClass: Ref<Class<Doc>>
  export let onTag: ((tag: TagElement) => void) | undefined = undefined

  const GENERIC_LABEL_IDS: string[] = ['tracker:string:AddLabel', 'board:string:Labels']
  const NEW_LABEL_ID = 'tags:string:ServoneNewLabel' as IntlString

  let searchText = ''
  let selectedCategory: Ref<TagCategory> | undefined = undefined
  let visibleCategories: TagCategory[] = []
  let itemKeyTitle = ''
  let tableQuery: DocumentQuery<TagElement> = { targetClass }
  let usageByTag: Map<Ref<TagElement>, TagElementInfo> | undefined = undefined

  const emptyStateStore = writable<EmptyStateInfo>({
    icon,
    label: title,
    hasCreate: true,
    filtered: false
  })
  provideEmptyState(emptyStateStore)

  $: translateCB(item, {}, $themeStore.language, (text: string) => {
    itemKeyTitle = text.toLowerCase()
  })

  $: createLabel = GENERIC_LABEL_IDS.includes(createItemLabel) ? NEW_LABEL_ID : createItemLabel

  function rebuildQuery (): void {
    const base: DocumentQuery<TagElement> = searchText === '' ? { targetClass } : { $search: searchText, targetClass }
    if (selectedCategory !== undefined) {
      base.category = selectedCategory
    }
    tableQuery = base
  }

  const referenceQuery = createQuery()
  referenceQuery.query(
    tags.class.TagReference,
    {},
    (references) => {
      const usage = new Map<Ref<TagElement>, TagElementInfo>()
      for (const reference of references as TagReference[]) {
        const previous = usage.get(reference.tag)
        usage.set(reference.tag, {
          count: (previous?.count ?? 0) + 1,
          modifiedOn: Math.max(previous?.modifiedOn ?? 0, reference.modifiedOn)
        })
      }
      usageByTag = usage
    },
    { projection: { _id: 1, tag: 1, modifiedOn: 1 } }
  )

  function usageOf (element: Doc): number {
    return usageByTag?.get(element._id as Ref<TagElement>)?.count ?? 0
  }

  $: tableConfig = [
    {
      key: '',
      label: item,
      presenter: tags.component.TagElementPresenter,
      props: { edit: true, keyTitle: itemKeyTitle },
      sortingKey: 'title'
    },
    visibleCategories.length > 1
      ? {
          key: '$lookup.category',
          presenter: tags.component.CategoryPresenter,
          sortingKey: 'category',
          label: tags.string.CategoryLabel
        }
      : undefined,
    {
      key: '',
      presenter: tags.component.TagElementCountPresenter,
      label: item,
      props: { tagElements: usageByTag, label: item, icon, onTag },
      sortingKey: '@tagCount',
      sortingFunction: (a: Doc, b: Doc) => usageOf(b) - usageOf(a)
    },
    'description',
    'modifiedOn'
  ].filter((column) => column !== undefined)

  $: emptyStateStore.set({
    icon,
    label: title,
    hasCreate: true,
    filtered: searchText !== '' || selectedCategory !== undefined
  })
</script>

<Header adaptive={'disabled'}>
  <Breadcrumb {icon} label={title} size={'large'} isCurrent />

  <svelte:fragment slot="search">
    <SearchInput bind:value={searchText} collapsed on:change={rebuildQuery} />
  </svelte:fragment>

  <svelte:fragment slot="actions">
    <slot />
    <Button
      icon={IconAdd}
      label={createLabel}
      kind={'primary'}
      size={'small'}
      on:click={() => {
        showPopup(CreateTagElement, { targetClass, keyTitle: itemKeyTitle }, 'top')
      }}
    />
  </svelte:fragment>
</Header>

<CategoryBar
  {targetClass}
  category={selectedCategory}
  tagElements={usageByTag}
  on:change={(event) => {
    selectedCategory = event.detail.category ?? undefined
    rebuildQuery()
  }}
  on:categories={(event) => {
    visibleCategories = event.detail
  }}
/>

<TableBrowser
  _class={tags.class.TagElement}
  options={{ lookup: { category: tags.class.TagCategory } }}
  query={tableQuery}
  showNotification
  config={tableConfig}
/>
