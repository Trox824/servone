<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import calendar, { AccessLevel, type Event, type ReccuringEvent, type ReccuringInstance } from '@hcengineering/calendar'
  import { formatName, type Person } from '@hcengineering/contact'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { RESOURCE_CLASS, type BookableResource } from '@servone/approvals/src/booking'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { markupToText } from '@hcengineering/text'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import love, { type Meeting } from '@hcengineering/love'
  import { AlignLeft, Box, Car, DoorOpen, Lock, Mail, MapPin, Package, Pencil, Trash2, TriangleAlert, Users, Video, X, Loader2 } from '@lucide/svelte'
  import { Button, buttonVariants } from '../../../../lib/components/ui/button'
  import { canJoin, peopleInCall } from '../../../love-resources/calls/context'
  import { infos } from '../../../love-resources/calls/live'
  import CopyGuestLink from '../../../love-resources/calls/components/CopyGuestLink.svelte'
  import { joinOrOpenMeeting } from '../meeting'
  import * as ToggleGroup from '../../../../lib/components/ui/toggle-group'
  import * as Avatar from '../../../../lib/components/ui/avatar'
  import * as AlertDialog from '../../../../lib/components/ui/alert-dialog'
  import * as RadioGroup from '../../../../lib/components/ui/radio-group'
  import * as Tooltip from '../../../../lib/components/ui/tooltip'
  import { Label } from '../../../../lib/components/ui/label'
  import { Input } from '../../../../lib/components/ui/input'
  import { ScrollArea } from '../../../../lib/components/ui/scroll-area'
  import { textOf, type StringKey } from '../strings'
  import PersonAvatar from './PersonAvatar.svelte'
  import { ANSWER_MARK } from './answer-mark'
  import { deleteOccurrence, type RecurringScope } from '../save'
  import {
    MAX_NOTE_LENGTH,
    answerFor,
    answers,
    guestReply,
    myCopy,
    occurrenceOf,
    proposalOf,
    rsvpUpdate,
    seriesId,
    stampProposal,
    type Answer,
    type GuestReply,
    type RsvpFields
  } from '../lib/rsvp'
  import { guestAccess, guestPermissionsOf, shownGuests } from '../lib/guests'
  import { recurrenceText } from '../lib/recurrence'
  import { whenText } from '../lib/format'
  import { spanOf } from '../lib/time'
  import type { Mask } from '../lib/mask'
  import type { CalEvent, Lang, Rsvp, Slot } from '../lib/types'
  import { bookingLine, bookingLook } from '../resources/state'
  import { resourceTextOf } from '../resources/strings'

  export let event: Event
  export let stored: Event[]
  export let lang: Lang
  export let mask: Mask
  export let isMine: (socialId: string) => boolean
  export let personOf: (socialId: string) => string | undefined
  export let onEdit: (e: Event) => void

  type Ask =
    | { kind: 'delete' }
    | { kind: 'deleteRecurring' }
    | { kind: 'respond', status: Rsvp, isClosing: boolean }

  const dispatch = createEventDispatcher<{ close: undefined }>()
  const client = getClient()
  const OPTIONS: Array<{ id: Rsvp, label: StringKey }> = [
    { id: 'accepted', label: 'Yes' },
    { id: 'declined', label: 'No' },
    { id: 'tentative', label: 'Maybe' }
  ]
  const SCOPE_LABEL: Record<RecurringScope, StringKey> = { current: 'ThisEvent', next: 'ThisAndFollowing', all: 'AllEvents' }
  const DELETE_SCOPES: RecurringScope[] = ['current', 'next', 'all']
  const RESPOND_SCOPES: RecurringScope[] = ['current', 'all']

  function isSeries (e: Event): e is ReccuringEvent {
    return e._class === calendar.class.ReccuringEvent
  }

  function isInstance (e: Event): e is ReccuringInstance {
    return e._class === calendar.class.ReccuringInstance
  }

  function isRsvp (picked: string): picked is Rsvp {
    return OPTIONS.some((o) => o.id === picked)
  }

  function isScope (picked: string): picked is RecurringScope {
    return DELETE_SCOPES.some((s) => s === picked)
  }

  $: t = textOf(lang)
  const stampOf = (e: CalEvent): string | undefined => e.servoneRsvp
  const noteOf = (e: CalEvent): string => e.servoneRsvpNote ?? ''
  const proposalStampOf = (e: CalEvent): string | undefined => e.servoneRsvpProposal

  let copies: Event[] = []
  let isCopiesLoaded = false
  const copiesQuery = createQuery()
  $: copiesQuery.query(calendar.class.Event, { eventId: seriesId(event) }, (found) => {
    copies = found
    isCopiesLoaded = true
  })
  $: known = copies.length > 0 ? copies : stored
  $: mine = myCopy(known, seriesId(event), isMine)
  $: organizerCopy = known.find((s) => s.eventId === seriesId(event) && s.access === AccessLevel.Owner)
  $: series = known.find((s) => s.eventId === seriesId(event))
  $: rules = series !== undefined && isSeries(series) ? series.rules : []
  $: occurrence = series !== undefined ? occurrenceOf(event, series, stored) : undefined
  $: isRecurring = isInstance(event)
  $: me = mine !== undefined ? answerFor(mine, occurrence) : 'none'
  $: isOrganizer = me === 'organizer' && mine !== undefined
  $: myInstance = isInstance(event) && isMine(event.user) ? event : undefined
  $: byPerson = answers(copies, personOf, occurrence)
  $: answerOf = (person: string): Answer => byPerson.get(person) ?? 'pending'

  $: access = guestAccess(isOrganizer, guestPermissionsOf(organizerCopy ?? mine ?? event))
  $: organizerPerson = organizerCopy !== undefined ? personOf(organizerCopy.user) : undefined
  $: myPerson = mine !== undefined ? personOf(mine.user) : undefined
  $: isParticipant = myPerson !== undefined && event.participants.some((p) => p === myPerson)
  $: canChange = mine !== undefined && (isOrganizer || mine.access === AccessLevel.Writer || isParticipant)
  $: canRespond = !isOrganizer && mine !== undefined && isParticipant
  $: alwaysShown = event.participants.filter((p) => p === organizerPerson || p === myPerson)
  $: listed = shownGuests(event.participants, access.canSeeGuests, alwaysShown)
  $: guests = [...listed.filter((p) => p === organizerPerson), ...listed.filter((p) => p !== organizerPerson)]
  $: externals = access.canSeeGuests ? event.externalParticipants ?? [] : []
  $: guestTotal = guests.length + externals.length
  $: hasGuests = externals.length > 0 || guests.some((p) => p !== organizerPerson)
  $: tally = guests.reduce(
    (sum, p) => {
      const answer = answerOf(p)
      if (answer === 'organizer' || answer === 'accepted') sum.yes += 1
      else if (answer === 'declined') sum.no += 1
      else if (answer === 'tentative') sum.maybe += 1
      else sum.pending += 1
      return sum
    },
    { yes: 0, no: 0, maybe: 0, pending: externals.length }
  )
  $: people = getPersonByPersonRefStore(event.participants)
  $: nameOf = (person: Event['participants'][number]): string => {
    const found = $people.get(person)
    return found !== undefined ? formatName(found.name) : ''
  }

  $: timed = occurrence ?? event
  $: when = whenText(spanOf(timed), timed.allDay, lang)
  $: repeatText = rules.length > 0 ? recurrenceText(rules, lang) : ''
  $: descriptionText = markupToText(event.description).trim()

  let ask: Ask | undefined
  let scope: RecurringScope = 'current'
  let isWorking = false
  let rsvpRemount = 0

  async function respond (status: Rsvp, picked: RecurringScope): Promise<void> {
    if (mine === undefined) return
    await client.update<Event & RsvpFields>(mine, rsvpUpdate(status, mine, picked === 'current' ? occurrence : undefined))
  }

  function pick (picked: string, isClosing: boolean): void {
    if (!isRsvp(picked)) {
      rsvpRemount += 1
      return
    }
    if (isRecurring && occurrence !== undefined) {
      scope = 'current'
      ask = { kind: 'respond', status: picked, isClosing }
      return
    }
    void respond(picked, 'all').then(() => { if (isClosing) dispatch('close') })
  }

  $: canPropose = mine !== undefined && !isRecurring && !event.allDay
  $: myProposal = mine !== undefined ? proposalOf(proposalStampOf(mine), mine) : undefined
  $: replyOf = (person: string): GuestReply | undefined => (organizerCopy === undefined ? undefined : guestReply(copies, person, personOf, organizerCopy))
  let proposing: { start: string, end: string } | undefined

  async function saveNote (text: string): Promise<void> {
    const note = text.trim().slice(0, MAX_NOTE_LENGTH)
    if (mine === undefined || note === noteOf(mine)) return
    await client.update<Event & RsvpFields>(mine, { servoneRsvpNote: note })
  }

  function localInput (ms: number): string {
    const d = new Date(ms)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }

  $: proposedSlot = proposing === undefined ? undefined : { start: new Date(proposing.start).getTime(), end: new Date(proposing.end).getTime() }
  $: isProposalValid = proposedSlot !== undefined && proposedSlot.end > proposedSlot.start

  async function sendProposal (): Promise<void> {
    if (mine === undefined || proposedSlot === undefined || !isProposalValid) return
    await client.update<Event & RsvpFields>(mine, { servoneRsvpProposal: stampProposal(proposedSlot, mine) })
    proposing = undefined
  }

  async function withdrawProposal (copy: Event): Promise<void> {
    await client.update<Event & RsvpFields>(copy, { servoneRsvpProposal: '' })
  }

  async function acceptProposal (proposal: Slot): Promise<void> {
    if (mine === undefined || !isOrganizer) return
    await client.update(mine, { date: proposal.start, dueDate: proposal.end })
  }

  function copyById (id: string): Event | undefined {
    return copies.find((c) => c._id === id)
  }

  function askDelete (): void {
    if (!isOrganizer) {
      pick('declined', true)
      return
    }
    scope = myInstance !== undefined ? 'current' : 'all'
    ask = isRecurring ? { kind: 'deleteRecurring' } : { kind: 'delete' }
  }

  function dismiss (isOpen: boolean): void {
    if (isOpen || isWorking) return
    if (ask?.kind === 'respond') rsvpRemount += 1
    ask = undefined
  }

  async function confirm (): Promise<void> {
    if (ask === undefined) return
    const current = ask
    isWorking = true
    try {
      if (current.kind === 'respond') {
        await respond(current.status, scope)
      } else if (current.kind === 'deleteRecurring' && myInstance !== undefined) {
        await deleteOccurrence(client, myInstance, scope)
      } else if (mine !== undefined) {
        await client.remove(mine)
      }
    } finally {
      isWorking = false
    }
    ask = undefined
    if (current.kind !== 'respond' || current.isClosing) dispatch('close')
  }

  $: askScopes = ask?.kind === 'respond' ? RESPOND_SCOPES : ask?.kind === 'deleteRecurring' ? DELETE_SCOPES : []
  $: askTitle = ask?.kind === 'respond' ? t('RespondRecurringTitle') : ask?.kind === 'deleteRecurring' ? t('DeleteRecurringTitle') : t('DeleteTitle')
  $: isDestructiveAsk = ask?.kind === 'delete' || ask?.kind === 'deleteRecurring'

  const hierarchy = client.getHierarchy()

  interface ActiveRequest extends Doc {
    attachedTo: Ref<Doc>
    requested: Array<Ref<Person>>
    status: string
  }
  const REQUEST_CLASS = 'request:class:Request' as Ref<Class<ActiveRequest>>
  const RESOURCE_ICON = { room: DoorOpen, car: Car, equipment: Package, other: Box }

  $: booking = mask === 'full' ? bookingLook(event) : undefined
  let resource: BookableResource | undefined
  const resourceQuery = createQuery()
  $: if (booking !== undefined && hierarchy.hasClass(RESOURCE_CLASS)) {
    resourceQuery.query(RESOURCE_CLASS, { _id: booking.resource as Ref<BookableResource> }, (found) => { resource = found[0] })
  } else {
    resourceQuery.unsubscribe()
    resource = undefined
  }
  let approver: Ref<Person> | undefined
  const requestQuery = createQuery()
  $: if (booking?.isPending === true) {
    requestQuery.query(
      REQUEST_CLASS,
      { attachedTo: { $in: [event._id, organizerCopy?._id].flatMap((id) => id ?? []) }, status: 'Active' },
      (found) => { approver = found[0]?.requested[0] }
    )
  } else {
    requestQuery.unsubscribe()
    approver = undefined
  }
  $: approverPeople = getPersonByPersonRefStore(approver === undefined ? [] : [approver])
  $: approverPerson = approver === undefined ? undefined : $approverPeople.get(approver)
  $: bookingText = booking === undefined || resource === undefined
    ? ''
    : bookingLine(resourceTextOf(lang), resource.name, booking.state, approverPerson === undefined ? undefined : formatName(approverPerson.name))
  $: isMeeting = mask === 'full' && hierarchy.hasMixin(event, love.mixin.Meeting)
  $: meetingRoom = isMeeting ? hierarchy.as<Event, Meeting>(event, love.mixin.Meeting).room : undefined
  $: inCall = meetingRoom !== undefined ? peopleInCall($infos, meetingRoom).length : 0
  $: isJoinable = isMeeting && canJoin(timed.date, timed.dueDate, inCall, Date.now())

  function meetingAction (): void {
    joinOrOpenMeeting(event, isJoinable)
    dispatch('close')
  }
