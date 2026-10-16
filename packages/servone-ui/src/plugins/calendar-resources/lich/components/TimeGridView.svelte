<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Event } from '@hcengineering/calendar'
  import DayCalendar from '../../components/DayCalendar.svelte'

  export let events: Event[]
  export let anchor: number
  export let days: 1 | 3 | 7

  const dispatch = createEventDispatcher<{ create: { date: number, end?: number, withTime: boolean } }>()
  $: current = new Date(anchor)

  const WORKDAY_START_HOUR = 8
  const MIN_COLUMN_PX = 100 // 3 columns beside the 56px time gutter on a 390px phone
  const CELL_HEIGHT_REM = 4 // DayCalendar's cellHeight is 4 * fontSize
  const LABEL_CLEARANCE_CELLS = 0.5 // hour labels are centred on the hour line
  let calendar: DayCalendar | undefined
  let anchorEl: HTMLElement

  function scrollToStart (): void {
    const now = new Date()
    const startHour = Math.min(now.getHours() + now.getMinutes() / 60 - 1, WORKDAY_START_HOUR)
    const cellPx = CELL_HEIGHT_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
    anchorEl.parentElement?.querySelector('.scroll')?.scrollTo({ top: Math.max(startHour - LABEL_CLEARANCE_CELLS, 0) * cellPx })
  }
  $: if (calendar !== undefined) requestAnimationFrame(scrollToStart)

  function create (e: CustomEvent<{ date: Date, dueDate?: number, withTime: boolean }>): void {
    const { date, dueDate, withTime } = e.detail
    dispatch('create', dueDate === undefined ? { date: date.getTime(), withTime } : { date: date.getTime(), end: dueDate, withTime })
  }
</script>

<!-- DayCalendar measures column width only on mount, so a Day/Week switch needs a fresh instance. -->
<span bind:this={anchorEl} class="hidden"></span>
{#key days}
  <DayCalendar
    bind:this={calendar}
    {events}
    selectedDate={current}
    currentDate={current}
    displayedDaysCount={days}
    startFromWeekStart={days === 7}
    minColumnWidth={MIN_COLUMN_PX}
    weekFormat="short"
    on:create={create}
  />
{/key}
