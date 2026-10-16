<script lang="ts">
  import { translate, translateCB, type Asset, type IntlString } from '@hcengineering/platform'
  import {
    type Action,
    type AnySvelteComponent,
    Breadcrumbs,
    Button,
    deviceOptionsStore,
    Icon,
    Label,
    SearchInput,
    Header as KitHeader,
    type HeaderAdaptive,
    Menu,
    showPopup
  } from '@hcengineering/ui'
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'
  import view from '@hcengineering/view'
  import { openDoc } from '@hcengineering/view-resources'
  import { getClient } from '@hcengineering/presentation'
  import type { Doc, Ref } from '@hcengineering/core'
  import type { ActivityMessagesFilter } from '@hcengineering/activity'
  import workbench from '@hcengineering/workbench'
  import { PresenceAvatars } from '@hcengineering/presence-resources'
  import { Ellipsis, ExternalLink, Files, PanelRight, Phone, Search, SlidersHorizontal } from '@lucide/svelte'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { getSpace } from '@hcengineering/activity-resources'
  import { jsonToMarkup, MarkupNodeType } from '@hcengineering/text-core'
  import { userSearch } from '../index'
  import chunter from '../plugin'
  import { navigateToSpecial, openChannelInSidebar } from '../navigation'
  import ChannelMessagesFilter from './ChannelMessagesFilter.svelte'
  import NotifyLevelButton, { levelActions, levelTarget, muteAction } from './NotifyLevelButton.svelte'
  import { Button as ShadButton } from '../../../lib/components/ui/button'
  import { contextRoomId, peopleInCall } from '../../love-resources/calls/context'
  import { joinContext } from '../../love-resources/calls/join'
  import { infos, myInfo } from '../../love-resources/calls/live'
  import { callStr } from '../calls/strings'
  import ChannelFilesPopup from '../files/ChannelFilesPopup.svelte'
  import { filesStrings } from '../files/strings'
  import { searchPanelFor } from '../search/scope'
  import { searchStrings } from '../search/strings'

  export let object: Doc | undefined = undefined
  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  export let label: string | undefined = undefined
  export let intlLabel: IntlString | undefined = undefined
  export let description: string | undefined = undefined
  export let allowClose = false
  export let allowFullsize = false
  export let canOpen = false
  export let withAside = false
  export let isAsideShown = false
  export let titleKind: 'default' | 'breadcrumbs' = 'default'
  export let withFilters = false
  export let withSearch = true
  export let withPresence = true
  export let filters: Ref<ActivityMessagesFilter>[] = []
  export let adaptive: HeaderAdaptive = 'default'
  export let hideActions = false
  export let canOpenInSidebar = false
  export let closeOnEscape = true
  export let realWidth: number | undefined = undefined
  export let searchValue = ''

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const { contextByDoc } = InboxNotificationsClientImpl.getClient()

  let openInSidebarTitle = ''
  let settingsTitle = ''
  let filesTitle = ''
  let inConversationTitle = ''
  let kitAdaptive: HeaderAdaptive = 'disabled'

  $: searchValue = $userSearch
  $: language = $themeStore.language
  $: translateCB(workbench.string.OpenInSidebar, {}, language, (text) => {
    openInSidebarTitle = text
  })
  $: translateCB(chunter.string.Settings, {}, language, (text) => {
    settingsTitle = text
  })
  $: translateCB(filesStrings.Files, {}, language, (text) => {
    filesTitle = text
  })
  $: translateCB(searchStrings.InConversation, {}, language, (text) => {
    inConversationTitle = text
  })

  $: isChatSpace = object !== undefined && hierarchy.isDerived(object._class, chunter.class.ChunterSpace)
  $: isSearchOpen = object !== undefined && $searchPanelFor === object._id
  $: callTarget = object !== undefined ? levelTarget(client, object) : undefined
  $: isMobile = $deviceOptionsStore.isMobile
  $: notifyContext = object !== undefined ? $contextByDoc.get(object._id) : undefined
  $: isInThisCall = object !== undefined && $myInfo?.room === contextRoomId(object._id)

  $: hasAnyAction =
    (canOpen && object !== undefined) ||
    withAside ||
    $$slots.actions ||
    canOpenInSidebar ||
    callTarget !== undefined
  $: shouldHideActions = hideActions || !hasAnyAction
  $: shouldHideSearch = !withSearch && !$$slots.search && !$$slots.default
  $: if (adaptive !== 'default') {
    kitAdaptive = adaptive
  } else {
    kitAdaptive = withFilters ? 'freezeActions' : 'disabled'
  }
  $: breadcrumbItems = [{ icon, iconProps, title: label, label: label === undefined ? intlLabel : undefined }]

  function toggleSearch (): void {
    if (object === undefined) return
    searchPanelFor.set(isSearchOpen ? undefined : object._id)
  }

  function handleSearchChange (event: CustomEvent<string>): void {
    userSearch.set(event.detail)
    if (event.detail !== '') navigateToSpecial('chunterBrowser')
  }

  async function startCall (): Promise<void> {
    if (object === undefined || label === undefined) return
    const isFirstInCall = peopleInCall($infos, contextRoomId(object._id)).length === 0
    await joinContext(object._id, callTarget === 'channel' ? '#' + label : label)
    if (!isFirstInCall) return
    const text = await translate(callStr.StartedCall, {}, language)
    await client.addCollection(chunter.class.ChatMessage, getSpace(object), object._id, object._class, 'messages', {
      message: jsonToMarkup({
        type: MarkupNodeType.doc,
        content: [{ type: MarkupNodeType.paragraph, content: [{ type: MarkupNodeType.text, text }] }]
      }),
      attachments: 0
    })
  }

  function openFiles (event: MouseEvent): void {
    if (object === undefined) return
    showPopup(ChannelFilesPopup, { channel: object }, event.currentTarget as HTMLElement)
  }

  function openMoreMenu (event: MouseEvent): void {
    if (object === undefined) return
    const channel = object
    const anchor = event.currentTarget as HTMLElement
    const filesAction: Action = {
      label: filesStrings.Files,
      action: async () => {
        showPopup(ChannelFilesPopup, { channel }, anchor)
      }
    }
    const notifyActions =
      notifyContext === undefined
        ? []
        : callTarget === 'direct'
          ? [muteAction(client, notifyContext)]
          : levelActions(client, notifyContext)
    showPopup(Menu, { actions: [...notifyActions, filesAction] }, anchor)
  }

  function openInSidebar (): void {
    if (object === undefined) return
    void openChannelInSidebar(object._id, object._class, object, undefined, true)
  }

  function openObject (): void {
    if (object === undefined) return
    void openDoc(hierarchy, object)
  }
