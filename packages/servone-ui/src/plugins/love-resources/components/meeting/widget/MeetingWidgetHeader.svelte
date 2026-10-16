<script lang="ts">
  import type { MeetingMinutes, Room } from '@hcengineering/love'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import {
    type BreadcrumbItem,
    Breadcrumbs,
    ButtonIcon,
    Header,
    IconMaximize,
    type PopupResult,
    showPopup
  } from '@hcengineering/ui'
  import { onDestroy } from 'svelte'
  import { textOf } from '../../../calls/strings'
  import CallLimitChip from '../../../calls/components/CallLimitChip.svelte'
  import { currentRoom } from '../../../stores'
  import RoomModal from '../../RoomModal.svelte'
  import MeetingOptionsButton from '../controls/MeetingOptionsButton.svelte'
  import RecordingButton from '../controls/RecordingButton.svelte'
  import RoomAccessButton from '../controls/RoomAccessButton.svelte'
  import TranscriptionButton from '../controls/TranscriptionButton.svelte'

  export let room: Room
  export let doc: MeetingMinutes | undefined = undefined

  let callModal: PopupResult | undefined

  $: titleItems = [{ id: 'meeting', title: doc?.title ?? room.name }] satisfies BreadcrumbItem[]
  $: expandLabel = getEmbeddedLabel(textOf($languageStore === 'vi' ? 'vi' : 'en')('ExpandCall'))

  function openFullCall (): void {
    callModal = showPopup(RoomModal, { room }, 'full')
  }

  onDestroy(() => {
    callModal?.close()
  })
</script>

<Header type="type-aside" adaptive="disabled" closeOnEscape={false} on:close>
  <Breadcrumbs items={titleItems} currentOnly />
  <svelte:fragment slot="actions">
    {#if $currentRoom !== undefined}
      <CallLimitChip compact />
      <RoomAccessButton {room} kind="tertiary" size="small" />
      <RecordingButton {room} kind="tertiary" size="small" />
      <TranscriptionButton {room} kind="tertiary" size="small" />
      <MeetingOptionsButton {room} kind="tertiary" size="small" />
      <ButtonIcon
        icon={IconMaximize}
        kind="tertiary"
        size="small"
        noPrint
        tooltip={{ label: expandLabel }}
        on:click={openFullCall}
      />
    {/if}
  </svelte:fragment>
</Header>
