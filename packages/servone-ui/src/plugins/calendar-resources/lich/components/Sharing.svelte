<script lang="ts">
  import type { Calendar, Visibility } from '@hcengineering/calendar'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { Globe, CalendarClock, Lock } from '@lucide/svelte'
  import * as Card from '../../../../lib/components/ui/card'
  import * as RadioGroup from '../../../../lib/components/ui/radio-group'
  import { Label as FieldLabel } from '../../../../lib/components/ui/label'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import { Separator } from '../../../../lib/components/ui/separator'
  import * as Select from '../../../../lib/components/ui/select'
  import { calendarStore } from '../../utils'
  import { str } from '../plugin'
  import { textOf } from '../strings'
  import { defaultDuration, defaultReminders, DURATION_CHOICES, NO_REMINDER, type ReminderDefaults } from '../lib/reminders'
  import { DAY_MS, HOUR_MS } from '../lib/time'
  import type { Lang } from '../lib/types'
  import { beforeText, durationText } from './fields/time-slots'
  import { durationCalendarOf } from '../save'

  export let isMine: (socialId: string) => boolean
  export let lang: Lang

  type CalendarWithReminders = Calendar & Omit<ReminderDefaults, '_id'>

  const MINUTE_MS = 60 * 1000
  const TIMED_PRESETS = [5 * MINUTE_MS, 10 * MINUTE_MS, 15 * MINUTE_MS, 30 * MINUTE_MS, HOUR_MS, DAY_MS]
  const ALL_DAY_PRESETS = [DAY_MS, 2 * DAY_MS, 7 * DAY_MS]
  const NONE = 'none'
  const KINDS = [
    { isAllDay: false, label: 'TimedEvents', presets: TIMED_PRESETS },
    { isAllDay: true, label: 'AllDayEvents', presets: ALL_DAY_PRESETS }
  ] as const

  const client = getClient()
  const LEVELS: Array<{ id: Visibility, label: IntlString, hint: IntlString, icon: typeof Globe }> = [
    { id: 'public', label: str.ShareFull, hint: str.ShareFullHint, icon: Globe },
    { id: 'freeBusy', label: str.ShareFreeBusy, hint: str.ShareFreeBusyHint, icon: CalendarClock },
    { id: 'private', label: str.SharePrivate, hint: str.SharePrivateHint, icon: Lock }
  ]
  $: isLoading = $calendarStore.length === 0
  $: mine = $calendarStore.filter((c) => isMine(c.user))
  $: durationCalendar = durationCalendarOf($calendarStore)

  function levelOf (id: string): Visibility | undefined {
    return LEVELS.find((level) => level.id === id)?.id
  }

  $: t = textOf(lang)
  $: reminderText = (ms: number): string => (ms === NO_REMINDER ? t('NoReminder') : beforeText(ms, lang))

  function currentReminder (c: Calendar, isAllDay: boolean): number {
    return defaultReminders(c, isAllDay)[0] ?? NO_REMINDER
  }

  function choicesFor (presets: readonly number[], current: number): number[] {
    const listed = presets.includes(current) || current === NO_REMINDER ? [...presets] : [...presets, current].sort((a, b) => a - b)
    return [NO_REMINDER, ...listed]
  }

  function setReminder (c: Calendar, isAllDay: boolean, picked: string): void {
    const ms = picked === NONE ? NO_REMINDER : Number(picked)
    if (!Number.isFinite(ms)) return
    void client.update<CalendarWithReminders>(c, isAllDay ? { servoneDefaultAllDayReminder: ms } : { servoneDefaultReminder: ms })
  }

  function setDuration (c: Calendar, picked: string): void {
    const ms = Number(picked)
    if (!DURATION_CHOICES.includes(ms)) return
    void client.update<CalendarWithReminders>(c, { servoneDefaultDuration: ms })
  }

  const valueOf = (ms: number): string => (ms === NO_REMINDER ? NONE : String(ms))
</script>

<div class="mx-auto grid w-full max-w-2xl gap-6 p-6">
  <div class="grid gap-1">
    <h2 class="m-0 text-lg font-semibold"><Label label={str.Sharing} /></h2>
    <p class="m-0 text-sm text-muted-foreground"><Label label={str.SharingIntro} /></p>
  </div>
  {#if isLoading}
    {#each Array.from({ length: 2 }) as _}
      <Skeleton class="h-36 w-full rounded-xl" />
    {/each}
  {:else}
    {#each mine as c (c._id)}
      <Card.Root>
        <Card.Header>
          <Card.Title>{c.name}</Card.Title>
        </Card.Header>
        <Card.Content>
          <RadioGroup.Root
            value={c.visibility}
            class="gap-3"
            onValueChange={(picked) => {
              const level = levelOf(picked)
              if (level !== undefined) void client.update(c, { visibility: level })
            }}
          >
            {#each LEVELS as level (level.id)}
              <div class="flex items-start gap-3">
                <RadioGroup.Item id="{c._id}-{level.id}" value={level.id} aria-describedby="{c._id}-{level.id}-hint" class="mt-0.5" />
                <div class="grid gap-1">
                  <FieldLabel for="{c._id}-{level.id}" class="font-normal">
                    <svelte:component this={level.icon} class="size-4 text-muted-foreground" />
                    <Label label={level.label} />
                  </FieldLabel>
                  <p id="{c._id}-{level.id}-hint" class="m-0 text-sm text-muted-foreground"><Label label={level.hint} /></p>
                </div>
              </div>
            {/each}
          </RadioGroup.Root>
          <Separator class="my-4" />
          <div class="grid gap-3">
            <div class="grid gap-1">
              <h3 class="m-0 text-sm font-medium">{t('DefaultReminders')}</h3>
              <p class="m-0 text-sm text-muted-foreground">{t('DefaultRemindersHint')}</p>
            </div>
            {#each KINDS as kind (kind.label)}
              {@const current = currentReminder(c, kind.isAllDay)}
              <div class="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel for="{c._id}-reminder-{kind.label}" class="font-normal">{t(kind.label)}</FieldLabel>
                <Select.Root type="single" value={valueOf(current)} onValueChange={(picked) => { setReminder(c, kind.isAllDay, picked) }}>
                  <Select.Trigger id="{c._id}-reminder-{kind.label}" class="w-44">{reminderText(current)}</Select.Trigger>
                  <Select.Content>
                    {#each choicesFor(kind.presets, current) as ms (ms)}
                      <Select.Item value={valueOf(ms)} label={reminderText(ms)} />
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            {/each}
          </div>
          {#if c._id === durationCalendar}
            {@const duration = defaultDuration(c)}
            <Separator class="my-4" />
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="grid gap-1">
                <FieldLabel for="{c._id}-duration" class="font-medium">{t('DefaultDuration')}</FieldLabel>
                <p class="m-0 text-sm text-muted-foreground">{t('DefaultDurationHint')}</p>
              </div>
              <Select.Root type="single" value={String(duration)} onValueChange={(picked) => { setDuration(c, picked) }}>
                <Select.Trigger id="{c._id}-duration" class="w-44">{durationText(duration, lang)}</Select.Trigger>
                <Select.Content>
                  {#each DURATION_CHOICES as ms (ms)}
                    <Select.Item value={String(ms)} label={durationText(ms, lang)} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/each}
  {/if}
</div>
