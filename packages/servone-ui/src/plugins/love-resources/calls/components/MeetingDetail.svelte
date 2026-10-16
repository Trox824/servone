<script lang="ts">
  import calendar, { AccessLevel, type Event, type ReccuringEvent } from '@hcengineering/calendar'
  import { formatName, getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import love, { type MeetingMinutes } from '@hcengineering/love'
  import { createQuery, getClient, MessageViewer } from '@hcengineering/presentation'
  import { isEmptyMarkup } from '@hcengineering/text'
  import tracker, { type Issue } from '@hcengineering/tracker'
  import { addZero, showPanel, showPopup } from '@hcengineering/ui'
  import { CalendarDays, ChevronLeft, Clock, FileText, Maximize2, MessagesSquare, Plus, Repeat, Users, Video } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import PersonAvatar from '../../../calendar-resources/lich/components/PersonAvatar.svelte'
  import { dayHeading, whenText } from '../../../calendar-resources/lich/lib/format'
  import { recurrenceText } from '../../../calendar-resources/lich/lib/recurrence'
  import { answers, occurrenceOf, seriesId, type Answer } from '../../../calendar-resources/lich/lib/rsvp'
  import { spanOf } from '../../../calendar-resources/lich/lib/time'
  import { statusKindOf } from '../../../tracker-resources/sprints/data'
  import { canJoin } from '../context'
  import type { MeetingRow } from '../list'
  import { textOf, type Lang, type StringKey } from '../strings'
  import AvatarStack from './AvatarStack.svelte'
  import CopyGuestLink from './CopyGuestLink.svelte'

  export let row: MeetingRow<Event>
  export let lang: Lang
  export let now: number
  export let stored: Event[]
  export let personOf: (socialId: string) => string | undefined
  export let startedAt: number
  export let isInCall: boolean
  export let isNarrow: boolean
  export let onJoin: (row: MeetingRow<Event>) => void
  export let onOpenCall: (row: MeetingRow<Event>) => void
  export let onOpenMinutes: (minutes: MeetingMinutes) => void
  export let onBack: () => void

  interface Attendee {
    person: Ref<Person>
    section: StringKey | undefined
    status: StringKey | undefined
  }

  const TWO_COLUMN_MIN_PX = 760
  const ATTENDEE_CAP = 6
  const MINUTE_MS = 60 * 1000
  const STATUS: Record<Answer, StringKey> = {
    organizer: 'Organizer',
    accepted: 'Going',
    declined: 'Declined',
    tentative: 'Maybe',
    pending: 'NoReply',
    none: 'NoReply'
  }
  const me = getCurrentEmployee()

  const isSeries = (e: Event): e is ReccuringEvent => e._class === calendar.class.ReccuringEvent

  $: t = textOf(lang)
  $: event = row.event

  let copies: Event[] = []
  let isCopiesLoaded = false
  const copiesQuery = createQuery()
  $: if (event !== undefined) {
    copiesQuery.query(calendar.class.Event, { eventId: seriesId(event) }, (found) => {
      copies = found
      isCopiesLoaded = true
    })
  }
  $: series = copies[0]
  $: occurrence = event !== undefined && series !== undefined ? occurrenceOf(event, series, stored) : undefined
  $: byPerson = answers(copies, personOf, occurrence)
  $: organizerCopy = copies.find((copy) => copy.access === AccessLevel.Owner)
  $: organizerPerson = organizerCopy === undefined ? undefined : personOf(organizerCopy.user)
  $: organizer = event?.participants.find((p) => p === organizerPerson)
  $: isOrganizer = organizer !== undefined && organizer === me
  $: rules = series !== undefined && isSeries(series) ? series.rules : []

  $: participants = event?.participants ?? row.inCall
  $: isLive = row.group === 'live'
  $: attendees = attendeesOf(participants, row.inCall, isLive, isCopiesLoaded ? byPerson : undefined, organizer)
  $: sectionCount = countSections(attendees)

  function attendeesOf (
    invited: Array<Ref<Person>>,
    inCall: Array<Ref<Person>>,
    live: boolean,
    replies: Map<string, Answer> | undefined,
    host: Ref<Person> | undefined
  ): Attendee[] {
    if (live) {
      const isAway = (p: Ref<Person>): boolean => !inCall.includes(p)
      const isDeclined = (p: Ref<Person>): boolean => replies?.get(p) === 'declined'
      return [
        ...inCall.map((person): Attendee => ({ person, section: 'InCallNow', status: undefined })),
        ...invited.filter((p) => isAway(p) && !isDeclined(p)).map((person): Attendee => ({ person, section: 'NotJoined', status: undefined })),
        ...invited.filter((p) => isAway(p) && isDeclined(p)).map((person): Attendee => ({ person, section: 'Declined', status: undefined }))
      ]
    }
    const ordered = host === undefined ? invited : [host, ...invited.filter((p) => p !== host)]
    return ordered.map((person) => ({ person, section: undefined, status: replies === undefined ? undefined : STATUS[replies.get(person) ?? 'pending'] }))
  }

  function countSections (list: Attendee[]): Map<StringKey, number> {
    const counts = new Map<StringKey, number>()
    for (const { section } of list) if (section !== undefined) counts.set(section, (counts.get(section) ?? 0) + 1)
    return counts
  }

  let isShowingAll = false
  $: shownAttendees = isShowingAll ? attendees : attendees.slice(0, ATTENDEE_CAP)

  $: assignees = actionItems.flatMap((item) => (item.assignee != null ? [item.assignee] : []))
  $: people = getPersonByPersonRefStore([...(organizer === undefined ? [] : [organizer]), ...participants, ...assignees])
  $: nameOf = (person: Ref<Person>): string => {
    const found = $people.get(person)
    return found !== undefined ? formatName(found.name) : ''
  }

  $: isJoinable = canJoin(row.start, row.end, row.inCall.length, now)
  $: minutesIn = Math.max(0, Math.floor((now - startedAt) / MINUTE_MS))
  $: hasAgenda = event !== undefined && !isEmptyMarkup(event.description)

  type ActionItem = Pick<Issue, '_id' | 'space' | 'identifier' | 'title' | 'assignee' | 'status' | 'createdOn' | 'modifiedOn'>
  let actionItems: ActionItem[] = []
  const actionItemsQuery = createQuery()
  $: if (copies.length > 0) {
    actionItemsQuery.query(
      tracker.class.Issue,
      { 'relations._id': { $in: copies.map((copy) => copy._id) } },
      (found) => { actionItems = found },
      { projection: { space: 1, identifier: 1, title: 1, assignee: 1, status: 1, createdOn: 1, modifiedOn: 1 } }
    )
  } else {
    actionItems = []
  }
  $: meetingDoc = organizerCopy ?? series
  const client = getClient()
  const isClosed = (item: ActionItem): boolean => ['done', 'canceled'].includes(statusKindOf(client, item.status))
  $: lastProject = actionItems.reduce<ActionItem | undefined>(
    (latest, item) => (latest === undefined || (item.createdOn ?? item.modifiedOn) > (latest.createdOn ?? latest.modifiedOn) ? item : latest),
    undefined
  )?.space

  function addActionItem (): void {
    if (meetingDoc === undefined) return
    showPopup(tracker.component.CreateIssue, { space: lastProject, relatedTo: meetingDoc, shouldSaveDraft: false }, 'top')
  }

  function openActionItem (item: ActionItem): void {
    showPanel(tracker.component.EditIssue, item._id, tracker.class.Issue, 'content')
  }

  let minutesList: MeetingMinutes[] = []
  const minutesQuery = createQuery()
  $: minutesQuery.query(love.class.MeetingMinutes, { attachedTo: row.room }, (found) => { minutesList = found }, { sort: { createdOn: -1 } })

  const clock = (ts: number): string => `${addZero(new Date(ts).getHours())}:${addZero(new Date(ts).getMinutes())}`

  let width = 0
  $: isTwoColumn = width >= TWO_COLUMN_MIN_PX
</script>

<div bind:clientWidth={width}>
  <div class="border-b pt-[22px] pb-[18px] {isNarrow ? 'px-4' : 'px-8'}">
    {#if isNarrow}
      <Button variant="ghost" size="sm" class="mb-2.5 -ml-1.5 text-muted-foreground" onclick={onBack}><ChevronLeft />{t('Back')}</Button>
    {/if}
    <div class="flex items-start gap-4" class:flex-col={isNarrow}>
      <h2 class="m-0 flex-1 text-xl leading-snug font-semibold tracking-tight text-balance">{row.title}</h2>
      {#if isOrganizer}<CopyGuestLink room={row.room} meetingEnd={row.end} {lang} />{/if}
      {#if isInCall}
        <Button variant="outline" onclick={() => { onOpenCall(row) }}><Maximize2 />{t('OpenCall')}</Button>
      {:else if isJoinable}
        <Button size="lg" onclick={() => { onJoin(row) }}><Video />{t('Join')}</Button>
      {/if}
    </div>
    <div class="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-muted-foreground">
      <span class="inline-flex h-5 items-center gap-1 rounded-md border bg-muted px-[7px] text-xs font-medium">
        {#if event !== undefined}<CalendarDays class="size-3" />{t('Calendar')}{:else}<MessagesSquare class="size-3" />{row.title}{/if}
      </span>
      {#if event !== undefined}
        <span class="inline-flex items-center gap-1.5 tabular-nums"><Clock class="size-4" />{whenText(spanOf(event), event.allDay, lang)}</span>
      {/if}
      {#if rules.length > 0}
        <span class="inline-flex items-center gap-1.5"><Repeat class="size-4" />{recurrenceText(rules, lang)}</span>
      {/if}
      <span class="inline-flex items-center gap-1.5 tabular-nums"><Users class="size-4" />{t('People', { count: participants.length })}</span>
    </div>
    {#if isLive}
      <div class="mt-3.5 flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 font-medium"><span class="size-[7px] shrink-0 rounded-full bg-primary ring-3 ring-primary/10" aria-hidden="true"></span>{t('Live')}</span>
        <!-- Only the headcount is live; the minute counter would re-announce on every tick. -->
        <span class="flex-1 tabular-nums text-muted-foreground">{t('LiveStarted', { minutes: minutesIn })} · <span aria-live="polite">{t('LiveInCall', { inCall: row.inCall.length, total: participants.length })}</span></span>
        {#if !isNarrow}<AvatarStack people={row.inCall} />{/if}
      </div>
    {/if}
  </div>

  <div class="grid" style:grid-template-columns={isTwoColumn ? 'minmax(0, 1fr) 300px' : '1fr'}>
    <section class="min-w-0 pt-[22px] pb-12 {isNarrow ? 'px-4' : 'px-8'}">
      <h3 class="m-0 mb-2.5 text-[13px] font-semibold">{t('Agenda')}</h3>
      {#if hasAgenda && event !== undefined}
        <div class="border-t pt-2.5"><MessageViewer message={event.description} /></div>
      {:else}
        <p class="m-0 border-t pt-2.5 text-muted-foreground">{t('NoAgenda')}</p>
      {/if}
      {#if meetingDoc !== undefined}
        <div class="mt-7 mb-2.5 flex items-center gap-2">
          <h3 class="m-0 flex-1 text-[13px] font-semibold">{t('ActionItems')} <span class="font-normal tabular-nums text-muted-foreground">{actionItems.length}</span></h3>
          <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={addActionItem}><Plus />{t('AddActionItem')}</Button>
        </div>
        {#if actionItems.length === 0}
          <p class="m-0 border-t pt-2.5 text-muted-foreground">{t('NoActionItems')}</p>
        {:else}
          <ul class="m-0 list-none border-t p-0">
            {#each actionItems as item (item._id)}
              {@const isDone = isClosed(item)}
              <li>
                <button type="button" class="flex h-9 w-full items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 outline-none" on:click={() => { openActionItem(item) }}>
                  <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{item.identifier}</span>
                  <span class="min-w-0 flex-1 truncate" class:line-through={isDone} class:text-muted-foreground={isDone}>
                    {item.title}{#if isDone}<span class="sr-only"> ({t('ActionItemDone')})</span>{/if}
                  </span>
                  {#if item.assignee != null}
                    <span class="flex max-w-[40%] shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><PersonAvatar person={item.assignee} /><span class="truncate">{nameOf(item.assignee)}</span></span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
      {#if minutesList.length > 0}
        <h3 class="m-0 mt-7 mb-2.5 text-[13px] font-semibold">{t('Minutes')} <span class="font-normal tabular-nums text-muted-foreground">{minutesList.length}</span></h3>
        <ul class="m-0 list-none border-t p-0">
          {#each minutesList as minutes (minutes._id)}
            {@const startedOn = minutes.createdOn ?? minutes.modifiedOn}
            <li>
              <button type="button" class="flex h-9 w-full items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 outline-none" on:click={() => { onOpenMinutes(minutes) }}>
                <FileText class="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate">{minutes.title}</span>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{dayHeading(startedOn, lang)} {clock(startedOn)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <aside class="pt-[18px] pb-10 {isTwoColumn ? 'border-l px-5' : `border-t ${isNarrow ? 'px-4' : 'px-8'}`}">
      {#if organizer !== undefined}
        <div class="grid min-h-[30px] grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
          <span class="text-muted-foreground">{t('Organizer')}</span>
          <span class="flex min-w-0 items-center gap-1.5"><PersonAvatar person={organizer} /><span class="truncate">{nameOf(organizer)}</span></span>
        </div>
      {/if}
      <h3 class="m-0 mt-5 mb-2 text-[13px] font-semibold">{t('Attendees')} <span class="font-normal tabular-nums text-muted-foreground">{attendees.length}</span></h3>
      <ul class="m-0 list-none p-0">
        {#each shownAttendees as attendee, index (attendee.person)}
          {#if attendee.section !== undefined && attendee.section !== shownAttendees[index - 1]?.section}
            <li class="mt-2.5 mb-0.5 text-xs font-medium text-muted-foreground">{t(attendee.section)} · <span class="tabular-nums">{sectionCount.get(attendee.section)}</span></li>
          {/if}
          <li class="flex h-[30px] items-center gap-2">
            <PersonAvatar person={attendee.person} />
            <span class="min-w-0 truncate" class:text-muted-foreground={attendee.section === 'Declined'}>
              {nameOf(attendee.person)}{#if attendee.person === me}<span class="text-muted-foreground"> ({t('You')})</span>{/if}
            </span>
            {#if attendee.status !== undefined}<span class="ml-auto shrink-0 text-xs text-muted-foreground">{t(attendee.status)}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if attendees.length > ATTENDEE_CAP}
        <Button variant="ghost" size="sm" class="mt-1 -ml-1.5 text-muted-foreground" onclick={() => { isShowingAll = !isShowingAll }}>
          {isShowingAll ? t('ShowLess') : t('ShowAll', { count: attendees.length })}
        </Button>
      {/if}
    </aside>
  </div>
</div>
