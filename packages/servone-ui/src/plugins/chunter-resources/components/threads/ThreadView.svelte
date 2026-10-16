<script lang="ts">
  import type { Doc, Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Breadcrumbs, location as locationStore, Header, type BreadcrumbItem } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import activity, { type ActivityMessage } from '@hcengineering/activity'
  import { getMessageFromLoc, messageInFocus } from '@hcengineering/activity-resources'
  import contact from '@hcengineering/contact'
  import attachment from '@hcengineering/attachment'

  import chunter from '../../plugin'
  import { getObjectIcon, getChannelName } from '../../utils'
  import { threadMessagesStore } from '../../stores'
  import ThreadContent from './ThreadContent.svelte'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'

  export let _id: Ref<ActivityMessage>
  export let selectedMessageId: Ref<ActivityMessage> | undefined = undefined
  export let showHeader = true
  export let syncLocation = true
  export let autofocus = true
  export let readonly = false
  export let onReply: ((message: ActivityMessage) => void) | undefined = undefined

  const dispatch = createEventDispatcher()
  const hierarchy = getClient().getHierarchy()
  const parentMessageQuery = createQuery()
  const conversationQuery = createQuery()

  const CHANNEL_CRUMB_INDEX_ID = 'channel'
  const THREAD_CRUMB_POSITION = 1

  let parentMessage: ActivityMessage | undefined =
    $threadMessagesStore?._id === _id ? $threadMessagesStore : undefined
  let isLoading = true
  let conversation: Doc | undefined
  let conversationName: string | undefined

  const releaseFocusWatch = messageInFocus.subscribe((focusedId) => {
    if (!syncLocation) return
    if (focusedId !== undefined && focusedId !== selectedMessageId) {
      selectedMessageId = focusedId
    }
    messageInFocus.set(undefined)
  })

  const releaseLocationWatch = locationStore.subscribe((currentLocation) => {
    if (!syncLocation) return
    const locationMessageId = getMessageFromLoc(currentLocation)
    selectedMessageId = locationMessageId
    messageInFocus.set(locationMessageId)
  })

  onDestroy(() => {
    releaseFocusWatch()
    releaseLocationWatch()
  })

  $: parentMessageQuery.query(
    activity.class.ActivityMessage,
    { _id },
    (found) => {
      parentMessage = found[0] as ActivityMessage | undefined
      isLoading = false
      if (parentMessage === undefined) {
        dispatch('close')
      }
    },
    { lookup: { _id: { attachments: attachment.class.Attachment } } }
  )

  $: if (parentMessage !== undefined && parentMessage._id !== _id) {
    parentMessage = $threadMessagesStore?._id === _id ? $threadMessagesStore : undefined
    isLoading = parentMessage === undefined
  }

  $: conversationClass = parentMessage?.attachedToClass
  $: conversationId = parentMessage?.attachedTo
  $: if (conversationClass !== undefined && conversationId !== undefined) {
    conversationQuery.query(conversationClass, { _id: conversationId }, (found) => {
      conversation = found[0]
    })
  }
  $: void loadConversationName(parentMessage, conversation)

  $: hasAvatarIcon =
    conversation !== undefined &&
    (conversation._class === chunter.class.DirectMessage ||
      hierarchy.isDerived(conversation._class, contact.class.Person))
  $: breadcrumbItems = buildBreadcrumbs(showHeader, conversation, conversationName, hasAvatarIcon)

  async function loadConversationName (
    message: ActivityMessage | undefined,
    knownConversation: Doc | undefined
  ): Promise<void> {
    conversationName =
      message === undefined
        ? undefined
        : await getChannelName(message.attachedTo, message.attachedToClass, knownConversation)
  }

  function buildBreadcrumbs (
    isHeaderShown: boolean,
    knownConversation: Doc | undefined,
    displayName: string | undefined,
    isAvatarStyle: boolean
  ): BreadcrumbItem[] {
    if (!isHeaderShown || knownConversation === undefined) return []
    const channelCrumb: BreadcrumbItem = {
      id: CHANNEL_CRUMB_INDEX_ID,
      icon: getObjectIcon(knownConversation._class),
      iconProps: { value: knownConversation },
      iconWidth: isAvatarStyle ? 'auto' : undefined,
      withoutIconBackground: isAvatarStyle,
      title: displayName,
      label: displayName ? undefined : chunter.string.Channel
    }
    return [channelCrumb, { id: 'thread', label: chunter.string.Thread }]
  }

  function onCrumbSelect (event: CustomEvent<number>): void {
    if (breadcrumbItems[event.detail]?.id === CHANNEL_CRUMB_INDEX_ID) {
      dispatch('channel')
    }
  }
</script>

{#if showHeader}
  <Header type={'type-aside'} adaptive={'disabled'} closeOnEscape={false} on:close>
    <Breadcrumbs items={breadcrumbItems} selected={THREAD_CRUMB_POSITION} on:select={onCrumbSelect} />
  </Header>
{/if}
{#if parentMessage !== undefined}
  {#key _id}
    <ThreadContent bind:selectedMessageId message={parentMessage} {autofocus} {readonly} {onReply} />
  {/key}
{:else if isLoading}
  <div class="grid gap-3 p-4" aria-busy="true">
    <Skeleton class="h-12 w-full" />
    <Skeleton class="h-4 w-1/3" />
    <Skeleton class="h-10 w-full" />
  </div>
{/if}
