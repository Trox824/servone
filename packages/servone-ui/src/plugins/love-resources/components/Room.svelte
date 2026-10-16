<script lang="ts">
  import { ActionContext } from '@hcengineering/presentation'
  import type { Room as TypeRoom } from '@hcengineering/love'
  import { getEmbeddedLabel, getMetadata } from '@hcengineering/platform'
  import { Label, Loading, tooltip, deviceOptionsStore } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import { Maximize, Minimize, PictureInPicture2 } from '@lucide/svelte'
  import { onDestroy, onMount } from 'svelte'
  import love from '../plugin'
  import { waitForOfficeLoaded, currentRoom, currentMeetingMinutes } from '../stores'
  import { lk } from '../utils'
  import ControlBar from './meeting/ControlBar.svelte'
  import ParticipantsListView from './meeting/ParticipantsListView.svelte'
  import ScreenSharingView from './meeting/ScreenSharingView.svelte'
  import InviteEmployeeButton from './meeting/invites/InviteEmployeeButton.svelte'
  import { buttonVariants } from '../../../lib/components/ui/button'
  import { textOf } from '../calls/strings'
  import CallLimitChip from '../calls/components/CallLimitChip.svelte'

  export let room: TypeRoom
  export let onMinimize: (() => void) | undefined = undefined

  const MAX_GRID_COLUMNS = 8
  const CROWDED_PARTICIPANTS = 9
  const TILE_WIDTH_UNITS = 1280
  const TILE_HEIGHT_UNITS = 720
  const SECONDS_PER_MINUTE = 60
  const SECONDS_PER_HOUR = 3600
  const TICK_INTERVAL_MS = 1000

  let rootElement: HTMLDivElement | undefined
  let isLoading = true
  let isConfigured = false
  let isFullScreen = false
  let hasActiveTrack = false
  let headCount = lk.numParticipants
  let nowMs = Date.now()
  let tickerId: ReturnType<typeof setInterval> | undefined

  $: translate = textOf($languageStore === 'vi' ? 'vi' : 'en')

  $: startedAtMs = $currentMeetingMinutes?.attachedTo === room._id ? $currentMeetingMinutes.createdOn : undefined

  function formatElapsed (totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
    const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
    const seconds = String(totalSeconds % SECONDS_PER_MINUTE).padStart(2, '0')
    if (hours === 0) return `${minutes}:${seconds}`
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
  }

  $: elapsedText =
    startedAtMs === undefined ? undefined : formatElapsed(Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)))

  $: isAlone = headCount <= 1 && !hasActiveTrack

  function buildGridStyle (participantTotal: number): string {
    const columnCount = Math.min(MAX_GRID_COLUMNS, Math.ceil(Math.sqrt(participantTotal)))
    const rowCount = Math.ceil(participantTotal / columnCount)
    return `grid-template-columns: repeat(${columnCount}, 1fr); aspect-ratio: ${columnCount * TILE_WIDTH_UNITS} / ${rowCount * TILE_HEIGHT_UNITS};`
  }

  $: gridStyle = hasActiveTrack || isAlone ? '' : buildGridStyle(headCount)

  $: fullScreenLabel = isFullScreen ? translate('ExitFullScreen') : translate('EnterFullScreen')

  function toggleFullScreen (): void {
    if (isFullScreen) {
      void document.exitFullscreen()
    } else {
      void rootElement?.requestFullscreen()
    }
  }

  function syncFullScreen (): void {
    isFullScreen = rootElement !== undefined && document.fullscreenElement === rootElement
  }

  async function loadOffice (): Promise<void> {
    if (getMetadata(love.metadata.WebSocketURL) === undefined) return
    isConfigured = true
    await waitForOfficeLoaded()
    isLoading = false
  }

  onMount(() => {
    void loadOffice()
    tickerId = setInterval(() => {
      nowMs = Date.now()
    }, TICK_INTERVAL_MS)
  })

  onDestroy(() => {
    if (tickerId !== undefined) clearInterval(tickerId)
    if (document.fullscreenElement !== null) void document.exitFullscreen()
  })
</script>

<svelte:document on:fullscreenchange={syncFullScreen} />

