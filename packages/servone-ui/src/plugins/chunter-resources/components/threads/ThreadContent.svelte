<script lang="ts">
  import activity, { type ActivityMessage } from '@hcengineering/activity'
  import { Label } from '@hcengineering/ui'
  import core, { type Doc, type Ref, type Space } from '@hcengineering/core'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import notification, { type DocNotifyContext } from '@hcengineering/notification'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { IntlString } from '@hcengineering/platform'
  import { get } from 'svelte/store'

  import ThreadParentMessage from './ThreadParentPresenter.svelte'
  import ReverseChannelScrollView from '../ReverseChannelScrollView.svelte'
  import { ChannelDataProvider } from '../../channelDataProvider'
  import chunter from '../../plugin'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'

  export let selectedMessageId: Ref<ActivityMessage> | undefined = undefined
  export let message: ActivityMessage
  export let autofocus = true
  export let readonly = false
  export let onReply: ((message: ActivityMessage) => void) | undefined = undefined

  const NO_REPLIES_HINT = 'chunter:string:ServoneNoReplies' as IntlString

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const conversationQuery = createQuery()

  let conversation: Doc | undefined
  let provider: ChannelDataProvider | undefined
  let isCreatingProvider = false

  $: parentClass = message.attachedToClass
  $: parentId = message.attachedTo
  $: conversationQuery.query(
    parentClass,
    { _id: parentId },
    (found) => {
      conversation = found[0]
    },
    { limit: 1 }
  )

  $: if (provider === undefined && !isCreatingProvider) {
    void createProvider(message)
  }

  $: repliesStore = provider?.messagesStore
  $: loadingStore = provider?.isLoadingStore
  $: repliesList = $repliesStore
  $: isProviderLoading = $loadingStore ?? false

  $: isInSpace = hierarchy.isDerived(message.attachedToClass, core.class.Space)
  $: isConversationArchived = (conversation as Space | undefined)?.archived ?? false
  $: isParentReadonly = isInSpace ? readonly || isConversationArchived : readonly
  $: replyCount = message.replies ?? repliesList?.length ?? 0
  $: dividerReplyCount = message.replies ?? repliesList?.length ?? 1
  $: showEmptyHint = replyCount === 0 && provider !== undefined && !isProviderLoading

  async function createProvider (parentMessage: ActivityMessage): Promise<void> {
    isCreatingProvider = true
    const knownContext: DocNotifyContext | undefined = get(inboxClient.contextByDoc).get(parentMessage._id)
    const notifyContext =
      knownContext ?? (await client.findOne(notification.class.DocNotifyContext, { objectId: parentMessage._id }))
    provider = new ChannelDataProvider(
      notifyContext,
      parentMessage.space,
      parentMessage._id,
      chunter.class.ThreadMessage,
      selectedMessageId,
      true
    )
  }
</script>

<div
  class="hulyComponent-content hulyComponent-content__container"
  style:flex="1 1 0"
  style:height="auto"
>
  {#if provider !== undefined && conversation !== undefined}
    <ReverseChannelScrollView
      bind:selectedMessageId
      object={message}
      channel={conversation}
      {provider}
      {autofocus}
      {onReply}
    >
      <svelte:fragment slot="header">
        <div class="mt-3">
          <ThreadParentMessage {message} readonly={isParentReadonly} {onReply} />
        </div>
        {#if showEmptyHint}
          <p class="m-0 px-4 py-3 text-sm text-muted-foreground">
            <Label label={NO_REPLIES_HINT} />
          </p>
        {:else if replyCount > 0}
          <div class="my-2 flex items-center">
            <span class="lower mx-2 whitespace-nowrap" style:color="var(--theme-halfcontent-color)">
              <Label label={activity.string.RepliesCount} params={{ replies: dividerReplyCount }} />
            </span>
            <div class="h-px w-full" style:background-color="var(--theme-refinput-border)"></div>
          </div>
        {/if}
      </svelte:fragment>
    </ReverseChannelScrollView>
  {:else}
    <div class="grid gap-3 p-4" aria-busy="true">
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-4 w-1/3" />
    </div>
  {/if}
</div>