</script>

<svelte:window on:keydown|capture={(e) => { if (e.key === 'Escape' && ask === undefined) dispatch('close') }} />

<Tooltip.Provider>
  <div class="flex w-full min-w-0 flex-col text-sm">
    <div class="flex items-center justify-end gap-0.5 px-1.5 pt-1.5">
      {#if isMeeting}
        <Button size="sm" class="mr-auto ml-2.5" variant={isJoinable ? 'default' : 'outline'} onclick={meetingAction}><Video />{t(isJoinable ? 'JoinMeeting' : 'OpenMeeting')}</Button>
      {/if}
      {#if mask === 'full' && canChange}
        <Tooltip.Root>
          <Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={t('Edit')} onclick={() => { onEdit(event) }}><Pencil /></Tooltip.Trigger>
          <Tooltip.Content>{t('Edit')}</Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger
            class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            aria-label={isOrganizer ? t('Delete') : t('RemoveFromMyCalendar')}
            disabled={!isCopiesLoaded}
            onclick={askDelete}
          ><Trash2 /></Tooltip.Trigger>
          <Tooltip.Content>{isOrganizer ? t('Delete') : t('RemoveFromMyCalendar')}</Tooltip.Content>
        </Tooltip.Root>
      {/if}
      <Tooltip.Root>
        <Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={t('Close')} onclick={() => { dispatch('close') }}><X /></Tooltip.Trigger>
        <Tooltip.Content>{t('Close')}</Tooltip.Content>
      </Tooltip.Root>
    </div>

    {#if mask !== 'full'}
      <div class="grid grid-cols-[1.25rem_1fr] gap-x-3 gap-y-1 px-4 pb-4">
        <Lock class="mt-0.5 size-4 text-muted-foreground" />
        <div class="font-semibold">{t('Busy')}</div>
        <span></span>
        <div class="text-xs tabular-nums text-muted-foreground">{when}</div>
        <span></span>
        <p class="m-0 pt-1 text-sm text-muted-foreground">{mask === 'private' ? t('OnlyPrivate') : t('OnlyFreeBusy')}</p>
      </div>
    {:else}
      <div class="grid grid-cols-[1.25rem_1fr] items-start gap-x-3 gap-y-3 px-4 pb-3">
        <span class="mt-1.5 size-3 rounded-sm bg-primary"></span>
        <div class="grid gap-0.5">
          <div class="text-base font-semibold leading-snug break-words">{event.title}</div>
          <div class="text-xs tabular-nums text-muted-foreground">{when}</div>
          {#if repeatText !== ''}<div class="text-xs text-muted-foreground">{repeatText}</div>{/if}
          <!-- Under the title, not in the action row: next to the button and icons the Vietnamese line truncates in w-80. -->
          {#if inCall > 0}<div class="text-xs tabular-nums text-muted-foreground">{t('InCallCount', { count: inCall })}</div>{/if}
        </div>

        {#if resource !== undefined && bookingText !== ''}
          <svelte:component this={RESOURCE_ICON[resource.type]} class="mt-0.5 size-4 text-muted-foreground" />
          <div class="break-words {booking?.isVoid === true ? 'text-muted-foreground' : ''}">{bookingText}</div>
        {/if}

        {#if event.location !== undefined && event.location !== ''}
          <MapPin class="mt-0.5 size-4 text-muted-foreground" />
          <div class="break-words">{event.location}</div>
        {/if}

        {#if hasGuests}
          <Users class="mt-0.5 size-4 text-muted-foreground" />
          <div class="grid min-w-0 gap-1">
            <div>
              <div>{t(guestTotal === 1 ? 'GuestCountOne' : 'GuestCount', { count: guestTotal })}</div>
              {#if isCopiesLoaded}
                <div class="text-xs text-muted-foreground">{t('GuestSummary', tally)}</div>
              {/if}
            </div>
            <!-- The viewport is size-full, so the height cap must sit on it, not on the root. -->
            <ScrollArea class="-ml-1 min-w-0 [&_[data-slot=scroll-area-viewport]]:max-h-44">
              <ul class="m-0 grid list-none p-0">
                {#each guests as p (p)}
                  {@const answer = answerOf(p)}
                  {@const mark = ANSWER_MARK[answer]}
                  {@const reply = p === organizerPerson ? undefined : replyOf(p)}
                  <li class="flex min-h-8 items-center gap-2 px-1 py-0.5">
                    <PersonAvatar person={p} />
                    <span class="grid min-w-0 flex-1">
                      <span class="truncate {answer === 'declined' ? 'text-muted-foreground line-through' : ''}">{nameOf(p)}</span>
                      {#if p === organizerPerson}<span class="truncate text-xs text-muted-foreground">{t('Organizer')}</span>{/if}
                      {#if reply !== undefined && reply.note !== ''}<span class="text-xs break-words text-muted-foreground">"{reply.note}"</span>{/if}
                      {#if isOrganizer && reply?.proposal !== undefined}
                        {@const proposal = reply.proposal}
                        {@const proposer = copyById(reply.copy._id)}
                        <span class="text-xs tabular-nums">{t('ProposedTime', { when: whenText(proposal, false, lang) })}</span>
                        <span class="flex gap-1 pt-0.5">
                          <Button size="xs" variant="outline" onclick={() => { void acceptProposal(proposal) }}>{t('AcceptProposal')}</Button>
                          {#if proposer !== undefined}
                            <Button size="xs" variant="ghost" onclick={() => { void withdrawProposal(proposer) }}>{t('DismissProposal')}</Button>
                          {/if}
                        </span>
                      {/if}
                    </span>
                    {#if isCopiesLoaded}
                      <span class="flex shrink-0 items-center" aria-label={t(mark.label)} title={t(mark.label)}>
                        <svelte:component this={mark.icon} class="size-3.5 {mark.tone}" />
                      </span>
                    {/if}
                  </li>
                {/each}
                {#each externals as email (email)}
                  <li class="flex h-8 items-center gap-2 px-1">
                    <Avatar.Root size="sm"><Avatar.Fallback><Mail class="size-3" /></Avatar.Fallback></Avatar.Root>
                    <span class="min-w-0 flex-1 truncate">{email}</span>
                    <span class="flex shrink-0 items-center" aria-label={t(ANSWER_MARK.pending.label)} title={t(ANSWER_MARK.pending.label)}>
                      <svelte:component this={ANSWER_MARK.pending.icon} class="size-3.5 {ANSWER_MARK.pending.tone}" />
                    </span>
                  </li>
                {/each}
              </ul>
            </ScrollArea>
          </div>
        {/if}

        {#if descriptionText !== ''}
          <AlignLeft class="mt-0.5 size-4 text-muted-foreground" />
          <p class="m-0 max-h-32 overflow-y-auto whitespace-pre-line break-words">{descriptionText}</p>
        {/if}
      </div>

      {#if isOrganizer && meetingRoom !== undefined}
        <div class="border-t px-4 py-2"><CopyGuestLink room={meetingRoom} meetingEnd={timed.dueDate} {lang} /></div>
      {/if}
      {#if canRespond && mine !== undefined}
        {#if me === 'pending' && stampOf(mine) !== undefined}
          <p class="m-0 flex items-center gap-1.5 border-t px-4 py-2 text-xs text-muted-foreground"><TriangleAlert class="size-3.5 shrink-0" />{t('ChangedTime')}</p>
        {/if}
        <div class="flex items-center justify-between gap-2 border-t px-4 py-2">
          <span class="text-sm text-muted-foreground">{t('Going')}</span>
          {#key rsvpRemount}
            <ToggleGroup.Root
              type="single"
              variant="outline"
              size="sm"
              value={me === 'accepted' || me === 'declined' || me === 'tentative' ? me : ''}
              disabled={!isCopiesLoaded}
              onValueChange={(picked) => { pick(picked, false) }}
            >
              {#each OPTIONS as option (option.id)}
                <ToggleGroup.Item value={option.id}>{t(option.label)}</ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
          {/key}
        </div>
        <div class="grid gap-2 px-4 pb-3">
          <Input
            class="h-7 text-xs"
            value={noteOf(mine)}
            maxlength={MAX_NOTE_LENGTH}
            placeholder={t('RsvpNotePlaceholder')}
            aria-label={t('RsvpNote')}
            disabled={!isCopiesLoaded}
            onchange={(e) => { void saveNote(e.currentTarget.value) }}
          />
          {#if canPropose}
            {#if proposing !== undefined}
              <div class="grid grid-cols-2 gap-2">
                <Input type="datetime-local" class="h-7 text-xs" aria-label={t('StartTime')} bind:value={proposing.start} />
                <Input type="datetime-local" class="h-7 text-xs" aria-label={t('EndTime')} bind:value={proposing.end} aria-invalid={!isProposalValid} />
              </div>
              <div class="flex justify-end gap-1">
                <Button size="xs" variant="ghost" onclick={() => { proposing = undefined }}>{t('Cancel')}</Button>
                <Button size="xs" disabled={!isProposalValid} onclick={() => { void sendProposal() }}>{t('SendProposal')}</Button>
              </div>
            {:else if myProposal !== undefined}
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="tabular-nums text-muted-foreground">{t('YouProposed', { when: whenText(myProposal, false, lang) })}</span>
                <Button size="xs" variant="ghost" onclick={() => { if (mine !== undefined) void withdrawProposal(mine) }}>{t('WithdrawProposal')}</Button>
              </div>
            {:else}
              <Button size="xs" variant="ghost" class="justify-self-start" onclick={() => { if (mine !== undefined) proposing = { start: localInput(mine.date), end: localInput(mine.dueDate) } }}>{t('ProposeTime')}</Button>
            {/if}
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</Tooltip.Provider>

<AlertDialog.Root open={ask !== undefined} onOpenChange={dismiss}>
  <AlertDialog.Content size="sm">
    <AlertDialog.Header>
      <AlertDialog.Title>{askTitle}</AlertDialog.Title>
      {#if ask?.kind === 'delete'}
        <AlertDialog.Description>{t('DeleteBody', { title: event.title })}</AlertDialog.Description>
      {/if}
    </AlertDialog.Header>
    {#if askScopes.length > 0}
      <RadioGroup.Root value={scope} class="gap-3" onValueChange={(picked) => { if (isScope(picked)) scope = picked }}>
        {#each askScopes as option (option)}
          <div class="flex items-center gap-3">
            <RadioGroup.Item
              id="lich-scope-{option}"
              value={option}
              disabled={ask?.kind === 'deleteRecurring' && option !== 'all' && myInstance === undefined}
            />
            <Label for="lich-scope-{option}" class="font-normal">{t(SCOPE_LABEL[option])}</Label>
          </div>
        {/each}
      </RadioGroup.Root>
    {/if}
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={isWorking}>{t('Cancel')}</AlertDialog.Cancel>
      <AlertDialog.Action variant={isDestructiveAsk ? 'destructive' : 'default'} disabled={isWorking} onclick={confirm}>
        {#if isWorking}<Loader2 class="animate-spin" />{/if}{isDestructiveAsk ? t('Delete') : t('Ok')}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