<div bind:this={rootElement} class="call theme-dark flex h-full w-full min-h-0 flex-col bg-background text-foreground">
  <ActionContext context={{ mode: 'workbench' }} />
  <header class="flex h-14 shrink-0 items-center gap-3 px-5">
    <div class="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
      <span
        class="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_25%,transparent)]"
      ></span>
      <span class="text-muted-foreground">{translate('Call')}</span>
      <span class="min-w-0 truncate font-medium text-foreground">{room.name}</span>
      <span class="shrink-0 text-muted-foreground tabular-nums">
        · {translate('InCall', { count: headCount })}{#if elapsedText !== undefined}
          · <span aria-label={translate('CallTimer')}>{elapsedText}</span>{/if}
      </span>
    </div>
    <CallLimitChip />
    <button
      type="button"
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      aria-label={fullScreenLabel}
      use:tooltip={{ label: getEmbeddedLabel(fullScreenLabel), direction: 'bottom' }}
      on:click={toggleFullScreen}
    >
      {#if isFullScreen}
        <Minimize aria-hidden="true" />
      {:else}
        <Maximize aria-hidden="true" />
      {/if}
    </button>
    {#if onMinimize !== undefined && !isFullScreen}
      <button type="button" class={buttonVariants({ variant: 'ghost', size: 'default' })} on:click={() => onMinimize?.()}>
        <PictureInPicture2 aria-hidden="true" />
        {translate('Minimize')}
      </button>
    {/if}
  </header>

  {#if !isConfigured}
    <div class="flex flex-1 items-center justify-center text-lg font-medium">
      <Label label={love.string.ServiceNotConfigured} />
    </div>
  {:else if isLoading}
    <Loading />
  {/if}

  <div
    class="room-container"
    class:sharing={hasActiveTrack}
    class:solo={isAlone}
    class:crowded={headCount > CROWDED_PARTICIPANTS}
    class:compact={$deviceOptionsStore.isMobile}
    class:pending={!isConfigured || isLoading}
  >
    <div class="screen-holder" class:shared={hasActiveTrack}>
      <ScreenSharingView bind:hasActiveTrack />
    </div>
    {#if isAlone}
      <div class="invitation">
        <h2 class="text-lg font-medium text-foreground">{translate('AloneTitle')}</h2>
        <p class="text-sm text-muted-foreground">{translate('AloneBody')}</p>
        <InviteEmployeeButton kind="primary" size="large" iconSize="medium" withBackground={false} />
      </div>
    {/if}
    <div class="videoGrid" class:scroll-m-0={hasActiveTrack} style={gridStyle}>
      <ParticipantsListView
        room={room._id}
        on:participantsCount={(event) => {
          headCount = event.detail
        }}
      />
    </div>
  </div>

  {#if $currentRoom !== undefined}
    <ControlBar room={$currentRoom} fullScreen={isFullScreen} />
  {/if}
</div>

<style>
  .call {
    --destructive: oklch(0.577 0.245 27.325);
  }

  .room-container {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: center;
    padding-inline: 20px;
  }

  .room-container.compact {
    padding-inline: var(--spacing-0_5);
  }

  .room-container.pending {
    display: none;
  }

  .room-container.sharing {
    gap: 12px;
  }

  .screen-holder {
    position: relative;
    display: none;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-height: 100%;
    min-height: 0;
    border-radius: 12px;
  }

  .screen-holder.shared {
    display: flex;
  }

  .videoGrid {
    display: grid;
    grid-auto-rows: 1fr;
    place-content: center;
    place-items: center;
    gap: 12px;
    max-height: 100%;
    max-width: 100%;
  }

  .room-container.crowded .videoGrid {
    gap: 8px;
  }

  .room-container.sharing .videoGrid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 240px;
    min-width: 240px;
    max-width: 240px;
    min-height: 0;
    overflow-y: auto;
  }

  .room-container.solo .videoGrid {
    display: block;
    position: absolute;
    right: 20px;
    bottom: 0;
    width: 240px;
  }

  .invitation {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
  }

  .invitation h2,
  .invitation p {
    margin: 0;
  }

  .invitation p {
    margin-bottom: 12px;
  }

  .call :global(.parent:not(.active)) {
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .call :global(.cover:not(.active)) {
    background: var(--card);
  }
</style>
