<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { createQuery, isAdminUser, isDisabled } from '@hcengineering/presentation'
  import setting, { type SettingsCategory } from '@hcengineering/setting'
  import {
    Component,
    NavItem,
    deviceOptionsStore,
    getCurrentResolvedLocation,
    navigate,
    resolvedLocationStore
  } from '@hcengineering/ui'
  import { clearSettingsStore } from '../store'
  import ChatWorkspaceSettings from '../../chunter-resources/settings/ChatWorkspaceSettings.svelte'
  import { cardViewOf, cardViewPath, legacyGraphRoute } from '../../card-resources/studio/graph/routes'
  import { typeDoc } from '../../card-resources/studio/huly'
  import { isLegacyConfigCategory } from '../legacy-config'

  export let kind: 'navigation' | 'content' | undefined
  export let categoryName: string

  const CHAT_PAGE_NAME = 'servone-chat'
  const NAVIGATOR_REVEAL_DELAY_MS = 500
  const CATEGORY_SEGMENT = 3
  const PAGE_SEGMENT = 4

  const codeDefinedPages = [
    { name: CHAT_PAGE_NAME, label: 'setting:string:ServoneChat' as IntlString, icon: 'chunter:icon:Chunter' as Asset }
  ]

  const currentAccount = getCurrentAccount()
  const isMaintainer = hasAccountRole(currentAccount, AccountRole.Maintainer)
  const pagesQuery = createQuery()

  let accessiblePages: SettingsCategory[] = []
  let selectedName: string | undefined

  pagesQuery.query(
    setting.class.WorkspaceSettingCategory,
    {},
    (categories) => {
      const isAdmin = isAdminUser()
      accessiblePages = categories.filter(
        (page) =>
          hasAccountRole(currentAccount, page.role) &&
          !isDisabled(page.feature ?? '') &&
          (isAdmin || page.adminOnly !== true)
      )
    },
    { sort: { order: 1 } }
  )

  $: listedPages = accessiblePages.filter((page) => !isLegacyConfigCategory(page.name))
  $: selectedPage = accessiblePages.find((page) => page.name === selectedName)

  const unsubscribeLocation = resolvedLocationStore.subscribe((location) => {
    const graphRoute = legacyGraphRoute(location.path)
    if (graphRoute !== undefined) {
      const cardView = cardViewOf(graphRoute, (typeKey) => typeDoc(typeKey)?._id)
      navigate(
        { ...location, path: cardViewPath(location.path, cardView), fragment: undefined, query: undefined },
        true
      )
      return
    }
    selectedName = location.path[PAGE_SEGMENT]
  })
  onDestroy(unsubscribeLocation)

  onMount(() => {
    const revealTimer = setTimeout(() => {
      if (kind === 'content' && selectedPage === undefined) {
        $deviceOptionsStore.navigator.visible = true
      }
    }, NAVIGATOR_REVEAL_DELAY_MS)
    return () => {
      clearTimeout(revealTimer)
    }
  })

  function pickPage (pageName: string): void {
    clearSettingsStore()
    const target = getCurrentResolvedLocation()
    target.path[CATEGORY_SEGMENT] = categoryName
    if (target.path[PAGE_SEGMENT] === pageName) {
      target.path.length = PAGE_SEGMENT
    } else {
      target.path[PAGE_SEGMENT] = pageName
      target.path.length = PAGE_SEGMENT + 1
    }
    navigate(target)
  }
</script>

{#if kind === 'navigation'}
  {#each listedPages as page (page.name)}
    <NavItem
      icon={page.icon}
      label={page.label}
      selected={page.name === selectedName}
      on:click={() => {
        pickPage(page.name)
      }}
    />
    {#if page.name === selectedName && page.extraComponents?.navigation}
      <Component is={page.extraComponents.navigation} props={{ kind: 'navigation', categoryName: page.name }} />
    {/if}
  {/each}
  {#if isMaintainer}
    {#each codeDefinedPages as codePage (codePage.name)}
      <NavItem
        icon={codePage.icon}
        label={codePage.label}
        selected={codePage.name === selectedName}
        on:click={() => {
          pickPage(codePage.name)
        }}
      />
    {/each}
  {/if}
{:else if selectedName === CHAT_PAGE_NAME && isMaintainer}
  <ChatWorkspaceSettings />
{:else if kind === 'content' && selectedPage === undefined}
  <div class="hulyComponent"></div>
{:else if selectedPage !== undefined}
  <Component is={selectedPage.component} props={{ kind: 'content', ...selectedPage.props }} on:change />
{/if}
