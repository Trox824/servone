<script lang="ts">
  import { onMount } from 'svelte'
  import { getAllEvents, type Event } from '@hcengineering/calendar'
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import { AccountRole, generateId, getCurrentAccount, type PersonId, type Ref } from '@hcengineering/core'
  import love, { MeetingStatus, type MeetingMinutes, type Room } from '@hcengineering/love'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { addZero, Component, Label, location } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { languageStore } from '@hcengineering/theme'
  import { CalendarDays, ChevronLeft, MessagesSquare, Plus, Users, Zap } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import EventDialog from '../../../calendar-resources/lich/components/EventDialog.svelte'
  import { dayHeading } from '../../../calendar-resources/lich/lib/format'
  import { seriesId } from '../../../calendar-resources/lich/lib/rsvp'
  import { DAY_MS, startOfDay } from '../../../calendar-resources/lich/lib/time'
  import { emptyCopy } from '../../../../onboarding/empty-copy'
  import { createMeeting } from '../../meetings'
  import { rooms } from '../../stores'
  import { navigateToMeetingMinutes } from '../../utils'
  import { joinContext } from '../join'
  import { listMeetings, PAST_WINDOW_MS, type MeetingRow } from '../list'
  import { infos, myInfo } from '../live'
  import { GROUP_LABEL, textOf, type Lang } from '../strings'
  import MeetingDetail from './MeetingDetail.svelte'

  const SPLIT_MIN_PX = 860
  const LOOKAHEAD_MS = 60 * DAY_MS
  const CLOCK_TICK_MS = 30 * 1000
  const SKELETON_ROWS = [0, 1, 2, 3]

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const account = getCurrentAccount()
  const me = getCurrentEmployee()
  const isGuest = account.role === AccountRole.Guest

  $: lang = ($languageStore === 'vi' ? 'vi' : 'en') satisfies Lang
  $: t = textOf(lang)

  let now = Date.now()
  onMount(() => {
    const timer = setInterval(() => { now = Date.now() }, CLOCK_TICK_MS)
    return () => { clearInterval(timer) }
  })

  let stored: Event[] = []
  let isLoaded = false
  createQuery().query(love.mixin.Meeting, { user: { $in: account.socialIds } }, (found) => {
    stored = found
    isLoaded = true
  })

  let startedAt = new Map<string, number>()
  createQuery().query(love.class.MeetingMinutes, { status: MeetingStatus.Active }, (found) => {
    startedAt = new Map(found.map((minutes) => [minutes.attachedTo, minutes.createdOn ?? minutes.modifiedOn]))
  })

  let finishedMinutes: MeetingMinutes[] = []
  createQuery().query(love.class.MeetingMinutes, { status: MeetingStatus.Finished }, (found) => {
    finishedMinutes = found
  }, { sort: { createdOn: -1 }, limit: 30 })

  let socialToPerson = new Map<string, string>()
  let personToSocial = new Map<string, PersonId[]>()
  createQuery().query(contact.class.SocialIdentity, { attachedToClass: contact.class.Person }, (identities) => {
    const byPerson = new Map<string, PersonId[]>()
    for (const identity of identities) byPerson.set(identity.attachedTo, [...(byPerson.get(identity.attachedTo) ?? []), identity._id])
    personToSocial = byPerson
    socialToPerson = new Map(identities.map((identity) => [identity._id, identity.attachedTo]))
  })
  const personOf = (socialId: string): string | undefined => socialToPerson.get(socialId)

  $: scheduled = getAllEvents(stored, now - PAST_WINDOW_MS, now + LOOKAHEAD_MS)
    .filter((event) => event.participants.includes(me))
    .map((event) => ({ event, room: hierarchy.as(event, love.mixin.Meeting).room }))
  let guestCall: string | undefined
  $: guestCall = linkCall ?? guestCall
  $: shownRooms = isGuest ? $rooms.filter((room) => room._id === guestCall || room._id === $myInfo?.room) : $rooms
  $: sections = listMeetings(scheduled, shownRooms, $infos, startedAt, now)
  $: rows = sections.flatMap((section) => section.rows)
  $: scheduledRooms = new Set(scheduled.map(({ room }) => room))
  $: pastCalls = finishedMinutes.filter((minutes) => !scheduledRooms.has(minutes.attachedTo as Ref<Room>))

  let width = 0
  $: isSplit = width >= SPLIT_MIN_PX
  let selectedKey: string | undefined
  let pickedMinutes: MeetingMinutes | undefined
  $: picked = rows.find((row) => row.key === selectedKey)
  $: shown = picked ?? (isSplit ? rows[0] : undefined)
  $: isDetailOpen = picked !== undefined || pickedMinutes !== undefined

  let appliedLink: string | undefined
  $: linkMeeting = $location.query?.meeting ?? undefined
  $: linkCall = $location.query?.call ?? undefined
  $: applyLink(linkMeeting, linkCall, rows)

  function applyLink (meetingId: string | undefined, callId: string | undefined, candidates: Array<MeetingRow<Event>>): void {
    const link = meetingId !== undefined ? `meeting:${meetingId}` : callId !== undefined ? `call:${callId}` : undefined
    if (link === undefined || link === appliedLink) return
    const linked = meetingId !== undefined ? stored.find((event) => event._id === meetingId) : undefined
    const match = meetingId !== undefined
      ? candidates.find((row) => row.event !== undefined && linked !== undefined && seriesId(row.event) === seriesId(linked))
      : candidates.find((row) => row.room === callId)
    if (match === undefined) return
    appliedLink = link
    selectedKey = match.key
    pickedMinutes = undefined
  }

  function roomOf (row: MeetingRow<Event>): Room {
    const room = $rooms.find((candidate) => candidate._id === row.room)
    if (room === undefined) throw new Error(`Room ${row.room} is not loaded`)
    return room
  }

  let isCreating = false

  const clock = (ts: number): string => `${addZero(new Date(ts).getHours())}:${addZero(new Date(ts).getMinutes())}`

  function timeLines (row: MeetingRow<Event>): [string, string] {
    if (row.event === undefined) return [clock(row.start), '']
    if (startOfDay(row.start) === startOfDay(now)) return [clock(row.start), clock(row.end)]
    return [dayHeading(row.start, lang), clock(row.start)]
  }
