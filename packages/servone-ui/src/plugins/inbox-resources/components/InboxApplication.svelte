<script lang="ts">
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import {
    defineSeparators,
    Separator,
    deviceOptionsStore,
    resolvedLocationStore,
    restoreLocation,
    Component,
    closePanel,
    getCurrentLocation,
    navigate,
    type Location
  } from '@hcengineering/ui'
  import { getClient } from '@hcengineering/presentation'
  import { inboxId } from '@hcengineering/inbox'
  import view from '@hcengineering/view'
  import core, { type Class, type Doc, getCurrentAccount, type Ref } from '@hcengineering/core'
  import notification, {
    type CommonInboxNotification,
    type DocNotifyContext,
    type InboxNotification
  } from '@hcengineering/notification'
  import type { Notification } from '@hcengineering/communication-types'
  import chunter from '@hcengineering/chunter'
  import activity, { type ActivityMessage } from '@hcengineering/activity'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { getResource, translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Bell, ChevronLeft } from '@lucide/svelte'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import InboxNavigation from './InboxNavigation.svelte'
  import InboxHeader from './InboxHeader.svelte'
  import InboxNotice from './InboxNotice.svelte'
  import { isApprovalsTab } from './ApprovalsList.svelte'
  import { closeDoc, getDocInfoFromLocation, getMessageInfoFromLocation, navigateToDoc } from '../location'
  import { isNotice } from '../notice'
  import type { NavigationItem } from '../type'
  import EmptyPane from '../../../mail/components/EmptyPane.svelte'
  import MobileThread from '../../chunter-resources/components/threads/MobileThread.svelte'
  import { isMessageReminder, type ReminderEvent } from '../../../lib/remind/reminder-event'
  import { showListPage } from '../../../lib/phone-nav'

  const NAVIGATOR_MIN_SIZE = 15
  const NAVIGATOR_MAX_SIZE = 60
  const NAVIGATOR_DEFAULT_SIZE = 24
  const CONTENT_MIN_SIZE = 20
  const selectTitleId = 'notification:string:ServoneSelectNotification' as IntlString
  const keysHintId = 'notification:string:ServoneInboxKeysHint' as IntlString

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const { inboxNotificationsByContext, contextById, contextByDoc, activityInboxNotifications } = inboxClient

  defineSeparators('new-inbox', [
    { minSize: NAVIGATOR_MIN_SIZE, maxSize: NAVIGATOR_MAX_SIZE, size: NAVIGATOR_DEFAULT_SIZE, float: 'navigator' },
    { size: 'auto', minSize: CONTENT_MIN_SIZE, maxSize: 'auto' }
  ])

  let openDoc: Doc | undefined
  let legacyContext: DocNotifyContext | undefined
  let urlObjectId: Ref<Doc> | undefined
  let urlObjectClass: Ref<Class<Doc>> | undefined
  let resolvedMessage: ActivityMessage | undefined
  let isRestoreWanted = true
  let lastSelectedIdentity: string | undefined
  let openPane: HTMLElement | undefined
  let selectTitle = ''
  let keysHint = ''
  let backLabel = ''

  function isChatChannel (document: Doc, objectClass: Ref<Class<Doc>> | undefined): boolean {
    const testedClass = hierarchy.isDerived(document._class, activity.class.ActivityMessage)
      ? (objectClass ?? document._class)
      : document._class
    return hierarchy.isDerived(testedClass, chunter.class.ChunterSpace)
  }

  async function readInBatch (notifications: InboxNotification[]): Promise<void> {
    if (notifications.length === 0) return
    const batch = client.apply(undefined, 'readNotifications')
    try {
      await inboxClient.readNotifications(
        batch,
        notifications.map((entry) => entry._id)
      )
    } finally {
      await batch.commit()
    }
  }

  async function markOpenedRead (
    document: Doc,
    context: DocNotifyContext | undefined,
    objectClass: Ref<Class<Doc>> | undefined
  ): Promise<void> {
    const contextNotifications =
      context === undefined ? [] : (get(inboxNotificationsByContext).get(context._id) ?? [])
    const unreadNotifications = isChatChannel(document, objectClass)
      ? contextNotifications.filter((entry) => entry._class === notification.class.CommonInboxNotification)
      : contextNotifications.filter((entry) => !entry.isViewed)
    await readInBatch(unreadNotifications)
  }

  function findNotice (
    document: Doc | undefined,
    context: DocNotifyContext | undefined,
    objectClass: Ref<Class<Doc>> | undefined,
    notificationsByContext: Map<Ref<DocNotifyContext>, InboxNotification[]>
  ): CommonInboxNotification | undefined {
    if (document === undefined || context === undefined) return undefined
    if (!hierarchy.isDerived(document._class, core.class.Space) || isChatChannel(document, objectClass)) {
      return undefined
    }
    const contextNotifications = notificationsByContext.get(context._id) ?? []
    if (contextNotifications.length === 0 || !contextNotifications.every(isNotice)) return undefined
    return contextNotifications.reduce((latest, candidate) =>
      (candidate.createdOn ?? 0) > (latest.createdOn ?? 0) ? candidate : latest
    )
  }

  async function loadUrlDoc (
    urlDoc: { _id: Ref<Doc>, _class: Ref<Class<Doc>> },
    location: Location,
    threadId: string | undefined
  ): Promise<void> {
    const foundDoc = await client.findOne(urlDoc._class, { _id: urlDoc._id })
    if (urlObjectId !== urlDoc._id) return
    if (foundDoc === undefined) {
      openDoc = undefined
      return
    }
    const contextParam = location.query?.context
    const byContextParam =
      contextParam != null ? get(contextById).get(contextParam as Ref<DocNotifyContext>) : undefined
    const byThread = threadId !== undefined ? get(contextByDoc).get(threadId as Ref<Doc>) : undefined
    let chosenContext = byContextParam ?? byThread ?? get(contextByDoc).get(urlDoc._id)
    if (chosenContext === undefined) {
      chosenContext = await client.findOne(notification.class.DocNotifyContext, {
        objectId: foundDoc._id,
        user: getCurrentAccount().uuid
      })
      if (urlObjectId !== urlDoc._id) return
    }
    openDoc = foundDoc
    legacyContext = chosenContext
  }

  async function followLocation (location: Location): Promise<void> {
    if (location.path[2] !== inboxId) return
    const urlDoc = getDocInfoFromLocation(location)
    if (urlDoc === undefined) {
      openDoc = undefined
      urlObjectId = undefined
      urlObjectClass = undefined
      legacyContext = undefined
      if (isRestoreWanted) {
        isRestoreWanted = false
        restoreLocation(location, inboxId)
      }
      return
    }
    isRestoreWanted = false
    urlObjectId = urlDoc._id
    urlObjectClass = urlDoc._class
    const threadId: string | undefined = location.path[4]
    if (openDoc?._id !== urlDoc._id) await loadUrlDoc(urlDoc, location, threadId)

    const messageInfo = getMessageInfoFromLocation(location)
    if (threadId !== undefined) {
      const openThread = await getResource(chunter.function.OpenThreadInSidebar)
      void openThread(threadId as Ref<ActivityMessage>, undefined, undefined, messageInfo?.id, { autofocus: false }, false)
    }
    if (messageInfo?.id !== undefined && messageInfo.date === undefined) {
      const messageId = messageInfo.id
      const inboxEntry = get(activityInboxNotifications).find((entry) => entry.attachedTo === messageId)
      resolvedMessage =
        inboxEntry?.$lookup?.attachedTo ?? (await client.findOne(activity.class.ActivityMessage, { _id: messageId }))
    }
  }

  const unsubscribeLocation = resolvedLocationStore.subscribe((location) => {
    void followLocation(location)
  })

  onDestroy(() => {
    unsubscribeLocation()
    deviceOptionsStore.update((options) => ({ ...options, replacedPanel: undefined }))
  })

  function backToList (): void {
    handleClose()
    showListPage()
  }

  async function openRemindedMessage (navItem: NavigationItem, reminder: ReminderEvent): Promise<void> {
    const message = await client.findOne(activity.class.ActivityMessage, {
      _id: reminder.attachedTo as Ref<ActivityMessage>
    })
    if (navItem.type === 'legacy') await readInBatch(navItem.notifications)
    if (message === undefined) return
    navigate(await getObjectLinkFragment(hierarchy, message))
  }

  async function handleSelect (
    event: CustomEvent<{
      navItem: NavigationItem
      doc: Doc
      notification?: InboxNotification | Notification
    }>
  ): Promise<void> {
    const { navItem, doc: selectedDoc, notification: selectedNotification } = event.detail
    if (selectedDoc === undefined) return
    const identity =
      selectedNotification === undefined
        ? undefined
        : '_id' in selectedNotification
          ? selectedNotification._id
          : selectedNotification.id
    const isAlreadyOpen =
      getCurrentLocation().path[2] === inboxId &&
      openDoc?._id === navItem._id &&
      identity === lastSelectedIdentity &&
      (navItem.type === 'modern' || navItem.context._id === legacyContext?._id)
    if (isAlreadyOpen) return

    closePanel()
    lastSelectedIdentity = identity
    if (isMessageReminder(hierarchy, selectedDoc)) {
      await openRemindedMessage(navItem, selectedDoc)
      return
    }
    navigateToDoc(navItem, selectedDoc, selectedNotification)
  }

  function handleClose (): void {
    closePanel()
    openDoc = undefined
    legacyContext = undefined
    resolvedMessage = undefined
    closeDoc()
  }

  $: if (openDoc !== undefined) void markOpenedRead(openDoc, legacyContext, urlObjectClass)

  $: notice = findNotice(openDoc, legacyContext, urlObjectClass, $inboxNotificationsByContext)

  $: panelComponent =
    openDoc === undefined
      ? undefined
      : (hierarchy.classHierarchyMixin(openDoc._class, view.mixin.ObjectPanel)?.component ?? view.component.EditDoc)

  $: deviceOptionsStore.update((options) => ({ ...options, replacedPanel: openPane }))

  $: translateCB(selectTitleId, {}, $themeStore.language, (text) => {
    selectTitle = text
  })
  $: translateCB(keysHintId, {}, $themeStore.language, (text) => {
    keysHint = text
  })
  $: translateCB('workbench:string:ServoneBackToList' as IntlString, {}, $themeStore.language, (text) => {
    backLabel = text
  })
  $: emptyLines = $isApprovalsTab || $deviceOptionsStore.isMobile ? [] : [keysHint]

  $: navigatorFloats = $deviceOptionsStore.navigator.float
  $: isHorizontalNavigator = $deviceOptionsStore.navigator.direction === 'horizontal'
  $: isNarrowPhone = $deviceOptionsStore.isMobile && $deviceOptionsStore.isPortrait && $deviceOptionsStore.minWidth
