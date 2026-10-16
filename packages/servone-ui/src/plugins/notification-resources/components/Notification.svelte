<script lang="ts">
  import { onMount } from 'svelte'
  import { Avatar, getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import type { Person } from '@hcengineering/contact'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import type { BrowserNotification } from '@hcengineering/notification'
  import { Button, navigate, type Notification as PlatformNotification, NotificationToast } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import chunter, { type ThreadMessage } from '@hcengineering/chunter'
  import { getResource } from '@hcengineering/platform'
  import activity, { type ActivityMessage } from '@hcengineering/activity'
  import { getClient, playSound } from '@hcengineering/presentation'
  import { Info } from '@lucide/svelte'
  import { pushAllowed, pushAvailable, subscribePush } from '../utils'
  import plugin from '../plugin'

  export let notification: PlatformNotification
  export let onRemove: () => void

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let sender: Person | undefined

  $: incoming = notification.params?.value as BrowserNotification

  $: loadSender(incoming.senderId)

  function loadSender (senderId: BrowserNotification['senderId']): void {
    if (senderId === undefined) {
      sender = undefined
      return
    }
    getPersonByPersonIdCb(senderId, (person) => {
      sender = person ?? undefined
    })
  }

  onMount(() => {
    if (incoming.soundAlert) void playSound(plugin.sound.InboxNotification)
  })

  async function openMessage (): Promise<void> {
    const location = incoming.onClickLocation
    if (location === undefined) return
    let targetId: Ref<Doc> | undefined = incoming.objectId
    let targetClass: Ref<Class<Doc>> | undefined = incoming.objectClass
    let threadId: string | undefined = location.path[4]
    const selectedMessageId = incoming.messageId

    if (targetId && targetClass && hierarchy.isDerived(targetClass, activity.class.ActivityMessage)) {
      const message = await client.findOne<ActivityMessage>(targetClass, { _id: targetId as Ref<ActivityMessage> })
      if (hierarchy.isDerived(targetClass, chunter.class.ThreadMessage)) {
        const reply = message as ThreadMessage | undefined
        targetId = reply?.objectId
        targetClass = reply?.objectClass
        threadId = reply?.attachedTo
      } else {
        targetId = message?.attachedTo
        targetClass = message?.attachedToClass
        threadId = message !== undefined && (message.replies ?? 0) > 0 ? message._id : undefined
      }
    }

    onRemove()

    if (!targetId || !targetClass || selectedMessageId === undefined) {
      navigate(location)
      return
    }
    const openInSidebar = await getResource(chunter.function.OpenChannelInSidebar)
    await openInSidebar(targetId, targetClass, undefined, threadId, true, selectedMessageId)
  }
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="icon">
    {#if sender !== undefined}
      <Avatar person={sender} name={sender.name} size="x-small" />
    {:else}
      <Info size={16} strokeWidth={1.75} aria-hidden="true" />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="content">
    <span class="overflow-label">{incoming.body}</span>
  </svelte:fragment>
  <svelte:fragment slot="buttons">
    {#if incoming.onClickLocation !== undefined}
      <Button label={view.string.Open} on:click={() => void openMessage()} />
    {/if}
    {#if pushAvailable() && !$pushAllowed}
      <Button label={plugin.string.EnablePush} kind={'ghost'} on:click={() => void subscribePush()} />
    {/if}
  </svelte:fragment>
</NotificationToast>
