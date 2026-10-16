<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { Plus } from '@lucide/svelte'
  import { onMount, setContext } from 'svelte'
  import { writable } from 'svelte/store'
  import calendar, { AccessLevel, getAllEvents, getPrimaryCalendar, type Event } from '@hcengineering/calendar'
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import { getCurrentAccount, SortingOrder, type PersonId, type Ref } from '@hcengineering/core'
  import hr, { type RequestType, type Staff } from '@hcengineering/hr'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { deviceOptionsStore as deviceInfo, getCurrentLocation, location, navigate } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import tracker, { type Issue, type Project } from '@hcengineering/tracker'
  import { openDoc } from '@hcengineering/view-resources'
  import { baseTypeOf } from '@servone/config'
  import { statusKindOf } from '../../../tracker-resources/sprints/data'
  import { WORKFLOW_TYPE_ID } from '../../../tracker-resources/workflows/plugin'
  import { calendarStore, saveUTC } from '../../utils'
  import { onePerPerson } from '../lib/copies'
  import { maskOf, type Mask } from '../lib/mask'
  import { isDeclined, myAnswer, seriesId } from '../lib/rsvp'
  import { readOverlay, readShowDeclined, readView, writeOverlay, writeShowDeclined, writeView, type KeyStore } from '../lib/storage'
  import { AGENDA_DAYS, isView, parsePage, rangeOf } from '../lib/view'
  import { allDaySlot, nextHourSlot } from '../lib/time'
  import { leaveItems, type Leave } from '../lib/leave'
  import { deadlineItems } from '../lib/deadlines'
  import type { Lang, Slot, Timed, View, Visibility } from '../lib/types'
  import { DRAFT_EVENT_ID, isDraftEvent, LICH_CONTEXT, overlayColor, type CardLook, type LichContext } from '../context'
  import { eventDurationFor, newDraft, type EventDraft } from '../save'
  import { textOf } from '../strings'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Popover from '../../../../lib/components/ui/popover'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { ensureLichAttributes } from '../setup'
  import { isMessageReminder } from '../../../../lib/remind/reminder-event'
  import Header from './Header.svelte'
  import Navigator from './Navigator.svelte'
  import TimeGridView from './TimeGridView.svelte'
  import MonthView from './MonthView.svelte'
  import AgendaView from './AgendaView.svelte'
  import Sharing from './Sharing.svelte'
  import EventPopover from './EventPopover.svelte'
  import EventDialog from './EventDialog.svelte'
  import QuickCreate from './QuickCreate.svelte'
  import ResourcesPage from '../resources/ResourcesPage.svelte'
  import type { TypeFilter } from '../resources/grid'

  const viewerStore: KeyStore = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, text) => { localStorage.setItem(key, text) }
  }

  const client = getClient()
  const account = getCurrentAccount()
  const mySocial = new Set<string>(account.socialIds)
  const isMine = (socialId: string): boolean => mySocial.has(socialId)
  const me = getCurrentEmployee()

  let lastView: View = readView(viewerStore)
  $: segment = $location.path[3]
  $: rememberView(segment)
  $: page = parsePage(segment, lastView)
  $: view = fitDevice(isView(page) ? page : lastView, $deviceInfo.isMobile)

  function fitDevice (wanted: View, isMobile: boolean): View {
    if (isMobile && wanted === 'tuan') return 'ba-ngay'
    if (!isMobile && wanted === 'ba-ngay') return 'tuan'
    return wanted
  }

  function rememberView (visited: string | undefined): void {
    if (!isView(visited) || visited === lastView) return
    lastView = visited
    writeView(viewerStore, visited)
  }
  $: lang = ($languageStore === 'vi' ? 'vi' : 'en') satisfies Lang
  $: firstDayOfWeek = $deviceInfo.firstDayOfWeek

  let anchor = Date.now()
  let agendaDays = AGENDA_DAYS
  let search = ''
  let roomFilter: TypeFilter = 'all'
  let isMyBookings = false
  let isManagingRooms = false
  let isNavigatorOpen = false
  let overlay: string[] = readOverlay(viewerStore)
  let showDeclined = readShowDeclined(viewerStore)

  let socialToPerson = new Map<string, string>()
  let personToSocial = new Map<string, PersonId[]>()
  createQuery().query(contact.class.SocialIdentity, { attachedToClass: contact.class.Person }, (identities) => {
    const byPerson = new Map<string, PersonId[]>()
    for (const identity of identities) byPerson.set(identity.attachedTo, [...(byPerson.get(identity.attachedTo) ?? []), identity._id])
    personToSocial = byPerson
    socialToPerson = new Map(identities.map((identity) => [identity._id, identity.attachedTo]))
  })
  onMount(() => {
    void ensureLichAttributes(client)
  })
  $: personOf = (socialId: string): string | undefined => socialToPerson.get(socialId)

  $: overlaySocial = new Set(overlay.flatMap((p) => personToSocial.get(p) ?? []))
  $: shownCalendars = $calendarStore.filter((c) => (isMine(c.user) ? !c.hidden : overlaySocial.has(c.user)))
  $: range = rangeOf(page === 'tim-kiem' ? 'lich-bieu' : view, anchor, firstDayOfWeek, agendaDays)

  let stored: Event[] = []
  let isEventsLoaded = false
  const eventsQuery = createQuery()
  $: eventsQuery.query(
    calendar.class.Event,
    { calendar: { $in: shownCalendars.map((c) => c._id) } },
    (found) => { stored = found.filter((e) => !isMessageReminder(client.getHierarchy(), e)); isEventsLoaded = true },
    { sort: { date: SortingOrder.Ascending } }
  )
  $: events = getAllEvents(onePerPerson(stored, (socialId) => socialToPerson.get(socialId)), range.start, range.end)
  $: shownEvents = showDeclined ? events : events.filter((e) => !isDeclined(myAnswer(e, stored, isMine)))

  $: colorOf = (e: Event): string => {
    if (isMine(e.user)) return 'var(--primary)'
    const person = socialToPerson.get(e.user)
    return overlayColor(person === undefined ? -1 : overlay.indexOf(person))
  }

  let leaves: Leave[] = []
  const leavesQuery = createQuery()
  $: leavesQuery.query(hr.class.Request, { attachedTo: { $in: [me, ...overlay] as Array<Ref<Staff>> } }, (found) => { leaves = found })
  let typeLabels = new Map<string, string>()
  const typesQuery = createQuery()
  $: typesQuery.query(hr.class.RequestType, {}, (types) => { void labelTypes(types, lang) })
  async function labelTypes (types: RequestType[], language: Lang): Promise<void> {
    typeLabels = new Map(await Promise.all(types.map(async (type) => [type._id, await translate(type.label, {}, language)] as const)))
  }
  $: leaveColorOf = (person: string): string => (person === me ? 'var(--primary)' : overlayColor(overlay.indexOf(person)))
  $: approvedLeaves = leaveItems(leaves, leaveColorOf)
  $: leaveColors = new Map(approvedLeaves.map((item) => [item._id, item.color]))
  $: leaveEvents = approvedLeaves.map((item) => readOnlyEventOf(item, textOf(lang)('Leave', { type: typeLabels.get(item.type) ?? '' })))

  const DEADLINE_COLOR = 'var(--muted-foreground)'
  let workflowProjects: Array<Ref<Project>> = []
  createQuery().query(tracker.class.Project, { archived: false }, (found) => {
    workflowProjects = found.filter((project) => baseTypeOf(project.type) === WORKFLOW_TYPE_ID).map((project) => project._id)
  })
  let dueIssues: Issue[] = []
  const dueQuery = createQuery()
  $: dueQuery.query(tracker.class.Issue, { space: { $in: workflowProjects }, assignee: me, dueDate: { $ne: null } }, (found) => { dueIssues = found })
  const isClosed = (status: string): boolean =>
    client.getModel().findAllSync(tracker.class.IssueStatus, {}).some((it) => it._id === status && ['done', 'canceled'].includes(statusKindOf(client, it._id)))
  $: deadlines = deadlineItems(dueIssues, isClosed, lang)
  $: deadlineIssues = new Map<string, Issue>(dueIssues.map((issue) => [issue._id, issue]))
  $: deadlineEvents = deadlines.map((item) => readOnlyEventOf(item, item.title))

  function readOnlyEventOf (item: Timed & { _id: string }, title: string): Event {
    return {
      _id: item._id as Ref<Event>,
      _class: calendar.class.Event,
      space: calendar.space.Calendar,
      modifiedOn: 0,
      modifiedBy: account.primarySocialId,
      attachedTo: calendar.ids.NoAttached,
      attachedToClass: calendar.class.Event,
      collection: 'events',
      eventId: item._id,
      title,
      calendar: draftCalendar,
      allDay: true,
      date: item.date,
      dueDate: item.dueDate,
      participants: [],
      access: AccessLevel.Reader,
      user: account.primarySocialId,
      blockTime: true
    }
  }

  $: visibilityById = new Map<string, Visibility>($calendarStore.map((c) => [c._id, c.visibility]))
  $: calendarVisibility = (id: string): Visibility | undefined => visibilityById.get(id)

  $: searchText = search.trim().toLowerCase()
  $: searchHits = events.filter((e) => maskOf(e, calendarVisibility, isMine) === 'full' && e.title.toLowerCase().includes(searchText))

  function copyToOpen (clicked: Event): Event {
    if (clicked._class === calendar.class.ReccuringInstance && !stored.some((s) => s._id === clicked._id)) {
      if (isMine(clicked.user)) return clicked
      return events.find((e) => isMine(e.user) && e._class === clicked._class && seriesId(e) === seriesId(clicked) && e.date === clicked.date) ?? clicked
    }
    return stored.find((s) => s.eventId === clicked.eventId && isMine(s.user)) ?? stored.find((s) => s._id === clicked._id) ?? clicked
  }

  let popover: { event: Event, target: HTMLElement, mask: Mask } | undefined
  let dialog: { object?: Event, draft?: EventDraft } | undefined
  let quick: { draft: EventDraft, anchor: HTMLElement, side: 'right' | 'bottom' } | undefined

  let pointerAnchor: HTMLDivElement
  let anchorAt = { x: 0, y: 0 }
  let pointer = { x: 0, y: 0, isDismissing: false }
  function trackPointer (e: PointerEvent): void {
    pointer = { x: e.clientX, y: e.clientY, isDismissing: (quick !== undefined && !isOnDraft(e.target)) || popover !== undefined }
  }
  function isOnDraft (target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[data-lich-draft]') !== null
  }

  function openEvent (clicked: Event, target: HTMLElement): void {
    const deadline = deadlineIssues.get(clicked._id)
    if (deadline !== undefined) {
      void openDoc(client.getHierarchy(), deadline)
      return
    }
    if (isDraftEvent(clicked) || leaveColors.has(clicked._id)) return
    const e = copyToOpen(clicked)
    popover = { event: e, target, mask: maskOf(e, calendarVisibility, isMine) }
  }
  function editEvent (e: Event): void {
    popover = undefined
    dialog = { object: e }
  }
  function openQuick (slot: Slot, allDay: boolean, target: HTMLElement, side: 'right' | 'bottom'): void {
    popover = undefined
    quick = { draft: newDraft(slot, allDay, me), anchor: target, side }
  }
  function createAt (slot: Slot, allDay: boolean, point: { x: number, y: number } = pointer): void {
    if (pointer.isDismissing) {
      pointer.isDismissing = false
      return
    }
    pointer.isDismissing = false
    anchorAt = { x: point.x, y: point.y }
    openQuick(slot, allDay, pointerAnchor, $deviceInfo.isMobile ? 'bottom' : 'right')
  }
  function book (slot: Slot, resource: EventDraft['resource']): void {
    popover = undefined
    quick = undefined
    dialog = { draft: { ...newDraft(slot, false, me), resource } }
  }
  function openMoreOptions (draft: EventDraft): void {
    quick = undefined
    dialog = { draft }
  }
  function go (next: string): void {
    isNavigatorOpen = false
    const loc = getCurrentLocation()
    navigate({ ...loc, path: [...loc.path.slice(0, 3), next] })
  }
  function openDay (day: number): void {
    anchor = day
    go('ngay')
  }
  function pickDay (day: number): void {
    anchor = day
    agendaDays = AGENDA_DAYS
    isNavigatorOpen = false
  }
  function setOverlay (people: string[]): void {
    overlay = people
    writeOverlay(viewerStore, people)
  }
  function setShowDeclined (isShown: boolean): void {
    showDeclined = isShown
    writeShowDeclined(viewerStore, isShown)
  }

  $: draftCalendar = getPrimaryCalendar(
    $calendarStore.filter((c) => isMine(c.user) && (c.access === AccessLevel.Owner || c.access === AccessLevel.Writer)),
    undefined,
    account.uuid
  )
  $: eventDuration = eventDurationFor($calendarStore)
  $: draftEvent = quick === undefined ? undefined : draftEventOf(quick.draft)
  function draftEventOf (draft: EventDraft): Event {
    const title = draft.title.trim()
    return {
      _id: DRAFT_EVENT_ID as Ref<Event>,
      _class: calendar.class.Event,
      space: calendar.space.Calendar,
      modifiedOn: Date.now(),
      modifiedBy: account.primarySocialId,
      attachedTo: calendar.ids.NoAttached,
      attachedToClass: calendar.class.Event,
      collection: 'events',
      eventId: DRAFT_EVENT_ID,
      title: title === '' ? textOf(lang)('NoTitle') : title,
      description: draft.description,
      calendar: draftCalendar,
      allDay: draft.allDay,
      date: draft.allDay ? saveUTC(draft.start) : draft.start,
      dueDate: draft.allDay ? saveUTC(draft.end) : draft.end,
      participants: draft.participants,
      access: AccessLevel.Owner,
      user: account.primarySocialId,
      blockTime: true
    }
  }
  $: gridEvents = draftEvent === undefined ? [...shownEvents, ...leaveEvents, ...deadlineEvents] : [...shownEvents, ...leaveEvents, ...deadlineEvents, draftEvent]

  const cardOf = writable<(e: Event) => CardLook>()
  $: cardOf.set((e) => {
    if (isDraftEvent(e)) return { mask: 'full', answer: 'organizer', color: colorOf(e), isDeclined: false, isFree: false, isDraft: true }
    const leaveColor = leaveColors.get(e._id)
    if (deadlineIssues.has(e._id)) return { mask: 'full', answer: 'organizer', color: DEADLINE_COLOR, isDeclined: false, isFree: true, isDraft: false }
    if (leaveColor !== undefined) return { mask: 'full', answer: 'organizer', color: leaveColor, isDeclined: false, isFree: false, isDraft: false }
    const answer = myAnswer(e, stored, isMine)
    return { mask: maskOf(e, calendarVisibility, isMine), answer, color: colorOf(e), isDeclined: isDeclined(answer), isFree: !e.blockTime, isDraft: false }
  })
  setContext<LichContext>(LICH_CONTEXT, { openEvent, cardOf })
