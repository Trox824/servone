<script lang="ts">
  import core, { type Doc, getCurrentAccount, type Ref, type Space } from '@hcengineering/core'
  import {
    defineSeparators,
    getCurrentLocation,
    Label,
    location,
    ModernButton,
    navigate,
    panelSeparators,
    Separator
  } from '@hcengineering/ui'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import type { ActivityMessage } from '@hcengineering/activity'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Channel, ChatMessage } from '@hcengineering/chunter'
  import view from '@hcengineering/view'
  import { messageInFocus } from '@hcengineering/activity-resources'
  import { Presence } from '@hcengineering/presence-resources'
  import love, { MeetingStatus } from '@hcengineering/love'
  import { onDestroy } from 'svelte'
  import { Phone } from '@lucide/svelte'
  import { Button as JoinButton } from '../../../lib/components/ui/button'
  import AvatarStack from '../../love-resources/calls/components/AvatarStack.svelte'
  import { contextRoomId, peopleInCall } from '../../love-resources/calls/context'
  import { joinContext } from '../../love-resources/calls/join'
  import { infos, myInfo } from '../../love-resources/calls/live'
  import ChannelComponent from './Channel.svelte'
  import ChannelEmptyState from './ChannelEmptyState.svelte'
  import ChannelHeader from './ChannelHeader.svelte'
  import DocAside from './chat/DocAside.svelte'
  import ChannelAside from './chat/ChannelAside.svelte'
  import { levelTarget } from './NotifyLevelButton.svelte'
  import chunter from '../plugin'
  import { getChannelName, isThreadMessage } from '../utils'
  import { callStr } from '../calls/strings'
  import ChannelSearchPanel from '../search/ChannelSearchPanel.svelte'
  import { searchPanelFor } from '../search/scope'
  import { openMessageFromSpecial } from '../navigation'

  export let object: Doc
  export let context: DocNotifyContext | undefined
  export let autofocus = true
  export let embedded = false
  export let readonly = false

  const THREAD_PATH_INDEX = 4
  const MAX_AVATARS = 4
  const CLOCK_TICK_MS = 1000

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const meetingQuery = createQuery()
  const accountUuid = getCurrentAccount().uuid

  defineSeparators('aside', panelSeparators)

  let isAsideToggled = false
  let searchSpaceName = ''
  let callStartedAt: number | undefined
  let nowMs = Date.now()

  const clockTimer = setInterval(() => {
    nowMs = Date.now()
  }, CLOCK_TICK_MS)
  onDestroy(() => {
    clearInterval(clockTimer)
  })

  $: objectId = object._id
  $: objectClass = object._class
  $: isThreadOpen = $location.path[THREAD_PATH_INDEX] != null
  $: isSpaceObject = hierarchy.isDerived(objectClass, core.class.Space)
  $: spaceObject = isSpaceObject ? (object as Space) : undefined
  $: isMember = spaceObject === undefined || spaceObject.members.includes(accountUuid)
  $: isEffectivelyReadonly = spaceObject === undefined ? readonly : readonly || spaceObject.archived
  $: showJoinScreen = !isEffectivelyReadonly && spaceObject !== undefined && !isMember
  $: isDirectMessage = hierarchy.isDerived(objectClass, chunter.class.DirectMessage)
  $: isChunterSpace = hierarchy.isDerived(objectClass, chunter.class.ChunterSpace)
  $: isChannelObject = hierarchy.isDerived(objectClass, chunter.class.Channel)
  $: withAside = !embedded && !isThreadOpen && !isDirectMessage && isMember
  $: channelObject = isChannelObject ? (object as Channel) : undefined
  $: chatPanelMixin = hierarchy.classHierarchyMixin(objectClass, chunter.mixin.ObjectChatPanel)

  $: isSearchShown = !embedded && !isThreadOpen && $searchPanelFor === objectId
  $: if (isSearchShown) {
    isAsideToggled = false
  }
  $: if (isSearchShown) {
    void loadSearchName(objectId)
  }
  $: isRightPanelShown = isSearchShown || (withAside && isAsideToggled)

  async function loadSearchName (id: Ref<Doc>): Promise<void> {
    const fetchedName = (await getChannelName(id, objectClass, object)) ?? ''
    if (id === objectId) searchSpaceName = fetchedName
  }

  function focusMessage (message: ActivityMessage): void {
    if (isThreadMessage(message)) {
      const threadLocation = getCurrentLocation()
      threadLocation.path[THREAD_PATH_INDEX] = message.attachedTo
      navigate(threadLocation)
    }
    messageInFocus.set(message._id)
  }

  function handleAsideToggled (): void {
    isAsideToggled = !isAsideToggled
    if (isAsideToggled) searchPanelFor.set(undefined)
  }

  function handleSearchSelect (message: ChatMessage): void {
    if (message.space !== objectId) {
      void openMessageFromSpecial(message)
    } else {
      focusMessage(message)
    }
  }

  async function joinSpace (): Promise<void> {
    if (spaceObject === undefined) return
    await client.update(spaceObject, { $push: { members: accountUuid } })
  }

  $: callRoom = contextRoomId(objectId)
  $: callParticipants = peopleInCall($infos, callRoom)
  $: hasCallParticipants = callParticipants.length > 0
  $: isInThisCall = $myInfo?.room === callRoom
  $: if (hasCallParticipants) {
    meetingQuery.query(
      love.class.MeetingMinutes,
      { attachedTo: callRoom, status: MeetingStatus.Active },
      (minutes) => {
        callStartedAt = minutes[0]?.createdOn
      },
      { limit: 1 }
    )
  } else {
    meetingQuery.unsubscribe()
    callStartedAt = undefined
  }

  function padTwoDigits (amount: number): string {
    return String(amount).padStart(2, '0')
  }

  $: elapsedSeconds = callStartedAt === undefined ? 0 : Math.max(0, Math.floor((nowMs - callStartedAt) / 1000))
  $: callDuration = `${padTwoDigits(Math.floor(elapsedSeconds / 60))}:${padTwoDigits(elapsedSeconds % 60)}`

  async function joinCall (): Promise<void> {
    const callName = (await getChannelName(objectId, objectClass, object)) ?? ''
    const callTitle = levelTarget(client, object) === 'channel' ? `#${callName}` : callName
    await joinContext(objectId, callTitle)
  }
