<script lang="ts">
  import { createEventDispatcher, getContext, onDestroy } from 'svelte'
  import type { Event } from '@hcengineering/calendar'
  import love from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { CalendarX, SearchX, Plus, Video } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import * as Empty from '../../../../lib/components/ui/empty'
  import { emptyCopy } from '../../../../onboarding/empty-copy'
  import { LICH_CONTEXT, type LichContext } from '../context'
  import { str } from '../plugin'
  import { agendaDays } from '../lib/agenda'
  import { dayHeading, timeRange } from '../lib/format'
  import { startOfDay } from '../lib/time'
  import type { Lang } from '../lib/types'

  export let events: Event[]
  export let from: number
  export let days: number
  export let lang: Lang
  export let search: string
  export let isLoading = false

  const SKELETON_ROWS = 6

  const dispatch = createEventDispatcher<{ open: { event: Event, target: HTMLElement }, more: undefined, create: number }>()
  const { cardOf } = getContext<LichContext>(LICH_CONTEXT)
  const hierarchy = getClient().getHierarchy()
  $: listed = agendaDays(events, from, days)
  $: today = startOfDay(Date.now())
  $: isSearching = search.trim() !== ''

  let loadMore: HTMLDivElement | undefined
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) dispatch('more')
  })
  $: if (loadMore !== undefined) observer.observe(loadMore)
  onDestroy(() => { observer.disconnect() })
</script>

<div class="mx-auto flex min-h-full w-full max-w-3xl flex-col p-4">
  {#if isLoading}
    <div class="grid gap-2">
      {#each Array.from({ length: SKELETON_ROWS }) as _}
        <div class="grid h-10 grid-cols-[7rem_1fr] items-center gap-3 px-3"><Skeleton class="h-3 w-20" /><Skeleton class="h-3 w-2/3" /></div>
      {/each}
    </div>
  {:else}
    {#each listed as agendaDay, i (agendaDay.day)}
      <section class="grid gap-0.5 {i > 0 ? 'mt-3 border-t border-border pt-3' : ''}">
        <h2 class="m-0 sticky top-0 z-[2] flex items-center gap-2 bg-background px-3 py-1 text-sm font-medium {agendaDay.day === today ? 'text-primary' : 'text-foreground'}">
          {dayHeading(agendaDay.day, lang)}
          {#if agendaDay.day === today}<Badge variant="secondary"><Label label={str.Today} /></Badge>{/if}
        </h2>
        {#each agendaDay.events as e (e._id)}
          {@const look = $cardOf(e)}
          {@const isDashed = look.answer === 'pending' || look.answer === 'tentative'}
          <!-- No title attribute: a masked colleague event must not leak its title through the tooltip. -->
          <button
            type="button"
            class="grid h-10 w-full grid-cols-[7rem_1fr] max-[480px]:h-11 items-center justify-items-start gap-3 rounded-lg border border-transparent px-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring {isDashed ? 'border-dashed' : ''} {look.isDeclined ? 'opacity-60' : ''}"
            style:border-color={isDashed || look.isFree ? look.color : undefined}
            on:click|stopPropagation={(ev) => { dispatch('open', { event: e, target: ev.currentTarget }) }}
          >
            <span class="text-xs tabular-nums text-muted-foreground">{timeRange(e, lang)}</span>
            <span class="flex min-w-0 items-center gap-2">
              <span class="size-2 shrink-0 rounded-full border" style:border-color={look.color} style:background={look.isFree ? 'transparent' : look.color}></span>
              {#if look.mask === 'full' && hierarchy.hasMixin(e, love.mixin.Meeting)}<Video class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
              <span class="truncate font-medium {look.isDeclined ? 'line-through' : ''}">{#if look.mask === 'full'}{e.title}{:else}<Label label={str.Busy} />{/if}</span>
              {#if look.mask === 'full' && e.location !== undefined && e.location !== ''}
                <span class="truncate text-xs text-muted-foreground">{e.location}</span>
              {/if}
            </span>
          </button>
        {/each}
      </section>
    {:else}
      <Empty.Root class="my-auto flex-none py-16">
        <Empty.Header>
          <Empty.Media variant="icon">{#if isSearching}<SearchX />{:else}<CalendarX />{/if}</Empty.Media>
          <Empty.Title>
            {#if isSearching}<Label label={str.SearchEmpty} params={{ query: search.trim() }} />{:else}<Label label={str.EmptyAgenda} />{/if}
          </Empty.Title>
        </Empty.Header>
        {#if !isSearching}
          <Empty.Content>
            <p class="m-0 text-sm text-muted-foreground"><Label label={emptyCopy.calendar} /></p>
            <div class="flex flex-wrap justify-center gap-2">
              <Button data-track="calendar.event.open" size="sm" class="max-[480px]:h-11" onclick={() => { dispatch('create', from) }}><Plus /><Label label={emptyCopy.calendarAction} /></Button>
              <Button variant="outline" size="sm" class="max-[480px]:h-11" onclick={() => { dispatch('more') }}><Label label={str.LoadMore} /></Button>
            </div>
          </Empty.Content>
        {/if}
      </Empty.Root>
    {/each}
    {#if listed.length > 0}
      <!-- The observer loads more on scroll; the button stays as the keyboard path. -->
      <div bind:this={loadMore} class="flex justify-center pt-4">
        <Button variant="outline" size="sm" class="max-[480px]:h-11" onclick={() => { dispatch('more') }}><Label label={str.LoadMore} /></Button>
      </div>
    {/if}
  {/if}
</div>