</script>

<svelte:window on:pointerdown|capture={trackPointer} on:keydown|capture={() => { pointer.isDismissing = false }} />

<div class="flex h-full w-full min-w-0" data-lich>
  {#if !$deviceInfo.isMobile}
    <Navigator {anchor} {lang} {firstDayOfWeek} {overlay} {showDeclined} isRoomsOpen={page === 'tai-nguyen'} on:rooms={() => { go('tai-nguyen') }} on:showDeclined={(e) => { setShowDeclined(e.detail) }} on:pick={(e) => { pickDay(e.detail) }} on:sharing={() => { go('chia-se') }} />
  {/if}
  <div class="flex min-w-0 flex-1 flex-col">
    <Header
      view={page === 'tai-nguyen' ? 'ngay' : view} isOnView={isView(page)} {anchor} {lang} {firstDayOfWeek} {overlay} {isNavigatorOpen} bind:search
      on:view={(e) => { go(e.detail) }}
      on:anchor={(e) => { anchor = e.detail; agendaDays = AGENDA_DAYS }}
      on:overlay={(e) => { setOverlay(e.detail) }}
      on:search={() => { go('tim-kiem') }}
      on:clear={() => { if (page === 'tim-kiem') go(view) }}
      on:create={(e) => { openQuick(nextHourSlot(anchor, Date.now(), eventDuration), false, e.detail, 'bottom') }}
      on:navigator={() => { isNavigatorOpen = !isNavigatorOpen }}
    />
    <div class="relative flex min-h-0 flex-1 flex-col">
    {#if $deviceInfo.isMobile && isNavigatorOpen}
      <button type="button" class="absolute inset-0 z-30 bg-black/30" aria-label={textOf(lang)('CloseCalendarMenu')} transition:fade={{ duration: 150 }} on:click={() => { isNavigatorOpen = false }}></button>
      <div class="absolute inset-y-0 left-0 z-40 w-2/3 overflow-y-auto border-r bg-background shadow-xl" data-lich-sheet transition:fly={{ x: -320, duration: 220 }}>
        <Navigator {anchor} {lang} {firstDayOfWeek} {overlay} {showDeclined} isRoomsOpen={page === 'tai-nguyen'} on:rooms={() => { go('tai-nguyen') }} on:showDeclined={(e) => { setShowDeclined(e.detail) }} on:pick={(e) => { pickDay(e.detail) }} on:sharing={() => { go('chia-se') }} />
      </div>
    {/if}
    <div class="relative min-h-0 flex-1 overflow-auto">
      <!-- The grid is the real layout already, so only a bar says events are still coming; empty and loading look alike otherwise. -->
      {#if !isEventsLoaded && page !== 'chia-se' && page !== 'tim-kiem' && page !== 'tai-nguyen' && view !== 'lich-bieu'}
        <div class="lich-progress" role="status">
          <span class="sr-only">{textOf(lang)('LoadingEvents')}</span>
        </div>
      {/if}
      {#if page === 'chia-se'}
        <Sharing {isMine} {lang} />
      {:else if page === 'tai-nguyen'}
        <ResourcesPage {anchor} {lang} {isMine} {personOf} {calendarVisibility} bind:filter={roomFilter} bind:isMineOnly={isMyBookings} bind:isManaging={isManagingRooms} on:open={(e) => { openEvent(e.detail.event, e.detail.target) }} on:book={(e) => { book(e.detail.slot, e.detail.resource) }} />
      {:else if page === 'tim-kiem'}
        <AgendaView events={searchHits} from={range.start} days={agendaDays} {lang} {search} isLoading={!isEventsLoaded} on:open={(e) => { openEvent(e.detail.event, e.detail.target) }} on:more={() => { agendaDays += AGENDA_DAYS }} on:create={(e) => { createAt(nextHourSlot(e.detail, Date.now(), eventDuration), false) }} />
      {:else if view === 'thang'}
        <MonthView events={gridEvents} {anchor} {firstDayOfWeek} {lang} on:open={(e) => { openEvent(e.detail.event, e.detail.target) }} on:create={(e) => { createAt(allDaySlot(e.detail.day), true, e.detail) }} on:day={(e) => { openDay(e.detail) }} on:select={(e) => { anchor = e.detail }} />
      {:else if view === 'lich-bieu'}
        <AgendaView events={shownEvents} from={range.start} days={agendaDays} {lang} search="" isLoading={!isEventsLoaded} on:open={(e) => { openEvent(e.detail.event, e.detail.target) }} on:more={() => { agendaDays += AGENDA_DAYS }} on:create={(e) => { createAt(nextHourSlot(e.detail, Date.now(), eventDuration), false) }} />
      {:else}
        <TimeGridView events={gridEvents} {anchor} days={view === 'tuan' ? 7 : view === 'ba-ngay' ? 3 : 1} on:create={(e) => { createAt(e.detail.withTime ? { start: e.detail.date, end: e.detail.end ?? e.detail.date + eventDuration } : allDaySlot(e.detail.date), !e.detail.withTime) }} />
      {/if}
    </div>
    {#if $deviceInfo.isMobile && isView(page) && popover === undefined}
      <Button
        size="icon-lg"
        class="absolute right-4 bottom-4 z-20 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
        aria-label={textOf(lang)('Create')}
        onclick={(e) => { openQuick(nextHourSlot(anchor, Date.now(), eventDuration), false, e.currentTarget, 'bottom') }}
      ><Plus /></Button>
    {/if}
    </div>
  </div>
</div>

{#if $deviceInfo.isMobile}
  <Dialog.Root open={popover !== undefined} onOpenChange={(isOpen) => { if (!isOpen) popover = undefined }}>
    {#if popover !== undefined}
      <Dialog.Content showCloseButton={false} data-lich-pop aria-label={popover.mask === 'full' ? popover.event.title : textOf(lang)('Busy')} class="top-auto right-2 bottom-[4.25rem] left-2 max-h-[calc(100dvh-6.75rem)] w-auto max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-none">
        <EventPopover event={popover.event} mask={popover.mask} {stored} {lang} {isMine} {personOf} onEdit={editEvent} on:close={() => { popover = undefined }} />
      </Dialog.Content>
    {/if}
  </Dialog.Root>
{:else}
<Popover.Root open={popover !== undefined} onOpenChange={(isOpen) => { if (!isOpen) popover = undefined }}>
  {#if popover !== undefined}
    <Popover.Content customAnchor={popover.target} side="right" align="start" class="w-80 gap-0 p-0" data-lich-pop>
      <EventPopover event={popover.event} mask={popover.mask} {stored} {lang} {isMine} {personOf} onEdit={editEvent} on:close={() => { popover = undefined }} />
    </Popover.Content>
  {/if}
</Popover.Root>
{/if}

<div bind:this={pointerAnchor} class="pointer-events-none fixed size-0" style:left="{anchorAt.x}px" style:top="{anchorAt.y}px" aria-hidden="true"></div>

{#if $deviceInfo.isMobile}
  <Dialog.Root open={quick !== undefined} onOpenChange={(isOpen) => { if (!isOpen) quick = undefined }}>
    {#if quick !== undefined}
      <Dialog.Content showCloseButton={false} data-lich-pop class="top-auto bottom-0 left-0 max-h-[90dvh] max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-b-none p-4 pb-6 sm:max-w-none">
        <QuickCreate bind:draft={quick.draft} {eventDuration} {lang} {firstDayOfWeek} {me} on:close={() => { quick = undefined }} on:more={(e) => { openMoreOptions(e.detail) }} />
      </Dialog.Content>
    {/if}
  </Dialog.Root>
{:else}
<Popover.Root open={quick !== undefined} onOpenChange={(isOpen) => { if (!isOpen) quick = undefined }}>
  {#if quick !== undefined}
    <Popover.Content customAnchor={quick.anchor} side={quick.side} align={quick.side === 'bottom' ? 'end' : 'start'} class="w-[26rem] max-w-[calc(100vw-2rem)] p-4" onInteractOutside={(e) => { if (isOnDraft(e.target)) e.preventDefault() }}>
      <QuickCreate bind:draft={quick.draft} {eventDuration} {lang} {firstDayOfWeek} {me} on:close={() => { quick = undefined }} on:more={(e) => { openMoreOptions(e.detail) }} />
    </Popover.Content>
  {/if}
</Popover.Root>
{/if}

<Dialog.Root open={dialog !== undefined} onOpenChange={(isOpen) => { if (!isOpen) dialog = undefined }}>
  {#if dialog !== undefined}
    <Dialog.Content class="top-[8vh] translate-y-0 gap-0 p-0 sm:max-w-2xl" data-lich-pop>
      <!-- EventDialog reads its props once at init, so a new request needs a fresh instance. -->
      {#key dialog}
        <EventDialog object={dialog.object} draft={dialog.draft} {lang} {stored} {personToSocial} on:close={() => { dialog = undefined }} />
      {/key}
    </Dialog.Content>
  {/if}
</Dialog.Root>

<style>
  .lich-progress {
    position: sticky;
    top: 0;
    z-index: 2;
    height: 2px;
    margin-bottom: -2px;
    overflow: hidden;
  }
  /* Same 300ms show delay as Loading.svelte and skeletons (servone-theme chrome.css). */
  .lich-progress::after {
    content: '';
    display: block;
    width: 30%;
    height: 100%;
    background: var(--primary);
    animation:
      reveal 150ms ease-out 300ms both,
      lich-progress-slide 1.2s ease-in-out 300ms infinite;
  }
  @keyframes lich-progress-slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .lich-progress::after {
      width: 100%;
      animation: reveal 1ms 300ms both;
    }
  }
</style>
