<script lang="ts">
  import attachment from '@hcengineering/attachment'
  import chunter from '@hcengineering/chunter'
  import { Scroller, Switcher } from '@hcengineering/ui'
  import contact from '@hcengineering/contact'
  import contactPlg from '@hcengineering/contact-resources/src/plugin'
  import { EmployeeBrowser } from '@hcengineering/contact-resources'
  import { FilterBar, FilterButton } from '@hcengineering/view-resources'
  import type { Class, Doc, Ref } from '@hcengineering/core'

  import FileResults from '../../../search/FileResults.svelte'
  import MessageResults from '../../../search/MessageResults.svelte'
  import { userSearch } from '../../../index'
  import { SearchType } from '../../../utils'
  import plugin from '../../../plugin'
  import Header from '../../Header.svelte'

  const TAB_STORAGE_KEY = 'chunter-browser-st'
  const KNOWN_TABS = [SearchType.Messages, SearchType.Files, SearchType.Contacts]

  const tabSwitcherItems = [
    {
      id: SearchType.Messages,
      icon: chunter.icon.Messages,
      labelIntl: plugin.string.Messages,
      tooltip: plugin.string.Messages
    },
    {
      id: SearchType.Files,
      icon: attachment.icon.FileBrowser,
      labelIntl: attachment.string.Files,
      tooltip: attachment.string.Files
    },
    {
      id: SearchType.Contacts,
      icon: contact.icon.Contacts,
      labelIntl: contactPlg.string.Contacts,
      tooltip: contactPlg.string.Contacts
    }
  ]

  function readStoredTab (): SearchType {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY)
      if (stored !== null) {
        const parsedTab = parseInt(stored, 10)
        const matchingTab = KNOWN_TABS.find((tab) => tab === parsedTab)
        if (matchingTab !== undefined) return matchingTab
      }
    } catch {}
    return SearchType.Messages
  }

  function storeTab (tab: SearchType): void {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab.toString())
    } catch {}
  }

  function pickTab (event: CustomEvent<{ id: SearchType } | undefined>): void {
    const picked = event.detail?.id
    if (picked !== undefined) activeTab = picked
  }

  let activeTab: SearchType = readStoredTab()
  let headerSearchText = ''

  $: storeTab(activeTab)
  $: tabFilterClass = (activeTab === SearchType.Contacts ? contactPlg.mixin.Employee : undefined) as
    | Ref<Class<Doc>>
    | undefined
</script>

<Header
  icon={plugin.icon.ChunterBrowser}
  intlLabel={plugin.string.ChunterBrowser}
  titleKind={'breadcrumbs'}
  adaptive={'freezeActions'}
  bind:searchValue={headerSearchText}
>
  <svelte:fragment slot="search">
    {#if tabFilterClass !== undefined}
      <FilterButton _class={tabFilterClass} />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <Switcher
      name={'browser_group'}
      kind={'subtle'}
      selected={activeTab}
      items={tabSwitcherItems}
      on:select={pickTab}
    />
  </svelte:fragment>
</Header>
{#if tabFilterClass !== undefined}
  <FilterBar _class={tabFilterClass} space={undefined} query={{ $search: headerSearchText }} hideSaveButtons />
{/if}
{#if activeTab === SearchType.Contacts}
  <Scroller>
    <EmployeeBrowser withHeader={false} search={$userSearch} />
  </Scroller>
{:else if activeTab === SearchType.Files}
  <FileResults search={$userSearch} />
{:else}
  <MessageResults search={$userSearch} />
{/if}
