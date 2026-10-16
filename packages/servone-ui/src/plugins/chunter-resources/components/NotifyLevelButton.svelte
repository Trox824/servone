<!-- Channel / DM header bell: shows the notification level; a channel opens the level menu, a DM toggles mute. -->
<script lang="ts" context="module">
  import type { Client, Doc, TxOperations } from '@hcengineering/core'
  import notification, { type DocNotifyContext } from '@hcengineering/notification'
  import type { IntlString } from '@hcengineering/platform'
  import chunter from '@hcengineering/chunter'
  import { type Action, IconCheck } from '@hcengineering/ui'
  import { parseNotifyLevel, setNotifyLevel, NOTIFY_LEVELS, type NotifyLevel } from '../../../lib/notify/level'

  export const notifyString = {
    Title: 'chunter:string:ServoneNotifyTitle' as IntlString,
    MuteConversation: 'chunter:string:ServoneMuteConversation' as IntlString,
    UnmuteConversation: 'chunter:string:ServoneUnmuteConversation' as IntlString,
    MutedHint: 'chunter:string:ServoneNotifyMutedHint' as IntlString
  }

  const levelLabel: Record<NotifyLevel, IntlString> = {
    all: 'chunter:string:ServoneNotifyAll' as IntlString,
    mentions: 'chunter:string:ServoneNotifyMentions' as IntlString,
    nothing: 'chunter:string:ServoneNotifyNothing' as IntlString
  }

  export type LevelTarget = 'channel' | 'direct'

  export function levelTarget (client: Client, object: Doc): LevelTarget | undefined {
    const hierarchy = client.getHierarchy()
    if (hierarchy.isDerived(object._class, chunter.class.DirectMessage)) return 'direct'
    if (hierarchy.isDerived(object._class, chunter.class.Channel)) return 'channel'
    return undefined
  }

  export function levelActions (client: TxOperations, context: DocNotifyContext): Action[] {
    const current = parseNotifyLevel(context)
    return NOTIFY_LEVELS.map((level) => ({
      label: levelLabel[level],
      icon: level === current ? IconCheck : undefined,
      action: async () => {
        await setNotifyLevel(client, context, level)
      }
    }))
  }

  export function muteAction (client: TxOperations, context: DocNotifyContext): Action {
    const isMuted = parseNotifyLevel(context) === 'nothing'
    return {
      label: isMuted ? notifyString.UnmuteConversation : notifyString.MuteConversation,
      icon: isMuted ? notification.icon.Notifications : notification.icon.BellCrossed,
      action: async () => {
        await setNotifyLevel(client, context, isMuted ? 'all' : 'nothing')
      }
    }
  }
</script>

<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import { Button, Menu, showPopup } from '@hcengineering/ui'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { AtSign, Bell, BellOff } from '@lucide/svelte'

  export let object: Doc

  const client = getClient()
  const { contextByDoc } = InboxNotificationsClientImpl.getClient()

  $: context = $contextByDoc.get(object._id)
  $: target = levelTarget(client, object)
  $: level = parseNotifyLevel(context)

  async function handleClick (ev: MouseEvent): Promise<void> {
    if (context === undefined) return
    if (target === 'direct') {
      await muteAction(client, context).action(undefined, ev)
      return
    }
    showPopup(Menu, { actions: levelActions(client, context) }, ev.target as HTMLElement)
  }
</script>

{#if context !== undefined && target !== undefined}
  <Button
    kind={'icon'}
    dataId="notify-level"
    showTooltip={{
      label:
        target === 'direct'
          ? level === 'nothing'
            ? notifyString.UnmuteConversation
            : notifyString.MuteConversation
          : notifyString.Title
    }}
    selected={level !== 'all'}
    on:click={handleClick}
  >
    <svelte:fragment slot="icon">
      {#if level === 'nothing'}
        <BellOff class="size-4" aria-hidden="true" />
      {:else if level === 'mentions'}
        <AtSign class="size-4" aria-hidden="true" />
      {:else}
        <Bell class="size-4" aria-hidden="true" />
      {/if}
    </svelte:fragment>
  </Button>
{/if}
