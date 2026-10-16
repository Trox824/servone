<script lang="ts">
  import { createEventDispatcher, getContext, onDestroy, onMount, setContext, tick } from 'svelte'
  import { derived } from 'svelte/store'
  import calendar, { AccessLevel, getAllEvents, type Event } from '@hcengineering/calendar'
  import contact, { formatName, type Employee } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { CalendarX, DoorOpen, Plus, Users } from '@lucide/svelte'
  import {
    BOOKING_RESOURCE_ATTR,
    RESOURCE_CLASS,
    type BookableResource,
    type BookingEvent,
    type Interval
  } from '@servone/approvals/src/booking'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import * as Empty from '../../../../lib/components/ui/empty'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import EventElement from '../../components/EventElement.svelte'
  import { LICH_CONTEXT, type LichContext } from '../context'
  import { ensureResourceClass } from '../setup'
  import { textOf } from '../strings'
  import { dayHeading, timeRange } from '../lib/format'
  import { maskOf } from '../lib/mask'
  import { addDays, HOUR_MS, startOfDay } from '../lib/time'
  import { AGENDA_DAYS } from '../lib/view'
  import type { Lang, Visibility } from '../lib/types'
  import { addSampleResources, canManageResources } from './api'
  import { blocksOf, columnsOf, draftSlotOf, dragSlot, DRAG_STEP_MS, packLanes, type Block, type TypeFilter } from './grid'
  import { bookingLook, type BookingLook } from './state'
  import { resourceTextOf } from './strings'
  import ResourceSettings, { ICONS } from './ResourceSettings.svelte'
  import RoomTools from './RoomTools.svelte'

  export let anchor: number
  export let lang: Lang
  export let isMine: (socialId: string) => boolean
  export let personOf: (socialId: string) => string | undefined
  export let calendarVisibility: (calendarId: string) => Visibility | undefined
  export let filter: TypeFilter
  export let isMineOnly: boolean
  export let isManaging: boolean

  type Booking = Event & BookingEvent

  const MINUTE_MS = 60 * 1000
  const DAY_HOURS = 24
  const OPEN_HOUR = 8
  const OPEN_HOURS = 10
  const HEADER_REM = 3
  const MIN_HOUR_REM = 2
  const DAY_VIEW_HOUR_REM = 4
  const NEUTRAL_COLOR = 'var(--muted-foreground)'
  const dispatch = createEventDispatcher<{ open: { event: Event, target: HTMLElement }, book: { slot: Interval, resource: Ref<BookableResource> } }>()
  const lich = getContext<LichContext>(LICH_CONTEXT)
  setContext<LichContext>(LICH_CONTEXT, {
    openEvent: lich.openEvent,
    cardOf: derived(lich.cardOf, (cardOf) => (e: Event) => {
      const look = cardOf(e)
      return isMine(e.user) ? look : { ...look, color: NEUTRAL_COLOR }
    })
  })
  const client = getClient()
  const canManage = canManageResources()

  $: t = resourceTextOf(lang)
  $: lichText = textOf(lang)

  let resources: BookableResource[] = []
  let isLoaded = false
  const resourcesQuery = createQuery()
  async function loadResources (): Promise<void> {
    try {
      if (canManage) await ensureResourceClass(client)
    } finally {
      if (!client.getHierarchy().hasClass(RESOURCE_CLASS)) isLoaded = true
    }
    if (!client.getHierarchy().hasClass(RESOURCE_CLASS)) return
    resourcesQuery.query(RESOURCE_CLASS, {}, (found) => {
      resources = found
      isLoaded = true
    })
  }

  let bookingDocs: Booking[] = []
  let instanceDocs: Booking[] = []
  let isBookingsLoaded = false
  createQuery().query(calendar.class.Event, { [BOOKING_RESOURCE_ATTR]: { $exists: true }, access: AccessLevel.Owner }, (found) => {
    bookingDocs = found
    isBookingsLoaded = true
  })
  $: seriesIds = bookingDocs.filter((e) => e._class === calendar.class.ReccuringEvent).map((e) => e.eventId)
  const instancesQuery = createQuery()
  $: instancesQuery.query(calendar.class.ReccuringInstance, { recurringEventId: { $in: seriesIds }, access: AccessLevel.Owner }, (found) => { instanceDocs = found })
  $: docs = [...new Map([...bookingDocs, ...instanceDocs].map((e) => [e._id, e])).values()]

  let employees: Employee[] = []
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => { employees = found })
  $: names = new Map<string, string>(employees.map((employee) => [employee._id, formatName(employee.name)]))
  $: bookerOf = (e: Event): string => names.get(personOf(e.user) ?? '') ?? ''

  let now = Date.now()
  const clock = setInterval(() => { now = Date.now() }, MINUTE_MS)
  onDestroy(() => { clearInterval(clock) })
  onMount(() => { void loadResources() })

  $: day = startOfDay(anchor)
  $: dayWindow = { start: day, end: addDays(day, 1) }
  $: active = resources.filter((resource) => !resource.archived)
  $: columns = columnsOf(resources, filter, lang)
  $: blocksByResource = new Map(columns.map((resource) => [resource._id, blocksOf(docs, resource._id, dayWindow)]))
  $: hours = Array.from({ length: DAY_HOURS - 1 }, (_, i) => day + (i + 1) * HOUR_MS)
  $: isNowShown = now >= day && now < dayWindow.end
  $: earliest = Math.floor(now / DRAG_STEP_MS) * DRAG_STEP_MS

  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize)
  let viewportHeight = 0
  $: hourPx = Math.min(DAY_VIEW_HOUR_REM * remPx, Math.max(MIN_HOUR_REM * remPx, (viewportHeight - HEADER_REM * remPx) / OPEN_HOURS))
  const topOf = (ts: number): number => ((ts - day) / HOUR_MS) * hourPx
  const zone = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(Date.now()).find((part) => part.type === 'timeZoneName')?.value ?? ''

  let scroller: HTMLDivElement
  function openAtWorkday (_node: HTMLElement, px: number): { update: (px: number) => void } {
    let isDone = false
    const scroll = (latest: number): void => {
      if (isDone || latest === 0) return
      scroller.scrollTop = OPEN_HOUR * latest
      isDone = true
    }
    scroll(px)
    return { update: scroll }
  }
  let columnWidths: number[] = []

  const clockOf = (ts: number): string => new Date(ts).toTimeString().slice(0, 5)
  const spanText = (span: Interval): string => `${clockOf(span.start)}–${clockOf(span.end)}`

  $: titleOf = (e: Event): string => (maskOf(e, calendarVisibility, isMine) === 'full' ? e.title : lichText('Busy'))

  function occurrenceOf (block: Block<Booking>): Event {
    if (block.event._class !== calendar.class.ReccuringEvent) return block.event
    const series = docs.filter((e) => e.eventId === block.event.eventId || e.recurringEventId === block.event.eventId)
    return getAllEvents(series, block.start, block.end).find((e) => e.date === block.start) ?? block.event
  }

  interface Drag { resource: Ref<BookableResource>, pressedAt: number, isMoved: boolean, selection: Interval | undefined }
  let drag: Drag | undefined

  function timeAt (e: PointerEvent, column: HTMLElement): number {
    return day + ((e.clientY - column.getBoundingClientRect().top) / hourPx) * HOUR_MS
  }

  function press (e: PointerEvent, resource: Ref<BookableResource>): void {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.event-container') !== null) return
    const column = e.currentTarget as HTMLElement
    const pressedAt = timeAt(e, column)
    const selection = dragSlot(pressedAt, pressedAt, blocksByResource.get(resource) ?? [], earliest)
    if (selection === undefined) return
    if (e.pointerType === 'mouse') {
      e.preventDefault()
      column.setPointerCapture(e.pointerId)
    }
    drag = { resource, pressedAt, isMoved: false, selection }
  }

  function move (e: PointerEvent): void {
    if (drag === undefined || e.pointerType !== 'mouse') return
    const selection = dragSlot(drag.pressedAt, timeAt(e, e.currentTarget as HTMLElement), blocksByResource.get(drag.resource) ?? [], earliest)
    drag = { ...drag, selection, isMoved: drag.isMoved || selection?.start !== drag.selection?.start || selection?.end !== drag.selection?.end }
  }

  function release (): void {
    if (drag?.selection === undefined) {
      drag = undefined
      return
    }
    const { resource, selection, isMoved } = drag
    drag = undefined
    dispatch('book', { slot: isMoved ? selection : draftSlotOf(selection, blocksByResource.get(resource) ?? []), resource })
  }

  function myBookingsFrom (list: Booking[], from: number): Array<{ event: Booking, look: BookingLook }> {
    const expanded: Booking[] = getAllEvents(list.filter((e) => isMine(e.user)), from, addDays(from, AGENDA_DAYS))
    return expanded.flatMap((e) => {
      const look = bookingLook(e)
      return look === undefined ? [] : [{ event: e, look }]
    })
  }
  $: myRows = myBookingsFrom(docs, day)
  $: resourceById = new Map<string, BookableResource>(resources.map((resource) => [resource._id, resource]))

  let settings: ResourceSettings | undefined
  async function openAdd (): Promise<void> {
    isManaging = true
    await tick()
    settings?.openForm()
  }

  let isAddingSamples = false
  let isSamplesFailed = false
  async function addSamples (): Promise<void> {
    isAddingSamples = true
    isSamplesFailed = false
    try {
      await addSampleResources(client, resources)
    } catch (err) {
      isSamplesFailed = true
      throw err
    } finally {
      isAddingSamples = false
    }
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape') drag = undefined }} />

<div class="flex h-full min-h-0 flex-col">
  <div class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
    <RoomTools {lang} bind:filter bind:isMineOnly bind:isManaging />
  </div>
  <div bind:this={scroller} bind:clientHeight={viewportHeight} class="relative min-h-0 flex-1 overflow-auto">
    {#if !isLoaded || !isBookingsLoaded}
      <div class="grid gap-2 p-4">
        {#each [0, 1, 2, 3] as row (row)}<Skeleton class="h-10 w-full" />{/each}
      </div>
    {:else if isMineOnly}
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-0.5 p-4">
        {#each myRows as { event: e, look } (`${e._id}-${e.date}`)}
          {@const resource = resourceById.get(look.resource)}
          <button
            type="button"
            class="grid min-h-[52px] w-full grid-cols-[minmax(0,1fr)_auto] items-center sm:grid-cols-[6rem_6.5rem_1fr_auto] justify-items-start gap-3 rounded-lg border-0 bg-transparent px-3 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            on:click={(ev) => { dispatch('open', { event: e, target: ev.currentTarget }) }}
          >
            <span class="text-xs text-muted-foreground">{dayHeading(startOfDay(e.date), lang)}</span>
            <span class="text-xs tabular-nums text-muted-foreground">{timeRange(e, lang)}</span>
            <span class="grid min-w-0 gap-0.5">
              <span class="truncate font-medium {look.isVoid ? 'text-muted-foreground line-through' : ''}">{e.title}</span>
              <span class="truncate text-xs text-muted-foreground">{resource?.name ?? t('RemovedResource')}</span>
            </span>
            <Badge
              variant={look.state === 'confirmed' ? 'secondary' : look.state === 'rejected' ? 'destructive' : 'outline'}
              class="{look.isPending ? 'border-dashed border-muted-foreground' : ''} {look.state === 'expired' || look.state === 'cancelled' ? 'text-muted-foreground' : ''}"
            >{t(look.state)}</Badge>
          </button>
        {:else}
          <Empty.Root class="py-16">
            <Empty.Header>
              <Empty.Media variant="icon"><CalendarX /></Empty.Media>
              <Empty.Title>{t('NoMyBookings')}</Empty.Title>
            </Empty.Header>
          </Empty.Root>
        {/each}
      </div>
    {:else if active.length === 0}
      <Empty.Root class="border-0 py-24">
        <Empty.Header>
          <Empty.Media variant="icon"><DoorOpen /></Empty.Media>
          <Empty.Title>{canManage ? t('Empty') : t('NothingToBook')}</Empty.Title>
          {#if canManage}<p class="m-0 text-sm text-muted-foreground">{t('EmptyHint')}</p>{/if}
        </Empty.Header>
        {#if canManage}
          <Empty.Content>
            <div class="flex flex-wrap justify-center gap-2">
              <Button size="sm" disabled={isAddingSamples} title={t('SamplesHint')} onclick={() => { void addSamples() }}>{t('UseSamples')}</Button>
              <Button variant="outline" size="sm" onclick={() => { void openAdd() }}><Plus />{t('Add')}</Button>
            </div>
            {#if isSamplesFailed}<p class="m-0 text-sm text-destructive" role="alert">{t('SaveFailed')}</p>{/if}
          </Empty.Content>
        {/if}
      </Empty.Root>
    {:else if columns.length === 0}
      <Empty.Root class="py-16">
        <Empty.Header>
          <Empty.Title>{t('NoneOfType')}</Empty.Title>
        </Empty.Header>
        <Empty.Content>
          <Button variant="outline" size="sm" onclick={() => { filter = 'all' }}>{t('ShowAll')}</Button>
        </Empty.Content>
      </Empty.Root>
    {:else}
      <div
        use:openAtWorkday={viewportHeight > 0 ? hourPx : 0}
        class="grid"
        style:grid-template-columns="3.5rem repeat({columns.length}, minmax(6rem, 1fr))"
        style:grid-template-rows="{HEADER_REM}rem {DAY_HOURS * hourPx}px"
        style:min-width="calc(3.5rem + {columns.length} * 6rem)"
      >
        <div class="sticky left-0 top-0 z-[4] flex items-end justify-end border-b border-border bg-background pb-1.5 pr-2 text-[0.6875rem] text-muted-foreground" style:grid-area="1 / 1">{zone}</div>
        {#each columns as resource, i (resource._id)}
          {@const description = [resource.name, t(resource.type), resource.capacity === undefined ? '' : t('People', { count: resource.capacity }), resource.needsApproval ? t('NeedsApproval') : ''].filter((part) => part !== '').join(' · ')}
          <div class="sticky top-0 z-[3] flex min-w-0 flex-col justify-center gap-0.5 border-b border-border bg-background px-2" style:grid-area="1 / {i + 2}" title={description}>
            <span class="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium">
              <svelte:component this={ICONS[resource.type]} class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="truncate">{resource.name}</span>
              <span class="sr-only">{t(resource.type)}</span>
            </span>
            <span class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {#if resource.capacity !== undefined}<Users class="size-3 shrink-0" aria-hidden="true" /><span class="tabular-nums">{resource.capacity}</span>{/if}
              {#if resource.needsApproval}<span class="truncate">{resource.capacity === undefined ? '' : '· '}{t('NeedsApproval')}</span>{/if}
            </span>
          </div>
        {/each}

        <div class="sticky left-0 z-[3] bg-background" style:grid-area="2 / 1" aria-hidden="true">
          {#each hours as hour (hour)}
            <span class="absolute right-2 -translate-y-1/2 text-[0.6875rem] tabular-nums text-muted-foreground" style:top="{topOf(hour)}px">{clockOf(hour)}</span>
          {/each}
          {#if isNowShown}
            <span class="absolute left-1 z-[1] -translate-y-1/2 rounded-sm bg-destructive px-1 text-[0.6875rem] font-medium leading-4 tabular-nums text-destructive-foreground" style:top="{topOf(now)}px">{clockOf(now)}</span>
          {/if}
        </div>

        {#each columns as resource, column (resource._id)}
          {@const blocks = blocksByResource.get(resource._id) ?? []}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="lich-resource-column relative border-l"
            style:grid-area="2 / {column + 2}"
            style:--hour="{hourPx}px"
            bind:clientWidth={columnWidths[column]}
            on:pointerdown={(e) => { press(e, resource._id) }}
            on:pointermove={move}
            on:pointerup={release}
            on:pointercancel={() => { drag = undefined }}
          >
            {#each packLanes(blocks) as block (`${block.event._id}-${block.start}`)}
              {@const occurrence = occurrenceOf(block)}
              <div
                class="absolute z-[1] flex"
                style:top="{topOf(block.start) + 1}px"
                style:height="{topOf(block.end) - topOf(block.start) - 2}px"
                style:left="calc({(block.lane / block.lanes) * 100}% + 2px)"
                style:width="calc({100 / block.lanes}% - 4px)"
                title={t('BookingAt', { title: titleOf(block.event), time: spanText(block), booker: bookerOf(block.event), state: t(block.event.servoneBookingState === 'pending' ? 'pending' : 'confirmed') })}
              >
                <EventElement event={occurrence} size={{ width: (columnWidths[column] ?? 0) / block.lanes - 4, height: topOf(block.end) - topOf(block.start) - 2 }} />
              </div>
            {/each}
            {#if drag?.resource === resource._id && drag.selection !== undefined && drag.isMoved}
              <div
                class="lich-drag-selection pointer-events-none absolute inset-x-0.5 z-[2] rounded px-1.5 py-0.5 text-xs tabular-nums"
                style:top="{topOf(drag.selection.start)}px"
                style:height="{topOf(drag.selection.end) - topOf(drag.selection.start)}px"
              >{spanText(drag.selection)}</div>
            {/if}
          </div>
        {/each}

        {#if isNowShown}
          <div class="pointer-events-none relative z-[2]" style:grid-area="2 / 2 / 3 / -1" aria-hidden="true">
            <div class="absolute inset-x-0 h-px bg-destructive" style:top="{topOf(now)}px"></div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<Dialog.Root open={isManaging} onOpenChange={(isOpen) => { isManaging = isOpen }}>
  {#if isManaging}
    <Dialog.Content class="top-[8vh] max-h-[84vh] translate-y-0 overflow-y-auto sm:max-w-xl">
      <ResourceSettings bind:this={settings} {lang} />
    </Dialog.Content>
  {/if}
</Dialog.Root>

<style>
  .lich-resource-column {
    border-left-color: color-mix(in oklch, var(--border) 70%, transparent);
    background-image: linear-gradient(to bottom, transparent calc(var(--hour) - 1px), color-mix(in oklch, var(--border) 70%, transparent) calc(var(--hour) - 1px));
    background-size: 100% var(--hour);
    user-select: none;
  }
  .lich-drag-selection {
    color: var(--primary-foreground);
    background-color: var(--primary);
    opacity: 0.85;
  }
</style>