</script>

<div class="hulyPanels-container inbox">
  {#if $deviceOptionsStore.navigator.visible}
    <div
      class="antiPanel-navigator border-left inbox__navigator navigator-column"
      class:portrait={isHorizontalNavigator}
      class:landscape={!isHorizontalNavigator}
      class:fly={navigatorFloats}
    >
      <div class="antiPanel-wrap__content hulyNavPanel-container">
        <InboxHeader />
        <div class="antiPanel-wrap__content hulyNavPanel-container">
          <InboxNavigation doc={openDoc} {legacyContext} on:select={handleSelect} />
        </div>
      </div>
      {#if !isNarrowPhone}
        <Separator name="new-inbox" float={navigatorFloats ? 'navigator' : true} index={0} />
      {/if}
    </div>
    <Separator
      name="new-inbox"
      float={navigatorFloats}
      index={0}
      color="transparent"
      separatorSize={0}
      short
    />
  {/if}
  <div class="hulyComponent inbox__panel open-pane" bind:this={openPane}>
    {#if $deviceOptionsStore.isMobile}
      {#if openDoc !== undefined}
        <div class="flex h-11 shrink-0 items-center border-b border-border px-2">
          <button
            type="button"
            class="servone-header-back flex size-9 shrink-0 items-center justify-center rounded-md text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={backLabel}
            on:click={backToList}
          >
            <ChevronLeft class="size-5" />
          </button>
        </div>
      {/if}
      <MobileThread scope={openDoc?._id} />
    {/if}
    {#if openDoc !== undefined && notice !== undefined}
      <InboxNotice doc={openDoc} {notice} />
    {:else if openDoc !== undefined && panelComponent !== undefined}
      <Component
        is={panelComponent}
        props={{
          _id: openDoc._id,
          _class: openDoc._class,
          context: legacyContext,
          autofocus: false,
          embedded: true,
          activityMessage: resolvedMessage,
          props: { autofocus: false, context: legacyContext, activityMessage: resolvedMessage }
        }}
        on:close={handleClose}
      />
    {:else}
      <EmptyPane icon={Bell} title={selectTitle} lines={emptyLines} />
    {/if}
  </div>
</div>

<style>
  .navigator-column,
  .open-pane {
    position: relative;
  }
</style>
