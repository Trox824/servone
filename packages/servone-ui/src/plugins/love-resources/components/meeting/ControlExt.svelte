<script lang="ts">
  import { toIdMap, type Ref } from '@hcengineering/core'
  import type { ParticipantInfo, Room } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import {
    addNotification,
    closePopup,
    closeTooltip,
    deviceOptionsStore,
    eventToHTMLElement,
    location,
    NotificationSeverity,
    showPopup,
    type PopupResult
  } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import { SimpleNotification } from '@hcengineering/view-resources'
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import workbench from '@hcengineering/workbench'
  import { closeWidget, sidebarStore } from '@hcengineering/workbench-resources'
  import { isContextRoom, MAX_CALL_MINUTES } from '../../calls/context'
  import { callConnectedAt, MS_PER_MINUTE, WARN_MINUTES } from '../../calls/limit'
  import { textOf, type StringKey } from '../../calls/strings'
  import love from '../../plugin'
  import { currentRoom, infos, myInfo, rooms } from '../../stores'
  import { createMeetingWidget, getRoomName } from '../../utils'
  import RoomPopup from '../RoomPopup.svelte'
  import RoomButton from '../RoomButton.svelte'
  import RoomModal from '../RoomModal.svelte'
  import { leaveMeeting, currentMeetingRoom } from '../../meetings'
  import { lkSessionConnected } from '../../liveKitClient'

  interface ShownCall {
    room: Room
    participants: ParticipantInfo[]
  }

  function translate (key: StringKey, params?: Record<string, string | number>): string {
    return textOf($languageStore === 'vi' ? 'vi' : 'en')(key, params)
  }

  function collectOwnCalls (allRooms: Room[], presences: ParticipantInfo[], ownPresenceId: Ref<ParticipantInfo> | undefined): ShownCall[] {
    const roomsById = toIdMap(allRooms)
    const participantsByRoom = new Map<Ref<Room>, ParticipantInfo[]>()
    for (const presence of presences) {
      if (presence.room === love.ids.Reception || !roomsById.has(presence.room)) continue
      const present = participantsByRoom.get(presence.room) ?? []
      present.push(presence)
      participantsByRoom.set(presence.room, present)
    }
    const calls: ShownCall[] = []
    for (const [roomId, participants] of participantsByRoom) {
      const room = roomsById.get(roomId)
      if (room === undefined || !isContextRoom(room)) continue
      if (participants.some((participant) => participant._id === ownPresenceId)) {
        calls.push({ room, participants })
      }
    }
    return calls
  }

  $: shownCalls = collectOwnCalls($rooms, $infos, $myInfo?._id)

  function openCallPopup (event: MouseEvent, room: Room): void {
    closeTooltip()
    showPopup(RoomPopup, { room }, eventToHTMLElement(event))
  }

  function isWidgetOpen (): boolean {
    return get(sidebarStore).widgetsState.has(love.ids.MeetingWidget)
  }

  function syncMeetingWidget (isConnected: boolean, activeRoomId: Ref<Room> | undefined): void {
    if (activeRoomId === undefined || !isConnected) {
      if (isWidgetOpen()) closeWidget(love.ids.MeetingWidget)
      return
    }
    if (currentMeetingRoom !== undefined && currentMeetingRoom !== activeRoomId) {
      void leaveMeeting()
      return
    }
    const widgetDoc = getClient()
      .getModel()
      .findAllSync(workbench.class.Widget, { _id: love.ids.MeetingWidget })[0]
    if (widgetDoc === undefined) return
    if (!isWidgetOpen()) createMeetingWidget(widgetDoc, activeRoomId, true)
  }

  $: $location, syncMeetingWidget($lkSessionConnected, $currentRoom?._id)

  let fullScreenPopup: PopupResult | undefined

  function openFullScreenCall (): void {
    fullScreenPopup = showPopup(RoomModal, {}, 'full', () => {
      fullScreenPopup = undefined
    })
  }

  $: if (
    $deviceOptionsStore.isMobile &&
    $lkSessionConnected &&
    $currentRoom !== undefined &&
    fullScreenPopup === undefined
  ) {
    openFullScreenCall()
  }

  let warnTimer: ReturnType<typeof setTimeout> | undefined
  let limitTimer: ReturnType<typeof setTimeout> | undefined

  function cancelLimitTimers (): void {
    clearTimeout(warnTimer)
    clearTimeout(limitTimer)
    warnTimer = undefined
    limitTimer = undefined
  }

  function announce (titleKey: StringKey, bodyKey: StringKey, minutes: number): void {
    addNotification(
      translate(titleKey, { minutes }),
      translate(bodyKey, { minutes }),
      SimpleNotification,
      undefined,
      NotificationSeverity.Info
    )
  }

  function endCallAtLimit (): void {
    void leaveMeeting()
    announce('CallLimitTitle', 'CallLimitBody', MAX_CALL_MINUTES)
  }

  function startLimitClock (isConnected: boolean): void {
    cancelLimitTimers()
    if (!isConnected) {
      callConnectedAt.set(undefined)
      return
    }
    callConnectedAt.set(Date.now())
    announce('BetaNoticeTitle', 'BetaNoticeBody', MAX_CALL_MINUTES)
    warnTimer = setTimeout(() => {
      announce('CallEndingTitle', 'CallEndingBody', WARN_MINUTES)
    }, (MAX_CALL_MINUTES - WARN_MINUTES) * MS_PER_MINUTE)
    limitTimer = setTimeout(endCallAtLimit, MAX_CALL_MINUTES * MS_PER_MINUTE)
  }

  $: startLimitClock($lkSessionConnected)

  function leaveOnUnload (): void {
    if ($myInfo !== undefined && $lkSessionConnected) void leaveMeeting()
  }

  window.addEventListener('beforeunload', leaveOnUnload)

  onDestroy(() => {
    cancelLimitTimers()
    closePopup('myInvites')
    closeWidget(love.ids.MeetingWidget)
    window.removeEventListener('beforeunload', leaveOnUnload)
  })
</script>

<div class="flex items-center gap-2">
  {#each shownCalls as call (call.room._id)}
    {#await getRoomName(call.room) then roomName}
      <RoomButton
        label={roomName}
        participants={call.participants}
        active={$myInfo?.room === call.room._id}
        on:click={(event) => {
          openCallPopup(event, call.room)
        }}
      />
    {/await}
  {/each}
</div>
