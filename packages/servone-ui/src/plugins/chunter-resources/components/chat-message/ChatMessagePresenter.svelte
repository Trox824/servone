<script lang="ts">
  import { onDestroy } from 'svelte'
  import activity, { type ActivityMessage, type ActivityMessageViewType, type DisplayActivityMessage } from '@hcengineering/activity'
  import {
    ActivityDocLink,
    ActivityMessageTemplate,
    editingMessageStore,
    type MessageInlineAction
  } from '@hcengineering/activity-resources'
  import type { Attachment } from '@hcengineering/attachment'
  import { AttachmentDocList, type AttachmentImageSize } from '@hcengineering/attachment-resources'
  import chunter, { type ChatMessage, type ChatMessageViewlet } from '@hcengineering/chunter'
  import contact, { getCurrentEmployee, type Person, type SocialIdentity } from '@hcengineering/contact'
  import { getPersonByPersonIdCb, getSocialIdByPersonIdCb } from '@hcengineering/contact-resources'
  import type { Class, Doc, Markup, Ref, WithLookup } from '@hcengineering/core'
  import { getClient, MessageViewer, pendingCreatedDocs } from '@hcengineering/presentation'
  import { EmptyMarkup } from '@hcengineering/text'
  import { extractReferences, markupToJSON } from '@hcengineering/text-core'
  import { Button, IconEdit, ShowMore, showPopup, themeStore, type Action } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getDocLinkTitle } from '@hcengineering/view-resources'
  import { shownTranslatedMessagesStore, translatedMessagesStore, translatingMessagesStore } from '../../stores'
  import ChatMessageHeader from './ChatMessageHeader.svelte'
  import ChatMessageInput from './ChatMessageInput.svelte'
  import { createIssueActions } from '../../create-issue/actions'
  import ForwardedHeader from '../../forward/ForwardedHeader.svelte'
  import ForwardIcon from '../../forward/ForwardIcon.svelte'
  import ForwardPopup from '../../forward/ForwardPopup.svelte'
  import { readForwardedFrom } from '../../forward/origin'
  import { forwardStrings } from '../../forward/strings'
  import { remindActions } from '../../remind/actions'
  import { pendingReminders } from '../../remind/pending'
  import WebhookBadge from '../../webhooks/WebhookBadge.svelte'
  import WebhookThreadLink from '../../webhooks/WebhookThreadLink.svelte'
  import { webhookColor } from '../../webhooks/api'

  export let value: WithLookup<ChatMessage> | undefined
  export let doc: Doc | undefined = undefined
  export let showNotify: boolean = false
  export let isHighlighted: boolean = false
  export let isSelected: boolean = false
  export let shouldScroll: boolean = false
  export let embedded: boolean = false
  export let withActions: boolean = true
  export let showEmbedded = false
  export let hideFooter = false
  export let skipLabel = false
  export let actions: Action[] = []
  export let hoverable = true
  export let inline = false
  export let hoverStyles: 'filledHover' = 'filledHover'
  export let withShowMore: boolean = true
  export let attachmentImageSize: AttachmentImageSize = 'x-large'
  export let videoPreload = false
  export let hideLink = false
  export let compact = false
  export let readonly = false
  export let type: ActivityMessageViewType = 'default'
  export let onClick: (() => void) | undefined = undefined
  export let onReply: ((message: ActivityMessage) => void) | undefined = undefined

  const STALE_AFTER_MS = 5000
  const COMPACT_SHOW_MORE_LIMIT = 80

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const currentEmployee = getCurrentEmployee()
  const reminderStore = pendingReminders()

  const messageViewlet: ChatMessageViewlet | undefined =
    value === undefined
      ? undefined
      : client
        .getModel()
        .findAllSync(chunter.class.ChatMessageViewlet, {
          objectClass: value.attachedToClass,
          messageClass: value._class
        })[0]

  let authorPerson: Person | undefined
  let authorSocialIdentity: SocialIdentity | undefined
  let fetchedParentMessage: DisplayActivityMessage | undefined
  let fetchedAttachedDoc: Doc | undefined
  let linkTitle: string | undefined
  let isStale = false
  let staleTimer: ReturnType<typeof setTimeout> | undefined
  let lastSeenMarkup: Markup | undefined
  let messageInput: ChatMessageInput | undefined

  $: messageId = value?._id
  $: messageMarkup = value?.message
  $: authorId = value?.createdBy
  $: providerId = value?.provider
  $: attachedToId = value?.attachedTo
  $: attachedToClassId = value?.attachedToClass
  $: messageSpace = value?.space

  function resolveAuthor (personId: ChatMessage['createdBy']): void {
    if (personId === undefined) {
      authorPerson = undefined
      authorSocialIdentity = undefined
      return
    }
    getPersonByPersonIdCb(personId, (foundPerson) => {
      authorPerson = foundPerson ?? undefined
    })
    getSocialIdByPersonIdCb(personId, (foundIdentity) => {
      authorSocialIdentity = foundIdentity ?? undefined
    })
  }

  $: resolveAuthor(authorId)

  $: visibleSocialIdentity =
    authorSocialIdentity !== undefined && authorSocialIdentity.type !== 'huly' ? authorSocialIdentity : undefined

  $: socialIcon =
    providerId === undefined
      ? undefined
      : client.getModel().findAllSync(contact.class.ChannelProvider, { _id: providerId })[0]?.icon

  async function loadParentMessage (
    parentClass: Ref<Class<Doc>> | undefined,
    parentId: Ref<Doc> | undefined,
    space: ChatMessage['space'] | undefined
  ): Promise<void> {
    if (parentClass === undefined || parentId === undefined || space === undefined) {
      fetchedParentMessage = undefined
      return
    }
    if (!hierarchy.isDerived(parentClass, activity.class.ActivityMessage)) {
      fetchedParentMessage = undefined
      return
    }
    const foundParent = await client.findOne(parentClass, { _id: parentId, space })
    if (parentId === attachedToId) fetchedParentMessage = foundParent as DisplayActivityMessage | undefined
  }

  $: void loadParentMessage(attachedToClassId, attachedToId, messageSpace)

  async function loadAttachedDoc (
    attachedClass: Ref<Class<Doc>> | undefined,
    attachedId: Ref<Doc> | undefined,
    providedDocId: Ref<Doc> | undefined
  ): Promise<void> {
    if (attachedClass === undefined || attachedId === undefined || providedDocId === attachedId) return
    const foundDoc = await client.findOne(attachedClass, { _id: attachedId })
    if (attachedId === attachedToId) fetchedAttachedDoc = foundDoc
  }

  $: void loadAttachedDoc(attachedToClassId, attachedToId, doc?._id)

  $: attachedToDoc =
    doc !== undefined && doc._id === attachedToId
      ? doc
      : fetchedAttachedDoc?._id === attachedToId
        ? fetchedAttachedDoc
        : undefined

  $: isOwnMessage = authorPerson !== undefined && authorPerson._id === currentEmployee
  $: messageAttachments = value?.$lookup?.attachments as Attachment[] | undefined

  $: isPending = messageId !== undefined && $pendingCreatedDocs[messageId] === true

  function trackStaleness (isMessagePending: boolean): void {
    if (!isMessagePending) {
      clearTimeout(staleTimer)
      staleTimer = undefined
      isStale = false
      return
    }
    if (staleTimer !== undefined || isStale) return
    staleTimer = setTimeout(() => {
      staleTimer = undefined
      isStale = true
    }, STALE_AFTER_MS)
  }

  $: trackStaleness(isPending)

  $: mentionsCurrentUser =
    !isOwnMessage &&
    messageMarkup !== undefined &&
    extractReferences(markupToJSON(messageMarkup)).some((reference) => reference.objectId === currentEmployee)

  $: forwardOrigin = value === undefined ? undefined : readForwardedFrom(value)
  $: webhookAccent = value === undefined ? undefined : webhookColor(value)

  $: isShownTranslated = messageId !== undefined && $shownTranslatedMessagesStore.has(messageId)
  $: isTranslating = messageId !== undefined && $translatingMessagesStore.has(messageId)
  $: shownMarkup =
    messageId !== undefined && isShownTranslated
      ? ($translatedMessagesStore.get(messageId) ?? messageMarkup ?? EmptyMarkup)
      : (messageMarkup ?? EmptyMarkup)

  function discardStaleTranslation (id: Ref<ChatMessage> | undefined, markup: Markup | undefined): void {
    const isEditedText = lastSeenMarkup !== undefined && markup !== lastSeenMarkup
    lastSeenMarkup = markup
    if (!isEditedText || id === undefined) return
    translatedMessagesStore.update((translations) => {
      translations.delete(id)
      return translations
    })
    shownTranslatedMessagesStore.update((shownIds) => {
      shownIds.delete(id)
      return shownIds
    })
  }

  $: discardStaleTranslation(messageId, messageMarkup)

  function buildInlineActions (
    id: Ref<ChatMessage> | undefined,
    isMessageTranslating: boolean,
    isTranslationShown: boolean
  ): MessageInlineAction[] {
    if (isMessageTranslating) return [{ label: chunter.string.Translating }]
    if (!isTranslationShown || id === undefined) return []
    return [
      {
        label: chunter.string.ShowOriginal,
        onClick: async () => {
          shownTranslatedMessagesStore.update((shownIds) => {
            shownIds.delete(id)
            return shownIds
          })
        }
      }
    ]
  }

  $: inlineActions = buildInlineActions(messageId, isTranslating, isShownTranslated)
  $: excludedActions = isShownTranslated
    ? [chunter.action.TranslateMessage]
    : [chunter.action.ShowOriginalMessage]

  function buildMenuActions (
    message: ChatMessage | undefined,
    isOwn: boolean,
    reminderMap: Map<Ref<Doc>, Parameters<typeof remindActions>[1]>,
    language: string | undefined,
    isReadonly: boolean,
    callerActions: Action[]
  ): Action[] {
    if (message === undefined) return callerActions
    const editAction: Action[] = isOwn
      ? [
          {
            label: activity.string.Edit,
            icon: IconEdit,
            group: 'edit',
            action: async () => {
              editingMessageStore.set(message._id)
            }
          }
        ]
      : []
    const forwardAction: Action = {
      label: forwardStrings.Forward,
      icon: ForwardIcon,
      group: 'copy',
      action: async () => {
        showPopup(ForwardPopup, { message }, 'center')
      }
    }
    return [
      ...editAction,
      forwardAction,
      ...createIssueActions(message, hierarchy, isReadonly),
      ...remindActions(message, reminderMap.get(message._id), Date.now(), language),
      ...callerActions
    ]
  }

  $: menuActions = buildMenuActions(value, isOwnMessage, $reminderStore, $themeStore.language, readonly, actions)

  $: isEditing = messageId !== undefined && $editingMessageStore === messageId

  async function loadLinkTitle (linkedDoc: Doc): Promise<void> {
    linkTitle = await getDocLinkTitle(client, linkedDoc._id, linkedDoc._class, linkedDoc)
  }

  $: if (inline && attachedToDoc !== undefined) void loadLinkTitle(attachedToDoc)

  $: panelComponent =
    attachedToDoc === undefined
      ? undefined
      : (hierarchy.classHierarchyMixin(attachedToDoc._class, view.mixin.ObjectPanel)?.component ??
        view.component.EditDoc)

  function stopEditing (): void {
    editingMessageStore.set(undefined)
  }

  onDestroy(() => {
    clearTimeout(staleTimer)
  })
