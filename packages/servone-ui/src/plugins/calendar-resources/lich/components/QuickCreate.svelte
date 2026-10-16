<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Person } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Clock, Video, X } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { Input } from '../../../../lib/components/ui/input'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import { Label } from '../../../../lib/components/ui/label'
  import { calendarStore } from '../../utils'
  import { createEvent, type EventDraft } from '../save'
  import { textOf } from '../strings'
  import { whenText } from '../lib/format'
  import { allDaySlot, nextHourSlot, startOfDay } from '../lib/time'
  import type { Lang, Slot } from '../lib/types'
  import { atMinutes, daySlots, durationText, minutesOfDay } from './fields/time-slots'
  import DatePicker from './fields/DatePicker.svelte'
  import TimeSelect from './fields/TimeSelect.svelte'
  import RepeatSelect from './fields/RepeatSelect.svelte'
  import GuestPicker from './fields/GuestPicker.svelte'

  export let draft: EventDraft
  export let lang: Lang
  export let firstDayOfWeek: number
  export let me: Ref<Person>
  export let eventDuration: number

  const dispatch = createEventDispatcher<{ close: undefined, more: EventDraft }>()
  const client = getClient()

  let isTimeOpen = false
  let isSaving = false
  let isSaveFailed = false

  $: t = textOf(lang)
  $: when = whenText({ start: draft.start, end: draft.end }, draft.allDay, lang)
  $: startMinutes = minutesOfDay(draft.start)
  $: endDay = startOfDay(draft.end)
  $: startOptions = daySlots(startMinutes).map((minutes) => ({ minutes }))
  $: endOptions = daySlots(minutesOfDay(draft.end)).map((minutes) => {
    const end = atMinutes(endDay, minutes)
    return end > draft.start ? { minutes, hint: durationText(end - draft.start, lang) } : { minutes, isDisabled: true }
  })

  function moveStart (next: number): void {
    draft = { ...draft, start: next, end: draft.end + next - draft.start }
  }

  function setStartDay (day: number): void {
    moveStart(draft.allDay ? startOfDay(day) : atMinutes(day, startMinutes))
  }

  let timedSlot: Slot = draft.allDay ? nextHourSlot(draft.start, Date.now(), eventDuration) : { start: draft.start, end: draft.end }

  function timedOn (day: number): Slot {
    const start = atMinutes(startOfDay(day), minutesOfDay(timedSlot.start))
    return { start, end: start + timedSlot.end - timedSlot.start }
  }

  function setAllDay (isAllDay: boolean): void {
    if (isAllDay) timedSlot = { start: draft.start, end: draft.end }
    const slot = isAllDay ? allDaySlot(draft.start) : timedOn(draft.start)
    draft = { ...draft, ...slot, allDay: isAllDay, isBusy: !isAllDay }
  }

  async function save (): Promise<void> {
    if (isSaving) return
    isSaving = true
    isSaveFailed = false
    try {
      await createEvent(client, draft, $calendarStore, lang)
      dispatch('close')
    } catch (err) {
      isSaveFailed = true
      throw err
    } finally {
      isSaving = false
    }
  }
</script>

<form class="grid gap-3" on:submit|preventDefault={() => { void save() }}>
  <Input
    bind:value={draft.title}
    placeholder={t(draft.isMeeting ? 'MeetingName' : 'AddTitle')}
    aria-label={t('Title')}
  />

  {#if isTimeOpen}
    <div class="grid gap-2">
      <DatePicker id="lich-quick-date" value={draft.start} {lang} {firstDayOfWeek} on:change={(e) => { setStartDay(e.detail) }} />
      {#if !draft.allDay}
        <div class="flex items-center gap-2">
          <TimeSelect
            id="lich-quick-start"
            value={startMinutes}
            options={startOptions}
            ariaLabel={t('StartTime')}
            on:change={(e) => { moveStart(atMinutes(startOfDay(draft.start), e.detail)) }}
          />
          <span class="text-muted-foreground" aria-hidden="true">–</span>
          <TimeSelect
            id="lich-quick-end"
            value={minutesOfDay(draft.end)}
            options={endOptions}
            ariaLabel={t('EndTime')}
            on:change={(e) => { draft = { ...draft, end: atMinutes(endDay, e.detail) } }}
          />
        </div>
      {/if}
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <Checkbox id="lich-quick-all-day" checked={draft.allDay} onCheckedChange={setAllDay} />
          <Label for="lich-quick-all-day" class="font-normal">{t('AllDay')}</Label>
        </div>
        <div class="min-w-0 flex-1">
          <RepeatSelect id="lich-quick-repeat" rules={draft.rules} startDate={draft.start} {lang} {firstDayOfWeek} on:change={(e) => { draft = { ...draft, rules: e.detail } }} />
        </div>
      </div>
    </div>
  {:else}
    <Button variant="ghost" class="justify-start font-normal" title={t('ChangeTime')} onclick={() => { isTimeOpen = true }}>
      <Clock class="text-muted-foreground" />
      <span class="min-w-0">{when}</span>
    </Button>
  {/if}

  <GuestPicker id="lich-quick-guests" bind:participants={draft.participants} bind:externalParticipants={draft.externalParticipants} {me} {lang} />

  <!-- Google Calendar's "Add Google Meet video conferencing" row: one click, removable, sits under the guests. -->
  {#if draft.isMeeting}
    <div class="flex items-center gap-3 rounded-md px-3 py-1.5">
      <Video class="size-4 shrink-0 text-primary" />
      <div class="grid min-w-0 flex-1 leading-tight">
        <span class="font-medium">{t('VideoMeetingAdded')}</span>
        <span class="text-xs text-muted-foreground">{t('VideoMeetingHint')}</span>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t('RemoveVideoMeeting')} onclick={() => { draft = { ...draft, isMeeting: false } }}>
        <X />
      </Button>
    </div>
  {:else}
    <Button type="button" variant="ghost" class="justify-start font-normal" onclick={() => { draft = { ...draft, isMeeting: true } }}>
      <Video class="text-muted-foreground" />
      {t('AddVideoMeeting')}
    </Button>
  {/if}

  {#if isSaveFailed}
    <p class="m-0 text-sm text-destructive" role="alert">{t('SaveFailed')}</p>
  {/if}

  <div class="flex justify-end gap-2">
    <Button type="button" variant="ghost" onclick={() => { dispatch('more', draft) }}>{t('MoreOptions')}</Button>
    <Button data-track="calendar.quick_create.submit" type="submit" disabled={isSaving}>{t('Save')}</Button>
  </div>
</form>
