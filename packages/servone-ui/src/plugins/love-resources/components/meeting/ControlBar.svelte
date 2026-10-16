<script lang="ts">
  import type { Room } from '@hcengineering/love'
  import { Popup, TooltipInstance } from '@hcengineering/ui'
  import love from '../../plugin'
  import { myInfo, myOffice } from '../../stores'
  import ControlBarContainer from './ControlBarContainer.svelte'
  import { lkSessionConnected } from '../../liveKitClient'
  import MeetingOptionsButton from './controls/MeetingOptionsButton.svelte'
  import SendReactionButton from './controls/SendReactionButton.svelte'
  import RoomAccessButton from './controls/RoomAccessButton.svelte'
  import LeaveRoomButton from './controls/LeaveRoomButton.svelte'
  import RecordingButton from './controls/RecordingButton.svelte'
  import TranscriptionButton from './controls/TranscriptionButton.svelte'
  import MicrophoneButton from './controls/MicrophoneButton.svelte'
  import CameraButton from './controls/CameraButton.svelte'
  import ShareScreenButton from './controls/ShareScreenButton.svelte'
  import InviteEmployeeButton from './invites/InviteEmployeeButton.svelte'

  export let room: Room
  export let fullScreen: boolean = false

  $: ownRoomId = $myOffice?._id ?? love.ids.Reception
  $: canLeave = $myInfo?.room !== ownRoomId
</script>

<div class="control-bar">
  <ControlBarContainer>
    <svelte:fragment slot="left">
      {#if room._id !== love.ids.Reception && $lkSessionConnected}
        <InviteEmployeeButton kind="secondary" size="large" iconSize="medium" withBackground={false} />
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="center">
      {#if $lkSessionConnected}
        <MicrophoneButton />
        <CameraButton />
        <ShareScreenButton />
        <SendReactionButton />
        <RecordingButton {room} />
        <TranscriptionButton {room} />
      {:else}
        <RoomAccessButton {room} />
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="right">
      <MeetingOptionsButton {room} />
      {#if canLeave}
        <LeaveRoomButton {room} />
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="extra">
      {#if fullScreen}
        <Popup fullScreen={true} />
        <TooltipInstance fullScreen={true} />
      {/if}
    </svelte:fragment>
  </ControlBarContainer>
</div>

<style>
  .control-bar {
    width: 100%;
  }

  .control-bar :global(.bar) {
    border-top: none;
    padding: 12px 20px 20px 20px;
  }
</style>
