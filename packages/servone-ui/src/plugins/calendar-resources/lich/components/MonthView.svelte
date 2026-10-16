<script lang="ts">
  import { createEventDispatcher, getContext } from 'svelte'
  import type { Event } from '@hcengineering/calendar'
  import { deviceOptionsStore as deviceInfo, Label } from '@hcengineering/ui'
  import { ChevronRight } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { LICH_CONTEXT, type LichContext } from '../context'
  import { str } from '../plugin'
  import { textOf } from '../strings'
  import { agendaDays } from '../lib/agenda'
  import { dayHeading, timeRange } from '../lib/format'
  import { monthCells } from '../lib/month'
  import { startOfDay } from '../lib/time'
  import type { Lang } from '../lib/types'
  import EventChip from './EventChip.svelte'

  export let events: Event[]
  export let anchor: number
  export let firstDayOfWeek: number
  export let lang: Lang

  const dispatch = createEventDispatcher<{ open: { event: Event, target: HTMLElement }, create: CreateAt, day: number, select: number }>()
  const { cardOf } = getContext<LichContext>(LICH_CONTEXT)
  interface CreateAt { day: number, x: number, y: number }

  function createAt (day: number, e: MouseEvent & { currentTarget: HTMLElement }): void {
    if (e.detail > 0) {
      dispatch('create', { day, x: e.clientX, y: e.clientY })
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    dispatch('create', { day, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }

  const WEEKDAYS = { vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
  $: headings = Array.from({ length: 7 }, (_, i) => WEEKDAYS[lang][(i + firstDayOfWeek) % 7])
  $: cells = monthCells(anchor, events, firstDayOfWeek, Date.now())
  $: t = textOf(lang)
  $: fullDate = (day: number): string => new Date(day).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'full' })
  $: selectedDay = startOfDay(anchor)
  $: selectedEvents = agendaDays(events, selectedDay, 1)[0]?.events ?? []

  function tapDay (day: number): void {
    dispatch(day === selectedDay ? 'day' : 'select', day)
  }
</script>

{#if $deviceInfo.isMobile}
  <div class="flex min-h-full flex-col">
    <div class="grid shrink-0 grid-cols-7 border-b border-border">
      {#each headings as heading}
        <div class="py-1.5 text-center text-xs font-medium text-muted-foreground">{heading}</div>
      {/each}
    </div>
    <div class="grid shrink-0 grid-cols-7 border-b border-border">
      {#each cells as cell (cell.day)}
        <button
          type="button"
          class="flex h-12 min-w-0 flex-col items-center justify-start gap-0.5 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {cell.inMonth ? '' : 'opacity-50'}"
          aria-pressed={cell.day === selectedDay}
          aria-label={fullDate(cell.day)}
          aria-current={cell.isToday ? 'date' : undefined}
          on:click={() => { tapDay(cell.day) }}
        >
          <span
            class="inline-grid size-7 place-items-center rounded-full text-sm tabular-nums {cell.isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground'} {cell.day === selectedDay && !cell.isToday ? 'ring-2 ring-primary' : ''}"
          >{new Date(cell.day).getDate()}</span>
          <span class="flex h-1 gap-0.5">
            {#each cell.shown as e (e._id)}
              <span class="size-1 rounded-full" style:background={$cardOf(e).color}></span>
            {/each}
          </span>
        </button>
      {/each}
    </div>
    <section class="grid content-start gap-0.5 p-2">
      <button
        type="button"
        class="flex h-9 items-center justify-between rounded-lg px-2 max-[480px]:h-11 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="{t('OpenDay')}: {dayHeading(selectedDay, lang)}"
        on:click={() => { dispatch('day', selectedDay) }}
      >
        {dayHeading(selectedDay, lang)}
        <ChevronRight class="size-4 text-muted-foreground" aria-hidden="true" />
      </button>
      {#each selectedEvents as e (e._id)}
        {@const look = $cardOf(e)}
        <button
          type="button"
          class="grid h-11 w-full grid-cols-[5.5rem_1fr] items-center justify-items-start gap-2 rounded-lg px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring {look.isDeclined ? 'opacity-60' : ''}"
          on:click|stopPropagation={(ev) => { dispatch('open', { event: e, target: ev.currentTarget }) }}
        >
          <span class="text-xs tabular-nums text-muted-foreground">{timeRange(e, lang)}</span>
          <span class="flex min-w-0 items-center gap-2">
            <span class="size-2 shrink-0 rounded-full border" style:border-color={look.color} style:background={look.isFree ? 'transparent' : look.color}></span>
            <span class="truncate font-medium {look.isDeclined ? 'line-through' : ''}">{look.mask === 'full' ? e.title : t('Busy')}</span>
          </span>
        </button>
      {:else}
        <p class="m-0 px-2 py-3 text-sm text-muted-foreground">{t('NothingThisDay')}</p>
      {/each}
    </section>
  </div>
{:else}
<div class="grid min-h-full grid-cols-7 grid-rows-[auto_repeat(6,1fr)]">
  {#each headings as heading}
    <div class="border-b border-r border-border bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground">{heading}</div>
  {/each}
  {#each cells as cell (cell.day)}
    <div class="relative flex min-h-24 min-w-0 flex-col gap-0.5 border-b border-r border-border p-1 {!cell.inMonth ? 'bg-muted/50' : cell.isWeekend ? 'bg-muted/20' : ''}">
      <button
        type="button"
        class="absolute inset-0 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        on:click={(e) => { createAt(cell.day, e) }}
      ><span class="sr-only"><Label label={str.NewEvent} />, {fullDate(cell.day)}</span></button>
      <span
        class="relative z-[1] inline-grid size-6 place-items-center rounded-full text-xs tabular-nums {cell.isToday ? 'bg-primary font-semibold text-primary-foreground' : cell.inMonth ? 'text-foreground' : 'text-muted-foreground'}"
        aria-current={cell.isToday ? 'date' : undefined}
      >{new Date(cell.day).getDate()}</span>
      {#each cell.shown as e (e._id)}
        <EventChip event={e} {lang} withTime={!e.allDay} on:open />
      {/each}
      {#if cell.more > 0}
        <Button variant="ghost" size="xs" class="relative z-[1] self-start text-muted-foreground" onclick={() => { dispatch('day', cell.day) }}>
          <Label label={str.More} params={{ count: cell.more }} />
        </Button>
      {/if}
    </div>
  {/each}
</div>
{/if}