</script>

<KitHeader
  {allowFullsize}
  type={allowClose ? 'type-aside' : 'type-component'}
  singleRow
  hideBefore={false}
  hideActions={shouldHideActions}
  hideSearch={shouldHideSearch}
  adaptive={kitAdaptive}
  {closeOnEscape}
  bind:realWidth
  on:click
  on:close
>
  <div class="flex min-w-0 items-center gap-2">
    {#if titleKind === 'breadcrumbs'}
      <Breadcrumbs items={breadcrumbItems} currentOnly />
    {:else}
      <div class="flex min-w-0 items-center gap-2 px-1">
        {#if icon}
          <span class="inline-flex shrink-0 items-center justify-center text-muted-foreground">
            <Icon {icon} size="small" {iconProps} />
          </span>
        {/if}
        <span class="truncate text-[15px] font-semibold text-foreground">
          {#if label}
            {label}
          {:else if intlLabel}
            <Label label={intlLabel} />
          {/if}
        </span>
      </div>
    {/if}
    {#if description && !isMobile}
      <span class="h-4 w-px shrink-0 bg-border" aria-hidden="true"></span>
      <span class="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground" title={description}>
        {description}
      </span>
    {/if}
  </div>

  <svelte:fragment slot="presence">
    {#if withPresence && object}
      <PresenceAvatars {object} size="x-small" limit={4} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="search" let:doubleRow>
    <slot />
    {#if withSearch && isChatSpace}
      <ShadButton
        variant="ghost"
        size="icon-sm"
        class={isSearchOpen ? 'bg-accent' : undefined}
        data-id="channel-search"
        aria-pressed={isSearchOpen}
        title={inConversationTitle}
        onclick={toggleSearch}
      >
        <Search aria-hidden="true" />
        <span class="sr-only"><Label label={searchStrings.InConversation} /></span>
      </ShadButton>
    {:else if withSearch}
      <SearchInput collapsed bind:value={searchValue} on:change={handleSearchChange} />
    {/if}
    {#if withSearch}
      {#if withFilters}
        <ChannelMessagesFilter bind:selectedFilters={filters} />
      {/if}
      <slot name="search" {doubleRow} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="actions" let:doubleRow>
    {#if object && !isMobile}
      <NotifyLevelButton {object} />
    {/if}
    {#if callTarget !== undefined}
      <ShadButton
        variant={isMobile ? 'ghost' : 'outline'}
        size={isMobile ? 'icon-sm' : 'sm'}
        disabled={isInThisCall || label === undefined}
        onclick={() => { void startCall() }}
      >
        <Phone aria-hidden="true" />
        <span class:sr-only={isMobile}>
          <Label label={isInThisCall ? callStr.InCall : callStr.Call} />
        </span>
      </ShadButton>
      {#if object && isMobile}
        <ShadButton variant="ghost" size="icon-sm" data-id="channel-more" onclick={openMoreMenu}>
          <Ellipsis aria-hidden="true" />
          <span class="sr-only"><Label label={view.string.MoreActions} /></span>
        </ShadButton>
      {:else if object}
        <ShadButton
          variant="ghost"
          size="icon-sm"
          data-id="channel-files"
          title={filesTitle}
          onclick={openFiles}
        >
          <Files aria-hidden="true" />
          <span class="sr-only"><Label label={filesStrings.Files} /></span>
        </ShadButton>
      {/if}
    {/if}
    <slot name="actions" {doubleRow} />
    {#if canOpenInSidebar}
      <ShadButton
        variant="ghost"
        size="icon-sm"
        data-id="open-in-sidebar"
        title={openInSidebarTitle}
        onclick={openInSidebar}
      >
        <PanelRight aria-hidden="true" />
        <span class="sr-only"><Label label={workbench.string.OpenInSidebar} /></span>
      </ShadButton>
    {/if}
    {#if canOpen && object}
      <Button kind="icon" showTooltip={{ label: view.string.Open }} on:click={openObject}>
        <svelte:fragment slot="icon"><ExternalLink class="size-4" aria-hidden="true" /></svelte:fragment>
      </Button>
    {/if}
    {#if withAside}
      <ShadButton
        variant="ghost"
        size="icon-sm"
        class={isAsideShown ? 'bg-accent' : undefined}
        data-id="aside-toggle"
        aria-pressed={isAsideShown}
        title={settingsTitle}
        onclick={() => dispatch('aside-toggled')}
      >
        <SlidersHorizontal aria-hidden="true" />
        <span class="sr-only"><Label label={chunter.string.Settings} /></span>
      </ShadButton>
    {/if}
  </svelte:fragment>
</KitHeader>
