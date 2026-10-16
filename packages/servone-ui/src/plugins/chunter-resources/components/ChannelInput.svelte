<script lang="ts">
  import { ActivityExtension as ActivityExtensionComponent } from '@hcengineering/activity-resources'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import activity, { type ActivityExtension, type ActivityMessage } from '@hcengineering/activity'
  import type { Channel } from '@hcengineering/chunter'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type AnySvelteComponent, deviceOptionsStore, Icon, Label } from '@hcengineering/ui'
  import { type Asset, getResource, type IntlString } from '@hcengineering/platform'
  import view from '@hcengineering/view'
  import { Analytics } from '@hcengineering/analytics'
  import { setContext } from 'svelte'
  import { teamTargetContext, type TeamTarget } from '$lib/team-mentions'
  import { getChannelName, getObjectIcon } from '../utils'
  import chunter from '../plugin'
  import { canPost, canReplyInThread } from '../announce/policy'
  import { announceSettings } from '../announce/schema'
  import { currentActor } from '../announce/setup'

  export let object: Doc
  export let readonly = false
  export let boundary: HTMLElement | undefined | null = undefined
  export let collection: string | undefined
  export let isThread = false
  export let autofocus = true
  export let onKeyDown: ((e: KeyboardEvent) => void) | undefined = undefined

  const teamTarget: TeamTarget = () => object
  setContext(teamTargetContext, teamTarget)

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const actor = currentActor()
  const channelQuery = createQuery()

  const ONLY_ADMINS_POST = 'chunter:string:ServoneOnlyAdminsPost' as IntlString
  const ONLY_ADMINS_REPLY = 'chunter:string:ServoneOnlyAdminsReply' as IntlString

  let channel: Channel | undefined
  let extensions: ActivityExtension[] = []
  let archivedIcon: Asset | AnySvelteComponent | undefined

  function findChannelId (doc: Doc): Ref<Channel> | undefined {
    if (hierarchy.isDerived(doc._class, chunter.class.Channel)) {
      return doc._id as Ref<Channel>
    }
    if (hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
      const parentMessage = doc as ActivityMessage
      if (hierarchy.isDerived(parentMessage.attachedToClass, chunter.class.Channel)) {
        return parentMessage.attachedTo as Ref<Channel>
      }
    }
    return undefined
  }

  function findExtensions (startClass: Ref<Class<Doc>>): ActivityExtension[] {
    try {
      const model = client.getModel()
      let currentClass: Ref<Class<Doc>> | undefined = startClass
      while (currentClass !== undefined) {
        const found = model.findAllSync(activity.class.ActivityExtension, { ofClass: currentClass })
        if (found.length > 0) return found
        currentClass = hierarchy.getClass(currentClass).extends
      }
    } catch (error) {
      Analytics.handleError(error as Error)
    }
    return []
  }

  async function resolveIcon (targetClass: Ref<Class<Doc>>): Promise<void> {
    const iconMixin = hierarchy.classHierarchyMixin(targetClass, view.mixin.ObjectIcon)
    archivedIcon =
      iconMixin?.component !== undefined ? await getResource(iconMixin.component) : getObjectIcon(targetClass)
  }

  function loadConversationName (id: Ref<Doc>, targetClass: Ref<Class<Doc>>): Promise<string | undefined> {
    return getChannelName(id, targetClass, object)
  }

  function forwardKeyDown (event: KeyboardEvent): void {
    if (event.altKey) return
    onKeyDown?.(event)
  }

  function watchChannel (channelId: Ref<Channel> | undefined): void {
    if (channelId === undefined) {
      channelQuery.unsubscribe()
      channel = undefined
      return
    }
    channelQuery.query(chunter.class.Channel, { _id: channelId }, (channels) => {
      channel = channels[0]
    }, { limit: 1 })
  }

  $: objectId = object._id
  $: objectClass = object._class
  $: watchChannel(findChannelId(object))
  $: extensions = findExtensions(objectClass)
  $: if (!isThread) void resolveIcon(objectClass)
  $: access = channel !== undefined ? { owners: channel.owners ?? [], settings: announceSettings(channel) } : undefined
  $: isBlocked =
    access !== undefined && (isThread ? !canReplyInThread(actor, access) : !canPost(actor, access))
  $: conversationName = readonly && !isThread ? loadConversationName(objectId, objectClass) : undefined
  $: classLabel = hierarchy.getClass(objectClass).label
  $: composerProps = {
    object,
    boundary,
    collection,
    autofocus: autofocus && !$deviceOptionsStore.isMobile,
    withTypingInfo: true,
    onKeyDown: forwardKeyDown
  }
</script>

{#if !readonly && !isBlocked}
  <div class="ref-input mx-4 mb-4 flex max-h-[18.75rem] shrink-0 flex-col">
    <ActivityExtensionComponent kind="input" {extensions} props={composerProps} />
  </div>
{:else if !readonly}
  <div class="mx-4 mb-4 flex items-center justify-center rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
    <Label label={isThread ? ONLY_ADMINS_REPLY : ONLY_ADMINS_POST} />
  </div>
{:else}
  <div class="mx-4 mb-4 flex items-center justify-center rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
    {#if isThread}
      <Label label={chunter.string.ViewingThreadFromArchivedChannel} />
    {:else}
      <Label label={chunter.string.ViewingArchivedChannel} />
      <span class="ml-1 inline-flex items-center gap-0.5 font-semibold">
        {#if archivedIcon !== undefined}
          <Icon icon={archivedIcon} size="x-small" />
        {/if}
        {#await conversationName then name}
          {#if name}
            {name}
          {:else}
            <Label label={classLabel} />
          {/if}
        {/await}
      </span>
    {/if}
  </div>
{/if}

<style>
  .ref-input > :global(span.overflow-label) {
    order: -1;
  }
</style>
