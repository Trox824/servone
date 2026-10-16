<!--
  Shadow of plugins/calendar-resources/src/components/CalendarWidget.svelte (webpack
  NormalModuleReplacementPlugin, dev/prod/webpack.config.js).
  The sidebar shows a today agenda instead of the stock day grid, whose create and edit dialogs bypass Lịch.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import calendar, { getAllEvents, type Event } from '@hcengineering/calendar'
  import contact, { getName } from '@hcengineering/contact'
  import { getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import { getCurrentAccount, SortingOrder, type PersonId } from '@hcengineering/core'
  import love, { type Meeting } from '@hcengineering/love'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { languageStore } from '@hcengineering/theme'
  import tracker from '@hcengineering/tracker'
  import { Breadcrumbs, getCurrentLocation, Header, navigate, showPanel } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { CalendarPlus, ListTodo, Plus, Stamp, Video, Workflow } from '@lucide/svelte'
  import { Button } from '../../../lib/components/ui/button'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import { isMessageReminder } from '../../../lib/remind/reminder-event'
  import { canJoin, peopleInCall } from '../../love-resources/calls/context'
  import { infos } from '../../love-resources/calls/live'
  import EventDialog from '../lich/components/EventDialog.svelte'
  import OffToday from '../lich/components/OffToday.svelte'
  import NextMeeting from '../../workbench-resources/components/sidebar/NextMeeting.svelte'
  import InCallNow from '../../workbench-resources/components/sidebar/InCallNow.svelte'
  import { agendaDays } from '../lich/lib/agenda'
  import { dueState } from '../lich/lib/needs'
  import { needsStore, type MyNeed } from '../lich/needs'
  import { dayHeading, timeRange } from '../lich/lib/format'
  import { isDeclined, myAnswer } from '../lich/lib/rsvp'
  import { addDays, startOfDay } from '../lich/lib/time'
  import { joinOrOpenMeeting } from '../lich/meeting'
  import { dayUnit, textOf, type StringKey } from '../lich/strings'
  import type { Lang } from '../lich/lib/types'
  import { calendarStore } from '../utils'

  const CLOCK_TICK_MS = 30 * 1000
  const LICH_APP = 'time'
  const LOOKAHEAD_DAYS = 7
  const SKELETON_ROWS = [0, 1, 2]
  const NEEDS_CAP = 6
  const APPROVAL_WAIT_SHOW_DAYS = 2
  const KIND_ICON = { approval: Stamp, step: Workflow, task: ListTodo, invite: CalendarPlus }
  const KIND_TEXT: Record<MyNeed['kind'], StringKey> = { approval: 'KindApproval', step: 'KindStep', task: 'KindTask', invite: 'KindInvite' }

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const mySocial = new Set<string>(getCurrentAccount().socialIds)
  const isMine = (socialId: string): boolean => mySocial.has(socialId)

  $: lang = ($languageStore === 'vi' ? 'vi' : 'en') satisfies Lang
  $: t = textOf(lang)

  let now = Date.now()
  onMount(() => {
    const timer = setInterval(() => { now = Date.now() }, CLOCK_TICK_MS)
    return () => { clearInterval(timer) }
  })
  $: today = startOfDay(now)

  let stored: Event[] = []
  let isLoaded = false
  const eventsQuery = createQuery()
  $: shownCalendars = $calendarStore.filter((c) => isMine(c.user) && !c.hidden)
  $: eventsQuery.query(
    calendar.class.Event,
    { calendar: { $in: shownCalendars.map((c) => c._id) } },
    (found) => {
      stored = found.filter((e) => !isMessageReminder(hierarchy, e))
      isLoaded = true
    },
    { sort: { date: SortingOrder.Ascending } }
  )
  $: attending = getAllEvents(stored, today, addDays(today, LOOKAHEAD_DAYS))
    .filter((e) => !isDeclined(myAnswer(e, stored, isMine)))
  $: upcoming = attending.filter((e) => e.dueDate > now)
  $: hadEarlierToday = attending.some((e) => e.date < addDays(today, 1) && e.dueDate <= now)
  $: days = agendaDays(upcoming, today, LOOKAHEAD_DAYS)

  function dayLabel (day: number): string {
    return day === addDays(today, 1) ? `${t('Tomorrow')} · ${dayHeading(day, lang)}` : dayHeading(day, lang)
  }

  let personToSocial = new Map<string, PersonId[]>()
  createQuery().query(contact.class.SocialIdentity, { attachedToClass: contact.class.Person }, (identities) => {
    const byPerson = new Map<string, PersonId[]>()
    for (const identity of identities) byPerson.set(identity.attachedTo, [...(byPerson.get(identity.attachedTo) ?? []), identity._id])
    personToSocial = byPerson
  })

  const isMeeting = (e: Event): boolean => hierarchy.hasMixin(e, love.mixin.Meeting)
  function isJoinable (e: Event, clock: number): boolean {
    if (!isMeeting(e)) return false
    const room = hierarchy.as<Event, Meeting>(e, love.mixin.Meeting).room
    return canJoin(e.date, e.dueDate, peopleInCall($infos, room).length, clock)
  }

  function openCalendar (): void {
    const loc = getCurrentLocation()
    loc.path[2] = LICH_APP
    loc.path.length = 3
    navigate(loc)
  }

  $: needs = $needsStore.needs
  let isShowingAllNeeds = false
  $: shownNeeds = isShowingAllNeeds ? needs : needs.slice(0, NEEDS_CAP)

  let senderNames = new Map<PersonId, string>()
  function lookUpSenders (listed: MyNeed[]): void {
    for (const need of listed) {
      const sender = need.doc.createdBy
      if (need.kind === 'step' || sender === undefined || senderNames.has(sender)) continue
      getPersonByPersonIdCb(sender, (person) => {
        if (person !== null) senderNames = new Map(senderNames).set(sender, getName(hierarchy, person))
      })
    }
  }
  $: lookUpSenders(needs)

  function needTitle (need: MyNeed, approvalTitles: Map<string, string>): string {
    if (need.kind !== 'approval') return need.doc.title
    if (hierarchy.isDerived(need.doc.attachedToClass, tracker.class.Issue)) return approvalTitles.get(need.doc.attachedTo) ?? t('ApprovalRequest')
    return t('LeaveRequest')
  }

  function needFrom (need: MyNeed, names: Map<PersonId, string>): string | undefined {
    if (need.kind === 'step') return need.doc.parents[0]?.parentTitle
    return need.doc.createdBy === undefined ? undefined : names.get(need.doc.createdBy)
  }

  function needDue (need: MyNeed, clock: number): { text: string, isOverdue: boolean } {
    if (need.kind === 'approval') {
      const sent = dueState(need.doc.createdOn, clock)
      if (sent.kind !== 'overdue' || sent.days < APPROVAL_WAIT_SHOW_DAYS) return { text: '', isOverdue: false }
      return { text: t('SentDaysAgo', { count: sent.days, days: dayUnit(t, sent.days) }), isOverdue: false }
    }
    const state = dueState(need.due, clock)
    if (state.kind === 'overdue') return { text: t('OverdueBy', { count: state.days, days: dayUnit(t, state.days) }), isOverdue: true }
    if (state.kind === 'today') return { text: need.kind === 'invite' ? timeRange(need.doc, lang) : t('Today'), isOverdue: false }
    if (state.kind === 'tomorrow') return { text: t('Tomorrow'), isOverdue: false }
    if (state.kind === 'later' && need.due !== undefined) return { text: dayHeading(startOfDay(need.due), lang), isOverdue: false }
    return { text: '', isOverdue: false }
  }

  function act (need: MyNeed): void {
    if (need.kind === 'approval') {
      const isIssue = hierarchy.isDerived(need.doc.attachedToClass, tracker.class.Issue)
      showPanel(isIssue ? tracker.component.EditIssue : view.component.EditDoc, need.doc.attachedTo, need.doc.attachedToClass, 'content')
    }
    else if (need.kind === 'invite') open(need.doc)
    else showPanel(tracker.component.EditIssue, need.doc._id, need.doc._class, 'content')
  }

  let isCreating = false
  let editing: Event | undefined

  function open (e: Event): void {
    if (isMeeting(e)) joinOrOpenMeeting(e, false)
    else editing = e
  }
</script>

<Header allowFullsize={false} type="type-aside" hideBefore hideActions={false} hideDescription adaptive="disabled" closeOnEscape={false} on:close>
  <Breadcrumbs items={[{ title: `${t('Today')} · ${dayHeading(today, lang)}` }]} currentOnly />
  <svelte:fragment slot="extra">
    <Button variant="ghost" size="sm" onclick={() => { openCalendar() }}>{t('OpenCalendar')}</Button>
    <Button variant="outline" size="sm" onclick={() => { isCreating = true }}><Plus />{t('NewMeeting')}</Button>
  </svelte:fragment>
</Header>

<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 text-[13px]">
  <NextMeeting events={attending} {stored} {now} {lang} />
  {#if $needsStore.isLoaded}
    {#if needs.length === 0}
      <p class="m-0 px-2 text-muted-foreground">{t('NothingNeedsYou')}</p>
    {:else}
      <section class="grid gap-0.5 border-b pb-3" aria-labelledby="needs-you-heading">
        <h2 id="needs-you-heading" class="m-0 flex h-6 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
          {t('NeedsYou')}<span class="tabular-nums">{needs.length}</span>
        </h2>
        <ul class="m-0 grid list-none gap-0.5 p-0">
          {#each shownNeeds as need (`${need.kind}:${need.doc._id}`)}
            {@const due = needDue(need, now)}
            {@const from = needFrom(need, senderNames)}
            <li>
              <button type="button" class="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50" on:click={() => { act(need) }}>
                <svelte:component this={KIND_ICON[need.kind]} class="mt-[3px] size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span class="grid min-w-0 flex-1 gap-0.5">
                  <span class="flex min-w-0 items-baseline gap-2">
                    <span class="truncate font-medium">{needTitle(need, $needsStore.approvalTitles)}</span>
                    <span class="ml-auto shrink-0 text-xs tabular-nums {due.isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}">{due.text}</span>
                  </span>
                  {#if from}
                    <span class="truncate text-xs text-muted-foreground"><span class="sr-only">{t(KIND_TEXT[need.kind])}, </span>{from}</span>
                  {:else}
                    <span class="sr-only">{t(KIND_TEXT[need.kind])}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
        {#if needs.length > NEEDS_CAP}
          <Button variant="ghost" size="sm" class="justify-self-start px-2 text-muted-foreground" aria-expanded={isShowingAllNeeds} onclick={() => { isShowingAllNeeds = !isShowingAllNeeds }}>
            {isShowingAllNeeds ? t('ShowLess') : t('ShowAllNeeds', { count: needs.length })}
          </Button>
        {/if}
      </section>
    {/if}
  {/if}
  {#if !isLoaded}
    <div class="grid gap-1" aria-hidden="true">
      {#each SKELETON_ROWS as row (row)}<Skeleton class="h-10 w-full rounded-lg" />{/each}
    </div>
  {:else}
    {#if days.length === 0}
      <p class="m-0 px-2 text-muted-foreground">{t('NothingThisWeek')}</p>
    {:else if days[0].day !== today}
      <section class="grid gap-0.5" aria-label={t('Today')}>
        <h3 class="m-0 flex h-6 items-center px-2 text-xs font-medium text-muted-foreground">{t('Today')}</h3>
        <p class="m-0 px-2 text-muted-foreground">{hadEarlierToday ? t('NothingLeftToday') : t('NothingToday')}</p>
      </section>
    {/if}
    {#each days as day (day.day)}
      <section class="grid gap-0.5" aria-label={day.day === today ? t('Today') : dayLabel(day.day)}>
        {#if day.day !== today}
          <h3 class="m-0 flex h-6 items-center px-2 text-xs font-medium text-muted-foreground">{dayLabel(day.day)}</h3>
        {/if}
        {#each day.events as e (e._id)}
          {@const isNow = !e.allDay && e.date <= now}
          <div class="group flex min-h-10 items-center gap-2 rounded-lg px-2 hover:bg-accent">
            <button type="button" class="flex min-w-0 flex-1 items-center justify-start gap-3 self-stretch text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md" on:click={() => { open(e) }}>
              <span class="w-20 shrink-0 text-xs tabular-nums {isNow ? 'font-medium text-primary' : 'text-muted-foreground'}">{timeRange(e, lang)}</span>
              {#if isMeeting(e)}<Video class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
              <span class="truncate font-medium">{e.title}</span>
              {#if isNow}<span class="shrink-0 rounded-sm bg-primary/10 px-1.5 text-[11px] font-medium leading-4 text-primary">{t('HappeningNow')}</span>{/if}
            </button>
            {#if isJoinable(e, now)}
              <Button size="xs" onclick={() => { joinOrOpenMeeting(e, true) }}>{t('JoinMeeting')}</Button>
            {/if}
          </div>
        {/each}
      </section>
    {/each}
  {/if}
  <div class="grid gap-3 border-t pt-3">
    <InCallNow events={attending} {lang} />
    <OffToday {lang} />
  </div>
</div>

<Dialog.Root open={isCreating} onOpenChange={(isOpen) => { if (!isOpen) isCreating = false }}>
  {#if isCreating}
    <Dialog.Content class="top-[8vh] translate-y-0 gap-0 p-0 sm:max-w-2xl">
      <EventDialog meeting={true} {lang} stored={[]} {personToSocial} on:close={() => { isCreating = false }} />
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Dialog.Root open={editing !== undefined} onOpenChange={(isOpen) => { if (!isOpen) editing = undefined }}>
  {#if editing !== undefined}
    <Dialog.Content class="top-[8vh] translate-y-0 gap-0 p-0 sm:max-w-2xl">
      <!-- EventDialog reads its props once at init, so another event needs a fresh instance. -->
      {#key editing}
        <EventDialog object={editing} {lang} {stored} {personToSocial} on:close={() => { editing = undefined }} />
      {/key}
    </Dialog.Content>
  {/if}
</Dialog.Root>
