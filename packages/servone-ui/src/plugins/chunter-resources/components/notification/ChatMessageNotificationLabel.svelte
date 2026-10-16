<script lang="ts">
  import { DocNotifyContext } from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import { Label, tooltip } from '@hcengineering/ui'
  import { Class, Doc, Ref, Space } from '@hcengineering/core'
  import { getDocLinkTitle, getDocTitle, ObjectIcon } from '@hcengineering/view-resources'
  import { ChatMessage, ThreadMessage } from '@hcengineering/chunter'
  import contact from '@hcengineering/contact'
  import { getEmbeddedLabel } from '@hcengineering/platform'

  import chunter from '../../plugin'

  export let context: DocNotifyContext
  export let object: ChatMessage

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let conversation: Doc | undefined
  let conversationLinkName: string | undefined
  let conversationFullTitle: string | undefined
  let isFullTitleResolved = false
  let lookupToken = 0

  $: isThreadMode = hierarchy.isDerived(context.objectClass, chunter.class.ThreadMessage)
  $: threadMessage = object as ThreadMessage
  $: conversationClass = isThreadMode ? threadMessage.objectClass : object.attachedToClass
  $: conversationId = isThreadMode ? threadMessage.objectId : object.attachedTo
  $: conversationSpace = isThreadMode ? object.space : undefined

  $: void loadConversation(conversationClass, conversationId, conversationSpace)
  $: void loadTitles(conversation)

  async function loadConversation (
    targetClass: Ref<Class<Doc>>,
    targetId: Ref<Doc>,
    targetSpace: Ref<Space> | undefined
  ): Promise<void> {
    const token = ++lookupToken
    const query = targetSpace === undefined ? { _id: targetId } : { _id: targetId, space: targetSpace }
    const found = await client.findOne(targetClass, query)
    if (token === lookupToken) conversation = found
  }

  async function loadTitles (doc: Doc | undefined): Promise<void> {
    conversationLinkName = undefined
    conversationFullTitle = undefined
    isFullTitleResolved = false
    if (doc === undefined) return
    const linkName = await getDocLinkTitle(client, doc._id, doc._class, doc)
    const fullTitle = await getDocTitle(client, doc._id, doc._class, doc)
    if (doc !== conversation) return
    conversationLinkName = linkName
    conversationFullTitle = fullTitle
    isFullTitleResolved = true
  }

  $: isThreadLabel = isThreadMode || (object.replies ?? 0) > 0
  $: isAvatarIcon =
    conversation !== undefined &&
    (hierarchy.isDerived(conversation._class, contact.class.Person) ||
      hierarchy.isDerived(conversation._class, chunter.class.DirectMessage))
  $: titleTooltip =
    conversationFullTitle !== undefined && conversationFullTitle !== ''
      ? { label: getEmbeddedLabel(conversationFullTitle) }
      : undefined
</script>

<div class="flex-presenter flex-gap-1 text-sm font-semibold">
  <Label label={isThreadLabel ? chunter.string.Thread : chunter.string.Message} />
  {#if conversationLinkName !== undefined && conversation !== undefined}
    <span class="lower"><Label label={chunter.string.In} /></span>
    {#if isFullTitleResolved}
      <div class="flex-presenter flex-gap-0-5" use:tooltip={titleTooltip}>
        <ObjectIcon value={conversation} size={isAvatarIcon ? 'tiny' : 'small'} />
        <span class="overflow-label">{conversationLinkName}</span>
      </div>
    {/if}
  {/if}
</div>
