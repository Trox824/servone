<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { CalendarDate, type DateValue } from '@internationalized/date'
  import { CalendarDays } from '@lucide/svelte'
  import { buttonVariants } from '../../../../../lib/components/ui/button'
  import * as Popover from '../../../../../lib/components/ui/popover'
  import { Calendar, Day } from '../../../../../lib/components/ui/calendar'
  import type { LeaveDay } from '../../../../../lib/leave'
  import { cn } from '../../../../../lib/utils'
  import { dateWithWeekday } from '../../lib/format'
  import type { Lang } from '../../lib/types'

  export let id: string
  export let value: number
  export let lang: Lang
  export let firstDayOfWeek: number
  export let disabled = false
  export let min: number | undefined = undefined
  export let holidays: Array<{ date: LeaveDay, title: string }> | undefined = undefined
  export let rangeStart: number | undefined = undefined
  export let rangeEnd: number | undefined = undefined

  const dispatch = createEventDispatcher<{ change: number }>()
  const WEEK_STARTS = [0, 1, 2, 3, 4, 5, 6] as const

  let open = false

  const toCalendarDate = (ts: number): CalendarDate => {
    const d = new Date(ts)
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }

  const timeOf = (date: DateValue): number => new Date(date.year, date.month - 1, date.day).getTime()

  function pick (picked: DateValue | undefined): void {
    if (picked === undefined) return
    open = false
    dispatch('change', timeOf(picked))
  }

  $: selected = toCalendarDate(value)
  $: holidayTitles = new Map((holidays ?? []).map((holiday) => [new Date(holiday.date.year, holiday.date.month, holiday.date.day).getTime(), holiday.title]))
  $: isWeekend = (date: DateValue): boolean => holidays !== undefined && [0, 6].includes(new Date(timeOf(date)).getDay())
  $: rangeLow = Math.min(rangeStart ?? timeOf(selected), timeOf(selected))
  $: rangeHigh = Math.max(rangeEnd ?? timeOf(selected), timeOf(selected))
  $: isInRange = (date: DateValue): boolean => rangeLow < rangeHigh && rangeLow <= timeOf(date) && timeOf(date) <= rangeHigh
  $: weekStartsOn = WEEK_STARTS[((firstDayOfWeek % 7) + 7) % 7]
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    {id}
    {disabled}
    class={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start bg-transparent font-normal tabular-nums')}
  >
    <CalendarDays class="text-muted-foreground" />
    {dateWithWeekday(value, lang)}
  </Popover.Trigger>
  <Popover.Content class="w-auto p-0" align="start">
    <Calendar
      type="single"
      value={selected}
      placeholder={selected}
      onValueChange={pick}
      preventDeselect
      locale={lang === 'vi' ? 'vi-VN' : 'en-US'}
      weekdayFormat="narrow"
      {weekStartsOn}
      minValue={min === undefined ? undefined : toCalendarDate(min)}
    >
      {#snippet day({ day: date })}
        {@const holidayTitle = holidayTitles.get(timeOf(date))}
        {@const isDayOff = isWeekend(date) || holidayTitle !== undefined}
        <!-- One band per week row: square inside, rounded at the range ends and row edges. Days off stay paler so they don't read as counted. -->
        <Day
          title={holidayTitle}
          class={cn(
            'relative',
            isDayOff && 'not-data-selected:text-muted-foreground',
            isInRange(date) && 'rounded-none [:first-child>&]:rounded-s-(--cell-radius) [:last-child>&]:rounded-e-(--cell-radius)',
            isInRange(date) && (isDayOff ? 'not-data-selected:bg-primary/5' : 'not-data-selected:bg-primary/15 not-data-selected:text-foreground'),
            timeOf(date) === rangeLow && 'rounded-s-(--cell-radius)',
            timeOf(date) === rangeHigh && 'rounded-e-(--cell-radius)'
          )}
        >
          {date.day}
          {#if holidayTitle !== undefined}
            <span class="absolute bottom-1 size-1 rounded-full bg-primary in-data-selected:bg-primary-foreground" aria-hidden="true"></span>
            <span class="sr-only">{holidayTitle}</span>
          {/if}
        </Day>
      {/snippet}
    </Calendar>
  </Popover.Content>
</Popover.Root>
