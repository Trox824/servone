<script lang="ts">
  import type { Channel, ChunterSpace } from '@hcengineering/chunter'
  import { getCurrentAccount } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Button, EditBox } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import chunter from '../plugin'
  import EditChannelDescriptionAttachments from './EditChannelDescriptionAttachments.svelte'
  import { canEditChannel } from '../announce/policy'
  import { currentActor } from '../announce/setup'

  export let channel: ChunterSpace

  const dispatch = createEventDispatcher()
  const client = getClient()
  const actor = currentActor()

  $: regularChannel = channel?._class === chunter.class.Channel ? (channel as Channel) : undefined
  $: isLocked = regularChannel !== undefined && !canEditChannel(regularChannel, actor)

  function readInputText (event: Event): string {
    return (event.target as HTMLInputElement).value
  }

  function saveTopic (event: Event): void {
    if (regularChannel === undefined) return
    void client.update(regularChannel, { topic: readInputText(event) })
  }

  function saveDescription (event: Event): void {
    void client.update(channel, { description: readInputText(event) })
  }

  async function leaveChannel (): Promise<void> {
    await client.update(channel, { $pull: { members: getCurrentAccount().uuid } })
    dispatch('close')
  }
</script>

{#if channel}
  <div class="flex-col flex-gap-3">
    {#if regularChannel !== undefined}
      <EditBox
        label={chunter.string.Topic}
        placeholder={chunter.string.Topic}
        bind:value={regularChannel.topic}
        autoFocus={!isLocked}
        disabled={isLocked}
        on:change={saveTopic}
      />
      <EditBox
        label={chunter.string.ChannelDescription}
        placeholder={chunter.string.ChannelDescription}
        bind:value={regularChannel.description}
        disabled={isLocked}
        on:change={saveDescription}
      />
      <Button label={chunter.string.LeaveChannel} justify="left" size="x-large" on:click={leaveChannel} />
    {/if}
    <EditChannelDescriptionAttachments {channel} />
  </div>
{/if}