</script>

<Presence {object} />

<div class="popupPanel servone-channel">
  <ChannelHeader
    _id={objectId}
    _class={objectClass}
    {object}
    {withAside}
    canOpen={!isChunterSpace}
    allowClose={embedded}
    canOpenInSidebar={true}
    isAsideShown={isAsideToggled}
    on:close
    on:select={(event) => {
      focusMessage(event.detail)
    }}
    on:aside-toggled={handleAsideToggled}
  />

  {#if hasCallParticipants}
    <div class="flex w-full shrink-0 items-center gap-3 border-b border-border bg-card py-2 pr-3 pl-4 text-[13px]">
      <span class="inline-flex shrink-0 items-center gap-1.5 text-foreground">
        <span aria-hidden="true" class="size-[7px] rounded-full bg-primary ring-[3px] ring-primary/20"></span>
        <Phone class="size-3.5" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1 truncate text-muted-foreground tabular-nums">
        {#if callStartedAt === undefined}
          <Label label={callStr.CallLiveStarting} params={{ count: callParticipants.length }} />
        {:else}
          <Label label={callStr.CallLive} params={{ count: callParticipants.length, duration: callDuration }} />
        {/if}
      </span>
      <AvatarStack people={callParticipants} max={MAX_AVATARS} />
      {#if !isInThisCall}
        <JoinButton size="sm" onclick={joinCall}>
          <Label label={callStr.Join} />
        </JoinButton>
      {/if}
    </div>
  {/if}

  <div class="popupPanel-body" class:asideShown={isRightPanelShown}>
    <div class="popupPanel-body__main">
      {#key objectId}
        {#if showJoinScreen}
          <div class="flex h-full w-full items-center justify-center">
            <div class="flex w-[35rem] max-w-full flex-col items-center text-center">
              <div class="mb-4 font-semibold">
                <Label label={chunter.string.JoinChannelHeader} />
              </div>
              <div class="text-muted-foreground">
                <Label label={chunter.string.JoinChannelText} />
              </div>
              <div class="h-4"></div>
              <ModernButton label={view.string.Join} kind="primary" dataId="btnJoin" on:click={joinSpace} />
            </div>
          </div>
        {:else}
          <ChannelComponent readonly={isEffectivelyReadonly} {context} {object} {autofocus} />
          {#if isChunterSpace && !isEffectivelyReadonly}
            <ChannelEmptyState {objectId} />
          {/if}
        {/if}
      {/key}
    </div>

    {#if isRightPanelShown}
      <Separator name="aside" float={false} index={0} />
      <div class="popupPanel-body__aside shown">
        <Separator name="aside" float index={0} />
        <div class="antiPanel-wrap__content">
          {#if isSearchShown}
            {#key objectId}
              <ChannelSearchPanel
                space={objectId}
                name={searchSpaceName}
                isChannel={levelTarget(client, object) === 'channel'}
                on:select={(event) => {
                  handleSearchSelect(event.detail)
                }}
                on:close={() => {
                  searchPanelFor.set(undefined)
                }}
              />
            {/key}
          {:else if channelObject !== undefined}
            <ChannelAside object={channelObject} objectChatPanel={chatPanelMixin} />
          {:else}
            <DocAside {object} objectChatPanel={chatPanelMixin} />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
