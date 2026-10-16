<script lang="ts">
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import {
    Component,
    defineSeparators,
    deviceOptionsStore,
    getCurrentLocation,
    location,
    navigate,
    restoreLocation,
    Separator,
    type Location
  } from '@hcengineering/ui'
  import type { NavigatorModel, SpecialNavModel } from '@hcengineering/workbench'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { onDestroy, onMount } from 'svelte'
  import chunter, { chunterId } from '@hcengineering/chunter'
  import view, { decodeObjectURI } from '@hcengineering/view'
  import { getObjectLinkId, parseLinkId } from '@hcengineering/view-resources'
  import type { ActivityMessage } from '@hcengineering/activity'
  import { loadSavedAttachments } from '@hcengineering/attachment-resources'
  import type { IntlString } from '@hcengineering/platform'
  import ChatNavigator from './navigator/ChatNavigator.svelte'
  import ChannelView from '../ChannelView.svelte'
  import MobileThread from '../threads/MobileThread.svelte'
  import { chatSpecials } from './utils'
  import type { SelectChannelEvent } from './types'
  import { openChannel, openThreadInSidebar } from '../../navigation'
  import { backfillChannelOwners } from '../../permissions/backfillOwners'
  import { handleChatShortcut } from '../../slack-shortcuts/handle'
  import EmptyState from '../../../../components/EmptyState.svelte'

  const SEPARATOR_GROUP = 'chat'
  const SELECT_CHANNEL_TITLE = 'chunter:string:ServoneSelectChannel' as IntlString
  const SELECT_CHANNEL_HINT = 'chunter:string:ServoneSelectChannelHint' as IntlString

  const client = getClient()
  const linkProviders = client.getModel().findAllSync(view.mixin.LinkIdProvider, {})
  const navigatorModel: NavigatorModel = { spaces: [], specials: chatSpecials }
  const openDocumentQuery = createQuery()
  const contextByDoc = InboxNotificationsClientImpl.getClient().contextByDoc

  let selectedLinkId: string | undefined
  let selectedClass: Ref<Class<Doc>> | undefined
  let openSpecial: SpecialNavModel | undefined
  let openDocument: Doc | undefined
  let contentPane: HTMLElement | undefined
  let hasItemInUrl = false
  let hasTriedRestore = false

  defineSeparators(SEPARATOR_GROUP, [
    { minSize: 20, maxSize: 40, size: 30, float: 'navigator' },
    { size: 'auto', minSize: 20, maxSize: 'auto' },
    { size: 20, minSize: 20, maxSize: 50, float: 'aside' }
  ])

  function clearSelection (): void {
    openSpecial = undefined
    selectedLinkId = undefined
    selectedClass = undefined
    openDocument = undefined
  }

  function followLocation (currentLocation: Location): void {
    if (currentLocation.path[2] !== chunterId) return

    const itemSegment = currentLocation.path[3]
    if (itemSegment === undefined || itemSegment === '') {
      clearSelection()
      if (!hasItemInUrl && !hasTriedRestore) {
        hasTriedRestore = true
        restoreLocation(currentLocation, chunterId)
      }
      return
    }

    hasItemInUrl = true
    const matchedSpecial = chatSpecials.find((special) => special.id === itemSegment)
    if (matchedSpecial !== undefined) {
      clearSelection()
      openSpecial = matchedSpecial
    } else {
      const [linkId, linkedClass] = decodeObjectURI(itemSegment)
      openSpecial = undefined
      selectedLinkId = linkId
      selectedClass = linkedClass
    }

    const threadSegment = currentLocation.path[4]
    if (threadSegment !== undefined && threadSegment !== '') {
      void openThreadInSidebar(threadSegment as Ref<ActivityMessage>, undefined, undefined, undefined, undefined, false)
    }
  }

  async function loadOpenDocument (linkId: string | undefined, linkedClass: Ref<Class<Doc>> | undefined): Promise<void> {
    if (linkId === undefined || linkedClass === undefined || linkedClass === ('' as Ref<Class<Doc>>)) {
      openDocument = undefined
      openDocumentQuery.unsubscribe()
      return
    }
    const realId = await parseLinkId(linkProviders, linkId, linkedClass)
    if (linkId !== selectedLinkId) return
    if (realId === undefined) {
      openDocument = undefined
      openDocumentQuery.unsubscribe()
      return
    }
    openDocumentQuery.query(
      linkedClass,
      { _id: realId },
      (documents) => {
        openDocument = documents[0]
      },
      { limit: 1 }
    )
  }

  $: void loadOpenDocument(selectedLinkId, selectedClass)

  async function handleNavigatorSelect (event: CustomEvent<SelectChannelEvent | null>): Promise<void> {
    const selection = event.detail
    if (selection === null) {
      selectedLinkId = undefined
      selectedClass = undefined
      return
    }
    const chosen = selection.object
    const linkId = await getObjectLinkId(linkProviders, chosen._id, chosen._class, chosen)
    selectedLinkId = linkId
    selectedClass = chosen._class
    if (chosen._id !== openDocument?._id) openDocument = chosen
    openChannel(linkId, chosen._class, undefined, true)
  }

  function applySpecialAction (event: CustomEvent<NonNullable<Location['query']> | undefined>): void {
    if (!event.detail) return
    const targetLocation = getCurrentLocation()
    targetLocation.query = { ...targetLocation.query, ...event.detail }
    navigate(targetLocation)
  }

  $: specialProps = { model: navigatorModel, ...openSpecial?.componentProps }
  $: isNavigatorFloating = $deviceOptionsStore.navigator.float
  $: isPhonePortraitNarrow = $deviceOptionsStore.isMobile && $deviceOptionsStore.isPortrait && $deviceOptionsStore.minWidth

  const stopFollowingLocation = location.subscribe(followLocation)

  onMount(() => {
    loadSavedAttachments()
    void backfillChannelOwners(client)
    $deviceOptionsStore.replacedPanel = contentPane
  })

  onDestroy(() => {
    stopFollowingLocation()
    openDocumentQuery.unsubscribe()
    $deviceOptionsStore.replacedPanel = undefined
  })
