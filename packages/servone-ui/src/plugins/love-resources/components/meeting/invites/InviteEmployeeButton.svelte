<script lang="ts">
  import type { Employee } from '@hcengineering/contact'
  import { SelectUsersPopup } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { type ButtonBaseSize, type IconSize, ModernButton, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { sendInvites } from '../../../invites'
  import { currentMeetingRoom } from '../../../meetings'
  import love from '../../../plugin'
  import { infos } from '../../../stores'

  export let employee: Employee | undefined = undefined
  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  export let type: 'type-button' | 'type-button-icon' = 'type-button'
  export let size: ButtonBaseSize = 'small'
  export let iconSize: IconSize = 'small'
  export let withBackground: boolean = true

  const dispatch = createEventDispatcher()

  function openPicker (): void {
    const meetingRoomId = currentMeetingRoom
    const alreadyInCall = $infos.filter((participant) => participant.room === meetingRoomId).map((participant) => participant.person)
    showPopup(
      SelectUsersPopup,
      {
        okLabel: love.string.Invite,
        skipCurrentAccount: true,
        skipInactive: true,
        showStatus: true,
        skipAccounts: alreadyInCall
      },
      'top',
      (pickedIds: Ref<Employee>[] | undefined) => {
        if (pickedIds != null) sendInvites(pickedIds)
        dispatch('close')
      }
    )
  }
</script>

{#if employee === undefined}
  <div class:invite-backed={withBackground}>
    <ModernButton
      icon={love.icon.Invite}
      label={type === 'type-button-icon' ? undefined : love.string.Invite}
      {size}
      {iconSize}
      {type}
      {kind}
      on:click={openPicker}
    />
  </div>
{/if}

<style>
  .invite-backed {
    display: flex;
    border-radius: var(--small-BorderRadius);
    background-color: var(--theme-button-container-color);
  }
</style>
