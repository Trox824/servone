<script lang="ts">
  import calendar, { getAllEvents, type Event, type ReccuringEvent } from '@hcengineering/calendar'
  import { formatName, type Person } from '@hcengineering/contact'
  import type { PersonId, Ref } from '@hcengineering/core'
  import { createEventDispatcher } from 'svelte'
  import { createQuery } from '@hcengineering/presentation'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import { CircleCheck, TriangleAlert } from '@lucide/svelte'
  import * as Alert from '../../../../lib/components/ui/alert'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import { blocksTime, busyBlocks, overlaps } from '../lib/busy'
  import { seriesId } from '../lib/rsvp'
  import { addDays } from '../lib/time'
  import type { Lang, Slot } from '../lib/types'
  import { textOf } from '../strings'
  import { copyFor } from './fields/copy'
  import { SLOT_MINUTES } from './fields/time-slots'
  import PersonAvatar from './PersonAvatar.svelte'

  export let guests: Array<Ref<Person>>
  export let day: number
  export let slot: Slot
  export let personToSocial: Map<string, PersonId[]>
  export let editedEventId: string | undefined
  export let lang: Lang

  const WORK_FROM_HOUR = 7
  const WORK_TO_HOUR = 20
  const TICK_HOURS = [0, 4, 8, 12, 16, 20, 24]
  const HOUR_MS = 60 * 60 * 1000
  const SLOT_MS = SLOT_MINUTES * 60 * 1000

  const dispatch = createEventDispatcher<{ pick: number }>()

  let single: Event[] = []
  let series: ReccuringEvent[] = []
  let isSingleLoaded = false
  let isSeriesLoaded = false
  const singleQuery = createQuery()
  const seriesQuery = createQuery()
  $: users = guests.flatMap((g) => personToSocial.get(g) ?? [])
  $: from = addDays(day, -1)
  $: to = addDays(day, 2)
  $: singleQuery.query(calendar.class.Event, { user: { $in: users }, date: { $lt: to }, dueDate: { $gt: from } }, (events) => {
    single = events
    isSingleLoaded = true
  })
  $: seriesQuery.query(calendar.class.ReccuringEvent, { user: { $in: users } }, (events) => {
    series = events
    isSeriesLoaded = true
  })
  $: isLoaded = isSingleLoaded && isSeriesLoaded
  $: rawEvents = [...single, ...series]
  $: onDay = getAllEvents([...single.filter((e) => e._class !== calendar.class.ReccuringEvent), ...series], from, to).filter(
    (e) => seriesId(e) !== editedEventId && blocksTime(e, rawEvents)
  )
  $: rows = guests.map((g) => {
    const ids = new Set<string>(personToSocial.get(g) ?? [])
    const blocks = busyBlocks(onDay.filter((e) => ids.has(e.user)), day)
    return { person: g, blocks, isBusy: overlaps(slot, blocks) }
  })
  $: busyRows = rows.filter((r) => r.isBusy)
  $: fromHour = Math.max(0, Math.min(WORK_FROM_HOUR, Math.floor((slot.start - day) / HOUR_MS)))
  $: toHour = Math.min(24, Math.max(WORK_TO_HOUR, Math.ceil((slot.end - day) / HOUR_MS)))
  $: ticks = TICK_HOURS.filter((hour) => hour > fromHour && hour <= toHour)
  $: gridStart = day + fromHour * HOUR_MS
  $: gridSpan = (toHour - fromHour) * HOUR_MS
  $: pct = (ts: number): number => Math.min(100, Math.max(0, ((ts - gridStart) / gridSpan) * 100))
  $: tickPct = (hour: number): number => ((hour - fromHour) / (toHour - fromHour)) * 100
  $: t = copyFor(lang)
  $: text = textOf(lang)

  function pickAt (e: MouseEvent & { currentTarget: HTMLDivElement }): void {
    const bounds = e.currentTarget.getBoundingClientRect()
    const at = gridStart + ((e.clientX - bounds.left) / bounds.width) * gridSpan - (slot.end - slot.start) / 2
    dispatch('pick', Math.max(day, Math.round(at / SLOT_MS) * SLOT_MS))
  }
  $: people = getPersonByPersonRefStore(guests)
  $: nameOf = (person: Ref<Person>): string => {
    const found = $people.get(person)
    return found === undefined ? '' : formatName(found.name)
  }
</script>

<section class="grid gap-3" aria-label={t('findTime')}>
  <div class="grid gap-2">
    <div class="grid grid-cols-[6rem_1fr] items-end gap-3 sm:grid-cols-[9rem_1fr]" aria-hidden="true">
      <span></span>
      <div class="relative h-4 text-xs tabular-nums text-muted-foreground">
        {#each ticks as hour (hour)}
          <span
            class="absolute top-0 {hour === toHour ? '-translate-x-full' : '-translate-x-1/2'}"
            style:left="{tickPct(hour)}%">{hour}h</span
          >
        {/each}
      </div>
    </div>
    {#each rows as row (row.person)}
      <div class="grid grid-cols-[6rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]">
        <div class="flex min-w-0 items-center gap-2">
          <PersonAvatar person={row.person} />
          <span class="truncate text-sm">{nameOf(row.person)}</span>
        </div>
        {#if isLoaded}
          <!-- Dark --muted equals the dialog surface, so the track and ticks tint the foreground to stay visible in both themes. -->
          <!-- Pointer shortcut only; keyboard users set the same time with the start-time select. -->
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="relative h-6 cursor-pointer overflow-hidden rounded-md bg-foreground/5 hover:bg-foreground/[0.08]" aria-hidden="true" on:click={pickAt}>
            {#each ticks as hour (hour)}
              <span class="absolute inset-y-0 w-px bg-foreground/10" style:left="{tickPct(hour)}%"></span>
            {/each}
            {#each row.blocks as block}
              <span class="absolute inset-y-0.5 rounded-sm bg-muted-foreground/60" style:left="{pct(block.start)}%" style:width="{pct(block.end) - pct(block.start)}%"></span>
            {/each}
            <span
              class="absolute inset-y-0 rounded-md border-2 {row.isBusy ? 'border-destructive bg-destructive/10' : 'border-primary bg-primary/10'}"
              style:left="{pct(slot.start)}%"
              style:width="{Math.max(1, pct(slot.end) - pct(slot.start))}%"
            ></span>
          </div>
        {:else}
          <Skeleton class="h-6 w-full" />
        {/if}
      </div>
    {/each}
  </div>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5"><span class="size-3 rounded-sm bg-muted-foreground/60"></span>{t('busy')}</span>
    <span class="flex items-center gap-1.5"><span class="size-3 rounded-sm border-2 border-primary bg-primary/10"></span>{t('selected')}</span>
    <span class="ml-auto">{text('FindTimePickHint')}</span>
  </div>
  {#if isLoaded}
    {#if busyRows.length > 0}
      <Alert.Root variant="destructive">
        <TriangleAlert />
        <Alert.Description>
          {busyRows.map((r) => t('busyThen', { name: nameOf(r.person) })).join('. ')}
        </Alert.Description>
      </Alert.Root>
    {:else}
      <p class="m-0 flex items-center gap-1.5 text-sm text-muted-foreground"><CircleCheck class="size-4" />{t('allFree')}</p>
    {/if}
  {/if}
</section>
