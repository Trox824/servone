<script lang="ts">
  import type { ChatMessage } from '@hcengineering/chunter'
  import { translate } from '@hcengineering/platform'
  import { addNotification, Label, NotificationSeverity, themeStore } from '@hcengineering/ui'
  import { SimpleNotification } from '@hcengineering/view-resources'
  import { CalendarClock, Clock } from '@lucide/svelte'
  import { createEventDispatcher, tick } from 'svelte'

  import { menuItemClass, menuPopupClass, menuSeparatorClass, triggerButtonClass } from '../../../lib/menu-classes'
  import { minuteClock, parseLocalDateTime, toLocalDateTime } from '../../../lib/notify/pause'
  import {
    REMIND_PRESETS,
    formatRemindTime,
    isMorningToday,
    isValidRemindAt,
    remindAt,
    type RemindPreset
  } from '../../../lib/remind/remind-time'
  import { createMessageReminder } from './create'
  import { presetLabel, remindStrings } from './strings'

  export let message: ChatMessage

  const HOUR = 60 * 60_000

  const dispatch = createEventDispatcher()

  let isCustomOpen = false
  let customText = toLocalDateTime(Date.now() + HOUR)
  let customInput: HTMLInputElement

  $: now = $minuteClock
  $: customAt = parseLocalDateTime(customText)
  $: isCustomValid = customAt !== undefined && isValidRemindAt(customAt, now)

  async function choose (at: number): Promise<void> {
    dispatch('close')
    await createMessageReminder(message, at)
    const language = $themeStore.language
    const time = formatRemindTime(at, Date.now(), language)
    addNotification(
      await translate(remindStrings.ReminderSet, { time }, language),
      '',
      SimpleNotification,
      undefined,
      NotificationSeverity.Success
    )
  }

  function choosePreset (preset: RemindPreset): void {
    void choose(remindAt(preset, Date.now()))
  }

  function chooseCustom (): void {
    if (customAt === undefined || !isValidRemindAt(customAt, Date.now())) return
    void choose(customAt)
  }

  async function openCustom (): Promise<void> {
    isCustomOpen = true
    await tick()
    customInput.focus()
  }
</script>

<div class="{menuPopupClass} w-[16rem]">
  <div class="px-2 py-1.5 text-sm font-medium"><Label label={remindStrings.RemindMe} /></div>
  <div class={menuSeparatorClass}></div>
  {#each REMIND_PRESETS as preset (preset)}
    <button
      class={menuItemClass}
      on:click={() => {
        choosePreset(preset)
      }}
    >
      <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"><Clock size={14} /></span>
      <span class="flex-1 truncate"><Label label={presetLabel(preset, isMorningToday(now))} /></span>
      <span class="shrink-0 text-xs text-muted-foreground">
        {formatRemindTime(remindAt(preset, now), now, $themeStore.language)}
      </span>
    </button>
  {/each}
  <button class={menuItemClass} on:click={openCustom}>
    <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
      <CalendarClock size={14} />
    </span>
    <span class="flex-1 truncate"><Label label={remindStrings.Custom} /></span>
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
      <button
        type="submit"
        disabled={!isCustomValid}
        class="{triggerButtonClass('primary', !isCustomValid, false)} justify-center"
      >
        <Label label={remindStrings.RemindMe} />
      </button>
    </form>
  {/if}
</div>
