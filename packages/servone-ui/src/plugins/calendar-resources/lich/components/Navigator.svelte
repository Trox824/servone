<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { CalendarDate, getLocalTimeZone, type DateValue } from '@internationalized/date'
  import { DoorOpen, Settings2, Share2 } from '@lucide/svelte'
  import contact, { formatName, type Employee } from '@hcengineering/contact'
  import { getClient, createQuery } from '@hcengineering/presentation'
  import { getCurrentAccount } from '@hcengineering/core'
  import { Calendar } from '../../../../lib/components/ui/calendar'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import { Label } from '../../../../lib/components/ui/label'
  import { Button, buttonVariants } from '../../../../lib/components/ui/button'
  import * as Popover from '../../../../lib/components/ui/popover'
    import { Switch } from '../../../../lib/components/ui/switch'
  import { calendarStore } from '../../utils'
  import { textOf } from '../strings'
  import { overlayColor } from '../context'
  import type { Lang } from '../lib/types'
  import LeaveBalance from './LeaveBalance.svelte'
  import OffToday from './OffToday.svelte'
  import StandIn from './StandIn.svelte'

  export let anchor: number
  export let lang: Lang
  export let firstDayOfWeek: number
  export let overlay: string[]
  export let showDeclined: boolean
  export let isRoomsOpen: boolean

  const dispatch = createEventDispatcher<{ pick: number, sharing: undefined, showDeclined: boolean, rooms: undefined }>()
  const client = getClient()
  const mySocial = new Set<string>(getCurrentAccount().socialIds)
  const WEEK_STARTS = [0, 1, 2, 3, 4, 5, 6] as const

  $: t = textOf(lang)
  $: mine = $calendarStore.filter((c) => mySocial.has(c.user))
  $: selectedDay = dayOf(anchor)
  $: weekStartsOn = WEEK_STARTS[firstDayOfWeek % 7]
  $: weekdayFormat = lang === 'vi' ? 'narrow' : 'short'

  let colleagues: Employee[] = []
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => { colleagues = found })
  $: overlayRows = overlay.flatMap((id, index) => {
    const person = colleagues.find((c) => c._id === id)
    return person === undefined ? [] : [{ id, name: formatName(person.name), color: overlayColor(index) }]
  })

  function dayOf (ts: number): CalendarDate {
    const d = new Date(ts)
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }
  function pick (day: DateValue | undefined): void {
    if (day !== undefined) dispatch('pick', day.toDate(getLocalTimeZone()).getTime())
  }
</script>

<nav class="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-3">
  <Calendar
    type="single"
    value={selectedDay}
    placeholder={selectedDay}
    onValueChange={pick}
    preventDeselect
    {weekStartsOn}
    {weekdayFormat}
    locale={lang === 'vi' ? 'vi-VN' : 'en-US'}
    class="mx-auto p-0 [--cell-size:--spacing(8)]"
  />
  <section class="grid gap-1">
    <div class="flex h-7 items-center justify-between gap-2 px-2">
      <h3 class="m-0 text-xs font-medium text-muted-foreground">{t('MyCalendars')}</h3>
      <Popover.Root>
        <Popover.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={t('CalendarSettings')} title={t('CalendarSettings')}>
          <Settings2 class="size-3.5 text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Content align="end" class="w-60 gap-1 p-2">
          <div class="flex h-8 items-center gap-2 px-2">
            <Label for="lich-show-declined" class="min-w-0 flex-1 font-normal">{t('ShowDeclined')}</Label>
            <Switch id="lich-show-declined" checked={showDeclined} onCheckedChange={(isShown) => { dispatch('showDeclined', isShown) }} />
          </div>
          <Button variant="ghost" class="w-full justify-start" onclick={() => { dispatch('sharing') }}><Share2 />{t('Sharing')}</Button>
        </Popover.Content>
      </Popover.Root>
    </div>
    {#each mine as c (c._id)}
      <div class="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-muted">
        <Checkbox id="lich-cal-{c._id}" checked={!c.hidden} onCheckedChange={() => { void client.update(c, { hidden: !c.hidden }) }} />
        <Label for="lich-cal-{c._id}" class="min-w-0 flex-1 truncate font-normal">{c.name}</Label>
      </div>
    {/each}
  </section>
  <Button variant={isRoomsOpen ? 'secondary' : 'ghost'} class="justify-start" aria-current={isRoomsOpen ? 'page' : undefined} onclick={() => { dispatch('rooms') }}><DoorOpen />{t('Rooms')}</Button>
  {#if overlayRows.length > 0}
    <section class="grid gap-1">
      <h3 class="m-0 px-2 pb-1 text-xs font-medium text-muted-foreground">{t('OtherCalendars')}</h3>
      {#each overlayRows as row (row.id)}
        <div class="flex h-8 items-center gap-2 px-2 text-sm">
          <span class="size-2.5 shrink-0 rounded-full" style:background-color={row.color}></span>
          <span class="min-w-0 flex-1 truncate">{row.name}</span>
        </div>
      {/each}
    </section>
  {/if}
  <section class="grid gap-3 border-t border-border pt-3">
    <LeaveBalance {lang} {anchor} {firstDayOfWeek} />
    <StandIn {lang} {firstDayOfWeek} />
    <OffToday {lang} />
  </section>
</nav>