</script>

{#snippet messageBody(message)}
  <div
    class="clear-mins"
    class:servone-mention-me={mentionsCurrentUser}
    class:chat-webhook-bar={webhookAccent !== undefined}
    style:--chat-webhook-color={webhookAccent}
    data-delivered={isPending ? undefined : 'true'}
  >
    {#if forwardOrigin !== undefined}
      <ForwardedHeader origin={forwardOrigin} />
    {/if}
    <MessageViewer message={shownMarkup} />
    {#if (message.attachments ?? 0) > 0}
      <div class="h-2"></div>
    {/if}
    <AttachmentDocList
      value={message}
      attachments={messageAttachments}
      imageSize={attachmentImageSize}
      {videoPreload}
      isOwn={isOwnMessage}
    />
  </div>
{/snippet}

{#if inline}
  {#if attachedToDoc !== undefined && linkTitle !== undefined}
    <ActivityDocLink object={attachedToDoc} title={linkTitle} {panelComponent} />
  {/if}
{:else if value !== undefined}
  <ActivityMessageTemplate
    message={value}
    viewlet={messageViewlet}
    parentMessage={fetchedParentMessage}
    person={authorPerson}
    socialId={visibleSocialIdentity}
    {showNotify}
    {isHighlighted}
    {isSelected}
    {shouldScroll}
    {embedded}
    {showEmbedded}
    {hideFooter}
    {hoverable}
    {hoverStyles}
    {skipLabel}
    {readonly}
    {type}
    {onClick}
    {onReply}
    withActions={isEditing ? false : withActions}
    actions={menuActions}
    pending={isPending}
    stale={isStale}
    {excludedActions}
    {socialIcon}
    showDatePreposition={hideLink}
    {inlineActions}
  >
    <svelte:fragment slot="header">
      <ChatMessageHeader label={messageViewlet?.label} />
      <WebhookBadge message={value} />
      <WebhookThreadLink message={value} />
    </svelte:fragment>
    <svelte:fragment slot="content">
      {#if isEditing}
        {#if attachedToDoc !== undefined}
          <ChatMessageInput
            bind:this={messageInput}
            chatMessage={value}
            object={attachedToDoc}
            shouldSaveDraft={false}
            focusIndex={1000}
            autofocus
            on:submit={stopEditing}
          />
          <div class="mt-2 flex items-center justify-end gap-2">
            <Button label={view.string.Cancel} on:click={stopEditing} />
            <Button label={activity.string.Update} accent on:click={() => messageInput?.submit()} />
          </div>
        {/if}
      {:else if withShowMore}
        <ShowMore limit={compact ? COMPACT_SHOW_MORE_LIMIT : undefined}>
          {@render messageBody(value)}
        </ShowMore>
      {:else}
        {@render messageBody(value)}
      {/if}
    </svelte:fragment>
  </ActivityMessageTemplate>
{/if}

<style>
  .chat-webhook-bar {
    padding-left: 8px;
    border-left: 3px solid var(--chat-webhook-color);
  }
</style>
