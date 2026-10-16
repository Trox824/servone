<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Bell, CalendarClock, Clock } from '@lucide/svelte'
  import { createEventDispatcher, tick } from 'svelte'
  import { Label, themeStore } from '../../original'
  import { menuItemClass, menuPopupClass, menuSeparatorClass, triggerButtonClass } from '../../lib/menu-classes'
  import { PAUSE_PRESETS, isValidCustomUntil, presetUntil, type PausePreset } from '@servone/notify-rules'
  import { minuteClock, pause, pauseString, pausedUntilStore, resume } from '../../lib/notify/pause'
  import { formatPauseTime, parseLocalDateTime, toLocalDateTime } from '../../lib/notify/pause-time'

  const HOUR = 60 * 60_000

  const presetLabel: Record<PausePreset, IntlString> = {
    for30m: pauseString.PauseFor30m,
    for1h: pauseString.PauseFor1h,
    for2h: pauseString.PauseFor2h,
    untilTomorrow: pauseString.PauseUntilTomorrow
  }

  const dispatch = createEventDispatcher()

  let isCustomOpen = false
  let customText = toLocalDateTime(Date.now() + HOUR)
  let customInput: HTMLInputElement

  $: now = $minuteClock
  $: isPaused = $pausedUntilStore !== undefined && now < $pausedUntilStore
  $: customUntil = parseLocalDateTime(customText)
  $: isCustomValid = customUntil !== undefined && isValidCustomUntil(customUntil, now)

  function choose (until: number): void {
    dispatch('close')
    void pause(until)
  }

  function choosePreset (preset: PausePreset): void {
    choose(presetUntil(preset, Date.now()))
  }

  function chooseCustom (): void {
    if (customUntil === undefined || !isValidCustomUntil(customUntil, Date.now())) return
    choose(customUntil)
  }

  async function openCustom (): Promise<void> {
    isCustomOpen = true
    await tick()
    customInput.focus()
  }

  function resumeNow (): void {
    dispatch('close')
    void resume()
  }
</script>

<div class="{menuPopupClass} w-[16rem]">
  {#if isPaused}
    <button class={menuItemClass} on:click={resumeNow}>
      <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"><Bell size={14} /></span>
      <span class="flex-1 truncate"><Label label={pauseString.ResumeNotifications} /></span>
    </button>
    <div class={menuSeparatorClass} />
  {/if}
  {#each PAUSE_PRESETS as preset (preset)}
    <button
      class={menuItemClass}
      on:click={() => {
        choosePreset(preset)
      }}
    >
      <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"><Clock size={14} /></span>
      <span class="flex-1 truncate"><Label label={presetLabel[preset]} /></span>
      <span class="shrink-0 text-xs text-muted-foreground">
        {formatPauseTime(presetUntil(preset, now), now, $themeStore.language)}
      </span>
    </button>
  {/each}
  <button class={menuItemClass} on:click={openCustom}>
    <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
      <CalendarClock size={14} />
    </span>
    <span class="flex-1 truncate"><Label label={pauseString.PauseCustom} /></span>
  </button>
  {#if isCustomOpen}
    <form class="flex flex-col gap-2 px-2 pb-1 pt-1.5" on:submit|preventDefault={chooseCustom}>
      <input
        bind:this={customInput}
        bind:value={customText}
        type="datetime-local"
        min={toLocalDateTime(now)}
        aria-invalid={!isCustomValid}
        class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
      />
      <button type="submit" disabled={!isCustomValid} class="{triggerButtonClass('primary', !isCustomValid, false)} justify-center">
        <Label label={pauseString.PauseNotifications} />
      </button>
    </form>
  {/if}
</div>