</script>

<svelte:window on:keydown={(event) => handleChatShortcut(event, openDocument)} />

<div class="hulyPanels-container">
  {#if $deviceOptionsStore.navigator.visible}
    <div
      class="antiPanel-navigator border-left {$deviceOptionsStore.navigator.direction === 'horizontal'
        ? 'portrait'
        : 'landscape'}"
      class:fly={isNavigatorFloating}
    >
      <div class="antiPanel-wrap__content hulyNavPanel-container">
        <ChatNavigator object={openDocument} currentSpecial={openSpecial} on:select={handleNavigatorSelect} />
      </div>
      {#if !isPhonePortraitNarrow}
        <Separator name={SEPARATOR_GROUP} index={0} float={isNavigatorFloating ? 'navigator' : true} />
      {/if}
    </div>
    <Separator
      name={SEPARATOR_GROUP}
      index={0}
      float={isNavigatorFloating}
      color="transparent"
      separatorSize={0}
      short
    />
  {/if}

  <div class="hulyComponent" class:relative={$deviceOptionsStore.isMobile} bind:this={contentPane}>
    {#if $deviceOptionsStore.isMobile}
      <MobileThread scope={openDocument?._id} />
    {/if}
    {#if openSpecial !== undefined}
      <Component is={openSpecial.component} props={specialProps} on:action={applySpecialAction} />
    {:else if openDocument !== undefined}
      <ChannelView
        object={openDocument}
        context={$contextByDoc.get(openDocument._id)}
        autofocus={openDocument._class !== chunter.class.DirectMessage}
      />
    {:else if selectedLinkId === undefined}
      <div class="flex h-full w-full items-center justify-center">
        <EmptyState icon={chunter.icon.Chunter} title={SELECT_CHANNEL_TITLE} description={SELECT_CHANNEL_HINT} />
      </div>
    {/if}
  </div>
</div>