</script>

<div class="meetings-app flex h-full w-full min-w-0 flex-col bg-background text-[13px]" bind:clientWidth={width}>
  <header class="flex h-11 shrink-0 items-center gap-2 border-b pr-3 pl-4">
    <h1 class="m-0 flex-1 text-sm font-semibold tracking-tight">{t('Meetings')}</h1>
    {#if !isGuest}
      <Button variant="outline" size="sm" onclick={() => { void joinContext(generateId(), t('QuickMeeting')) }}><Zap />{t('MeetNow')}</Button>
      <Button size="sm" onclick={() => { isCreating = true }}><Plus />{t('NewMeetingLabel')}</Button>
    {/if}
  </header>

  {#if !isLoaded}
    <div class="grid gap-1 p-2" style:max-width={isSplit ? '360px' : undefined} aria-busy="true">
      {#each SKELETON_ROWS as row (row)}<Skeleton class="h-[52px] w-full rounded-lg" />{/each}
    </div>
  {:else if rows.length === 0 && pastCalls.length === 0}
    <div class="grid flex-1 place-items-center p-4">
      <div class="grid max-w-sm justify-items-center gap-3 text-center">
        {#if isGuest}
          <p class="m-0 text-muted-foreground" aria-live="polite">{t('GuestWaiting')}</p>
        {:else}
          <p class="m-0 text-foreground"><Label label={emptyCopy.meetings} /></p>
          <Button data-track="meetings.create.open" size="sm" onclick={() => { isCreating = true }}><Plus /><Label label={emptyCopy.meetingsAction} /></Button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="grid min-h-0 flex-1" style:grid-template-columns={isSplit ? '360px minmax(0, 1fr)' : '1fr'}>
      {#if isSplit || !isDetailOpen}
        <div class="min-h-0 overflow-y-auto pt-1.5 pb-6" class:border-r={isSplit} role="listbox" aria-label={t('Meetings')}>
          {#each sections as section (section.group)}
            <div class="sticky -top-1.5 z-[1] mt-2 flex h-8 items-center gap-2 bg-background px-4 text-xs font-medium text-muted-foreground">
              {#if section.group === 'live'}<span class="size-[7px] shrink-0 rounded-full bg-primary ring-3 ring-primary/10" aria-hidden="true"></span>{/if}
              <span class:text-foreground={section.group === 'live'}>{t(GROUP_LABEL[section.group])}</span>
              <span class="tabular-nums opacity-80">{section.rows.length}</span>
            </div>
            {#each section.rows as row (row.key)}
              {@const [line1, line2] = timeLines(row)}
              <button
                type="button"
                role="option"
                aria-selected={pickedMinutes === undefined && shown?.key === row.key}
                class="mx-1.5 grid min-h-[52px] w-[calc(100%-12px)] grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left hover:bg-accent aria-selected:bg-primary/10"
                on:click={() => { selectedKey = row.key; pickedMinutes = undefined }}
              >
                <span class="text-xs leading-tight tabular-nums text-muted-foreground">{line1}{#if line2 !== ''}<br />{line2}{/if}</span>
                <span class="min-w-0">
                  <span class="block truncate font-medium" class:text-muted-foreground={row.group === 'past'}>{row.title}</span>
                  <span class="mt-[3px] flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {#if row.event !== undefined}<CalendarDays class="size-3 shrink-0" /><span class="truncate">{t('Calendar')}</span>
                    {:else}<MessagesSquare class="size-3 shrink-0" /><span class="truncate">{row.title}</span>{/if}
                  </span>
                </span>
                <span class="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  {#if row.group === 'live'}
                    <span class="size-[7px] shrink-0 rounded-full bg-primary ring-3 ring-primary/10" aria-hidden="true"></span><span class="text-foreground">{row.inCall.length}</span>
                  {:else}
                    <Users class="size-3.5" />{row.event?.participants.length ?? row.inCall.length}
                  {/if}
                </span>
              </button>
            {/each}
          {/each}
          {#if pastCalls.length > 0}
            <div class="sticky -top-1.5 z-[1] mt-2 flex h-8 items-center gap-2 bg-background px-4 text-xs font-medium text-muted-foreground">
              <span>{t('PastCalls')}</span>
              <span class="tabular-nums opacity-80">{pastCalls.length}</span>
            </div>
            {#each pastCalls as minutes (minutes._id)}
              <button
                type="button"
                role="option"
                aria-selected={pickedMinutes?._id === minutes._id}
                class="mx-1.5 grid min-h-[52px] w-[calc(100%-12px)] grid-cols-[88px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left hover:bg-accent aria-selected:bg-primary/10"
                on:click={() => { pickedMinutes = minutes; selectedKey = undefined }}
              >
                <span class="whitespace-nowrap text-xs leading-tight tabular-nums text-muted-foreground">{dayHeading(minutes.createdOn ?? minutes.modifiedOn, lang)}<br />{clock(minutes.createdOn ?? minutes.modifiedOn)}</span>
                <span class="truncate font-medium text-muted-foreground">{minutes.title}</span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
      {#if isSplit || isDetailOpen}
        <div class="min-h-0 min-w-0 overflow-y-auto bg-card">
          {#if pickedMinutes !== undefined}
            <div class="flex h-full min-h-0 flex-col">
              {#if !isSplit}
                <div class="shrink-0 px-4 pt-3">
                  <Button variant="ghost" size="sm" class="-ml-1.5 text-muted-foreground" onclick={() => { pickedMinutes = undefined }}><ChevronLeft />{t('Back')}</Button>
                </div>
              {/if}
              {#key pickedMinutes._id}
                <div class="min-h-0 flex-1">
                  <Component is={view.component.EditDoc} props={{ _id: pickedMinutes._id, _class: pickedMinutes._class, embedded: true }} />
                </div>
              {/key}
            </div>
          {:else if shown !== undefined}
            {#key shown.key}
              <MeetingDetail
                row={shown}
                {lang}
                {now}
                {stored}
                {personOf}
                startedAt={startedAt.get(shown.room) ?? shown.start}
                isInCall={$myInfo?.room === shown.room}
                isNarrow={!isSplit}
                onJoin={(row) => { void createMeeting(roomOf(row)) }}
                onOpenCall={(row) => { void navigateToMeetingMinutes(roomOf(row)) }}
                onOpenMinutes={(minutes) => { pickedMinutes = minutes }}
                onBack={() => { selectedKey = undefined }}
              />
            {/key}
          {:else}
            <div class="grid h-full place-items-center text-muted-foreground">{t('PickMeeting')}</div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<Dialog.Root open={isCreating} onOpenChange={(isOpen) => { if (!isOpen) isCreating = false }}>
  {#if isCreating}
    <Dialog.Content class="top-[8vh] translate-y-0 gap-0 p-0 sm:max-w-2xl">
      <EventDialog meeting={true} {lang} stored={[]} {personToSocial} on:close={() => { isCreating = false }} />
    </Dialog.Content>
  {/if}
</Dialog.Root>
