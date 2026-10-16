<script lang="ts">
  import core, { type DocumentQuery } from '@hcengineering/core'
  import type { Category } from '@hcengineering/inventory'
  import { Breadcrumb, Button, Header, IconAdd, Scroller, SearchInput, showPopup } from '@hcengineering/ui'
  import inventory from '../plugin'
  import CreateCategory from './CreateCategory.svelte'
  import HierarchyView from './HierarchyView.svelte'

  let search = ''
  let query: DocumentQuery<Category> = {}

  function rebuildQuery (): void {
    query = search === '' ? {} : { $search: search }
  }
</script>

<Header adaptive={'disabled'}>
  <Breadcrumb
    icon={inventory.icon.Categories}
    label={inventory.string.Categories}
    size={'large'}
    isCurrent
  />
  <svelte:fragment slot="search">
    <SearchInput bind:value={search} collapsed on:change={rebuildQuery} />
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <Button
      icon={IconAdd}
      label={inventory.string.CategoryCreateLabel}
      kind={'primary'}
      size={'small'}
      on:click={() => showPopup(CreateCategory, { space: core.space.Workspace }, 'top')}
    />
  </svelte:fragment>
</Header>
<Scroller>
  <HierarchyView _class={inventory.class.Category} config={['', 'modifiedOn']} options={{}} {query} />
</Scroller>
