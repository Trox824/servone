<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { deepEqual } from 'fast-equals'
  import calendar, { AccessLevel, type Calendar, type Event, type ReccuringEvent, type ReccuringInstance } from '@hcengineering/calendar'
  import { getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { getCurrentAccount, type DocumentUpdate, type Markup, type PersonId, type Ref } from '@hcengineering/core'
  import { EmptyMarkup, areEqualMarkups, jsonToMarkup, markupToText, nodeDoc, nodeParagraph, nodeText } from '@hcengineering/text'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { deviceOptionsStore as deviceInfo, getUserTimezone } from '@hcengineering/ui'
  import love from '@hcengineering/love'
  import type { BookableResource } from '@servone/approvals/src/booking'
  import { CalendarClock, CalendarCog, ChevronRight, ExternalLink, Globe, Loader2, Lock, MapPin, TriangleAlert, Video, X } from '@lucide/svelte'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import * as Select from '../../../../lib/components/ui/select'
  import * as InputGroup from '../../../../lib/components/ui/input-group'
  import * as Alert from '../../../../lib/components/ui/alert'
  import { Button } from '../../../../lib/components/ui/button'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
    import { Textarea } from '../../../../lib/components/ui/textarea'
  import { calendarStore, isReadOnly, saveUTC, updateReccuringInstance } from '../../utils'
  import { makeMeeting } from '../../../love-resources/calls/join'
  import { MAX_CALL_MINUTES } from '../../../love-resources/calls/context'
  import { whenText } from '../lib/format'
  import {
    OWN_COPY_FIELDS,
    guestAccess,
    guestPermissionsOf,
    permissionFields,
    type EventField,
    type GuestPermissions,
    type PermissionFields
  } from '../lib/guests'
  import { answers, occurrenceOf, seriesId } from '../lib/rsvp'
  import { spanOf, startOfDay, workingSlot } from '../lib/time'
  import type { Lang } from '../lib/types'
  import { VISIBILITY_CHOICES, choiceOf, isVisibilityChoice, type VisibilityChoice } from '../lib/visibility'
  import { createEvent, eventDurationFor, findPrimaryCalendar, newDraft, remindersFor, visibilityUpdate, type EventDraft } from '../save'
  import { textOf, type StringKey } from '../strings'
  import FindTime from './FindTime.svelte'
  import ResourcePicker from '../resources/ResourcePicker.svelte'
  import {
    bookingChange,
    datesText,
    heldResource,
    isRebook,
    refusedStarts,
    sendsForApproval,
    type BookedEvent,
    type BookingProblem
  } from '../resources/booking-form'
  import { resourceTextOf } from '../resources/strings'
  import { copyFor } from './fields/copy'
  import { atMinutes, beforeText, daySlots, durationText, minutesOfDay } from './fields/time-slots'
  import DatePicker from './fields/DatePicker.svelte'
  import TimeSelect from './fields/TimeSelect.svelte'
  import RepeatSelect from './fields/RepeatSelect.svelte'
  import GuestPicker from './fields/GuestPicker.svelte'
  import ReminderField from './fields/ReminderField.svelte'

  export let object: Event | undefined = undefined
  export let draft: EventDraft | undefined = undefined
  export let lang: Lang
  export let stored: Event[]
  export let personToSocial: Map<string, PersonId[]>
  export let meeting = false

  type Shared = Event & Partial<PermissionFields>

  const dispatch = createEventDispatcher<{ close: undefined }>()
  const client = getClient()
  const account = getCurrentAccount()
  const me = getCurrentEmployee()
  const MEETING_DURATION = MAX_CALL_MINUTES * 60 * 1000
  const DEFAULT_DURATION = meeting ? MEETING_DURATION : eventDurationFor($calendarStore)
  const ALL_DAY_DURATION = 24 * 60 * 60 * 1000 - 1
  const URL_PATTERN = /^https?:\/\/\S+$/i
  const VISIBILITY_OPTION: Record<VisibilityChoice, { label: StringKey, hint?: StringKey, icon: typeof Globe }> = {
    default: { label: 'VisibilityDefault', hint: 'VisibilityDefaultHint', icon: CalendarCog },
    public: { label: 'VisibilityPublic', hint: 'ShareFullHint', icon: Globe },
    freeBusy: { label: 'VisibilityFreeBusy', hint: 'ShareFreeBusyHint', icon: CalendarClock },
    private: { label: 'VisibilityPrivate', hint: 'SharePrivateHint', icon: Lock }
  }

  const isInstance = (e: Event): e is ReccuringInstance => e._class === calendar.class.ReccuringInstance
  const isSeries = (e: Event): e is ReccuringEvent => e._class === calendar.class.ReccuringEvent || isInstance(e)
  const isOwn = (e: Event): boolean => account.socialIds.includes(e.user)

  function unclip (e: Event): Event {
    const storedDoc = stored.find((s) => s._id === e._id)
    if (storedDoc !== undefined) return storedDoc
    if (!isInstance(e)) return e
    const series = stored.find((s) => s.eventId === e.recurringEventId && s.calendar === e.calendar)
    const occurrence = series === undefined ? undefined : occurrenceOf(e, series, stored)
    return occurrence === undefined ? e : { ...e, date: occurrence.date, dueDate: occurrence.dueDate }
  }

  const unclipped = object === undefined ? undefined : unclip(object)
  const ownCopy = unclipped === undefined || isOwn(unclipped) ? undefined : stored.find((s) => s.eventId === unclipped.eventId && isOwn(s))
  const editing = ownCopy ?? unclipped
  const seed = draft ?? newDraft(workingSlot(Date.now(), DEFAULT_DURATION), false, me)
  const isGuest = editing !== undefined && isReadOnly(editing)
  const canSave = editing === undefined || !isGuest || isOwn(editing)
  const access = guestAccess(!isGuest, editing === undefined ? seed.guestPermissions : guestPermissionsOf(editing))
  const can = (field: EventField): boolean => canSave && access.fields.has(field)
  const isCompact = isGuest && !access.fields.has('title')
  const hasSharedFields = [...access.fields].some((field) => !OWN_COPY_FIELDS.has(field))
  $: hasSharedEdits = isCompact ? addedGuests.length + addedEmails.length > 0 : hasSharedFields

  const initial = editing !== undefined ? spanOf(editing) : { start: seed.start, end: seed.end }
  let title = editing?.title ?? seed.title
  let startDate = initial.start
  let dueDate = initial.end
  let allDay = editing?.allDay ?? seed.allDay
  let participants: Array<Ref<Person>> = [...(editing?.participants ?? seed.participants)]
  let externalParticipants = [...(editing?.externalParticipants ?? seed.externalParticipants)]
  let addedGuests: Array<Ref<Person>> = []
  let addedEmails: string[] = []
  let reminders = [...(editing?.reminders ?? seed.reminders ?? [])]
  let isReminderPicked = editing !== undefined || seed.reminders !== undefined
  let visibility: VisibilityChoice = editing !== undefined ? choiceOf(editing.visibility) : seed.visibility
  let isBusy = editing?.blockTime ?? seed.isBusy
  let permissions: GuestPermissions = editing !== undefined ? guestPermissionsOf(editing) : seed.guestPermissions
  let locationText = editing?.location ?? seed.location ?? ''
  const originalDescription = editing?.description ?? seed.description
  const initialDescriptionText = markupToText(originalDescription)
  let descriptionText = initialDescriptionText
  const isRichDescription = !areEqualMarkups(textToMarkup(initialDescriptionText), originalDescription)
  const initialRules = editing !== undefined ? (isSeries(editing) ? editing.rules : []) : seed.rules
  let rules = [...initialRules]
  const timeZone = editing?.timeZone ?? seed.timeZone
  const canRepeat = can('repeat') && (editing === undefined || isSeries(editing))
  const isForeignZone = timeZone !== getUserTimezone()
  const wasMeeting = editing !== undefined && client.getHierarchy().hasMixin(editing, love.mixin.Meeting)
  let isMeeting = editing === undefined ? meeting || seed.isMeeting : wasMeeting
  const canToggleMeeting = canSave && !isGuest && !wasMeeting
  const booked: BookedEvent | undefined = editing
  const heldId = heldResource(booked)
  const initialAllDay = allDay
  let resourceId: string | undefined = seed.resource ?? heldId
  let pickedResource: BookableResource | undefined
  let bookingProblem: BookingProblem | undefined
  let refusal: { key: string, text: string } | undefined

  let isMoreOpen = false
  let isSaving = false
  let isSaveFailed = false

  let primaryId: Ref<Calendar> | undefined
  onMount(async () => {
    if (!isReminderPicked) primaryId = await findPrimaryCalendar(client, $calendarStore)
  })
  $: if (!isReminderPicked && primaryId !== undefined) reminders = remindersFor($calendarStore, primaryId, allDay)

  let copies: Event[] = []
  const copiesQuery = createQuery()
  if (editing !== undefined) {
    copiesQuery.query(calendar.class.Event, { eventId: seriesId(editing) }, (found) => {
      copies = found
    })
  }
  $: socialToPerson = new Map<string, string>([...personToSocial].flatMap(([person, ids]) => ids.map((id): [string, string] => [id, person])))
  $: personOf = (socialId: string): string | undefined => socialToPerson.get(socialId)
  $: occurrence = editing === undefined || copies.length === 0 ? undefined : occurrenceOf(editing, copies[0], stored)
  $: guestAnswers = answers(copies, personOf, occurrence)
  $: organizerCopy = copies.find((c) => c.access === AccessLevel.Owner)
  $: organizer = editing === undefined ? me : organizerCopy === undefined ? undefined : personOf(organizerCopy.user)
  $: invited = participants.filter((p) => p !== organizer)
  $: countOf = (answer: string): number => invited.filter((p) => guestAnswers.get(p) === answer).length
  $: pendingCount = invited.length - countOf('accepted') - countOf('declined') - countOf('tentative') + externalParticipants.length

  $: t = copyFor(lang)
  $: text = textOf(lang)
  $: firstDayOfWeek = $deviceInfo.firstDayOfWeek
  $: guests = participants.filter((p) => p !== me)
  $: startMinutes = minutesOfDay(startDate)
  $: endDay = startOfDay(dueDate)
  $: startOptions = daySlots(startMinutes).map((minutes) => ({ minutes }))
  $: endOptions = daySlots(minutesOfDay(dueDate)).map((minutes) => {
    const end = atMinutes(endDay, minutes)
    return end > startDate ? { minutes, hint: durationText(end - startDate, lang) } : { minutes, isDisabled: true }
  })
  $: visibilityOption = VISIBILITY_OPTION[visibility]
  $: isLocationLink = URL_PATTERN.test(locationText.trim())
  $: isNew = editing === undefined
  $: isMultiDay = startOfDay(dueDate) !== startOfDay(startDate)
  $: hasLocationField = !isMeeting || locationText !== ''
  $: isMoved = startDate !== initial.start || dueDate !== initial.end || allDay !== initialAllDay || !deepEqual(rules, initialRules)
  $: isRebooking = isRebook(heldId, resourceId, isMoved)
  $: bookingDraft = { start: startDate, end: dueDate, allDay, rules, timeZone }
  $: draftKey = `${resourceId}|${startDate}|${dueDate}|${allDay}|${JSON.stringify(rules)}`
  $: canSubmit = canSave && !isSaving && (!isNew || title.trim() !== '') && bookingProblem === undefined
  $: heading = text(isNew ? (isMeeting ? 'NewMeeting' : 'NewEvent') : 'EditEvent')
  $: submitLabel = sendsForApproval(pickedResource, isRebooking)
    ? resourceTextOf(lang)('SendForApproval')
    : text(isNew ? (isMeeting ? 'ScheduleMeeting' : 'CreateEvent') : 'Save')
  $: moreSummary = [
    reminders.length === 0 ? t('noReminders') : reminders.map((ms) => beforeText(ms, lang)).join(', '),
    text(isBusy ? 'Busy' : 'Free'),
    text(visibilityOption.label)
  ].join(' · ')

  function textToMarkup (plain: string): Markup {
    const lines = plain.split('\n').map((line) => line.trimEnd()).filter((line) => line !== '')
    if (lines.length === 0) return EmptyMarkup
    return jsonToMarkup(nodeDoc(...lines.map((line) => nodeParagraph(nodeText(line)))))
  }

  function setAllDay (isChecked: boolean): void {
    allDay = isChecked
    isBusy = !allDay
    if (allDay) {
      startDate = startOfDay(startDate)
      dueDate = dueDate - startDate < ALL_DAY_DURATION ? startDate + ALL_DAY_DURATION : new Date(dueDate).setHours(23, 59, 59, 999)
    } else {
      dueDate = startDate + DEFAULT_DURATION
    }
  }

  function moveStart (next: number): void {
    dueDate += next - startDate
    startDate = next
  }

  function setStartDay (day: number): void {
    moveStart(allDay ? startOfDay(day) : atMinutes(day, startMinutes))
  }

  function setEndDay (day: number): void {
    const next = allDay ? new Date(day).setHours(23, 59, 59, 999) : atMinutes(day, minutesOfDay(dueDate))
    dueDate = next > startDate ? next : startDate + (allDay ? ALL_DAY_DURATION : DEFAULT_DURATION)
  }

  function setPermission (key: keyof GuestPermissions, isChecked: boolean): void {
    permissions = { ...permissions, [key]: isChecked }
  }

  function savedTitle (): string {
    const trimmed = title.trim()
    return trimmed === '' ? text('NoTitle') : trimmed
  }

  function savedDescription (): Markup {
    return descriptionText === initialDescriptionText ? originalDescription : textToMarkup(descriptionText)
  }

  function savedLocation (): string | undefined {
    const typed = locationText.trim()
    return typed === '' && (editing?.location ?? '') === '' ? editing?.location : typed
  }

  async function saveOwnFields (own: Event): Promise<void> {
    const update: DocumentUpdate<Event> = {}
    if (!deepEqual(own.reminders ?? [], reminders)) update.reminders = reminders
    if (own.blockTime !== isBusy) update.blockTime = isBusy
    if (Object.keys(update).length === 0) return
    if (isInstance(own) && own.virtual === true) {
      const base = await client.findOne(calendar.class.ReccuringEvent, { calendar: own.calendar, eventId: own.recurringEventId })
      if (base !== undefined) await client.update(base, update)
      return
    }
    await client.update(own, update)
  }

  async function organizerTarget (own: Event): Promise<Event> {
    const missing = new Error(`Organizer copy of ${seriesId(own)} not found`)
    if (!isInstance(own)) {
      const single = await client.findOne(calendar.class.Event, { eventId: own.eventId, access: AccessLevel.Owner })
      if (single === undefined) throw missing
      return single
    }
    if (own.virtual !== true) {
      const override = await client.findOne(calendar.class.ReccuringInstance, { eventId: own.eventId, access: AccessLevel.Owner })
      if (override === undefined) throw missing
      return override
    }
    const series = await client.findOne(calendar.class.ReccuringEvent, { eventId: own.recurringEventId, access: AccessLevel.Owner })
    if (series === undefined) throw missing
    return { ...own, calendar: series.calendar, user: series.user, access: series.access, space: series.space }
  }

  async function saveShared (target: BookedEvent): Promise<void> {
    const update: DocumentUpdate<Event> = {}
    if (can('title') && target.title !== savedTitle()) update.title = savedTitle()
    if (can('description')) {
      const description = savedDescription()
      if (target.description !== description) update.description = description
    }
    if (can('location')) {
      const location = savedLocation()
      if (target.location !== location) update.location = location
    }
    if (can('time')) {
      const savedStart = allDay ? saveUTC(startDate) : startDate
      const savedDue = allDay ? saveUTC(dueDate) : dueDate
      if (target.allDay !== allDay) update.allDay = allDay
      if (target.date !== savedStart || target.allDay !== allDay) update.date = savedStart
      if (target.dueDate !== savedDue || target.allDay !== allDay) update.dueDate = savedDue
    }
    const booking = bookingChange(heldId, resourceId, pickedResource, isMoved)
    Object.assign(update, booking)
    if (can('guests')) {
      const nextParticipants = isCompact ? [...new Set([...target.participants, ...addedGuests])] : participants
      const nextEmails = isCompact ? [...new Set([...(target.externalParticipants ?? []), ...addedEmails])] : externalParticipants
      if (!deepEqual(target.participants, nextParticipants)) update.participants = nextParticipants
      if (!deepEqual(target.externalParticipants ?? [], nextEmails)) update.externalParticipants = nextEmails
    }
    if (!isGuest) {
      if (!deepEqual(target.reminders ?? [], reminders)) update.reminders = reminders
      if (target.blockTime !== isBusy) update.blockTime = isBusy
    }
    const isVisibilityChanged = can('visibility') && choiceOf(target.visibility) !== visibility
    const seriesLevel: DocumentUpdate<Shared> = {}
    if (isVisibilityChanged) Object.assign(seriesLevel, visibilityUpdate(visibility))
    if (can('guestPermissions') && !deepEqual(guestPermissionsOf(target), permissions)) Object.assign(seriesLevel, permissionFields(permissions))
    const isRulesChanged = canRepeat && !deepEqual(initialRules, rules)

    if (!isSeries(target)) {
      const single: DocumentUpdate<Shared> = { ...update, ...seriesLevel }
      if (Object.keys(single).length > 0) await client.update<Shared>(target, single)
      return
    }
    if (!isInstance(target)) {
      const whole: DocumentUpdate<ReccuringEvent & Partial<PermissionFields>> = { ...update, ...seriesLevel }
      if (isRulesChanged) whole.rules = rules
      if (Object.keys(whole).length > 0) await client.update<ReccuringEvent & Partial<PermissionFields>>(target, whole)
      return
    }
    if (Object.keys(seriesLevel).length > 0) {
      const series = await client.findOne(calendar.class.ReccuringEvent, { calendar: target.calendar, eventId: target.recurringEventId })
      if (series !== undefined) await client.update<ReccuringEvent & Partial<PermissionFields>>(series, seriesLevel)
    }
    if (isVisibilityChanged && target.virtual !== true) Object.assign(update, visibilityUpdate(visibility))
    const instanceUpdate: DocumentUpdate<ReccuringEvent> = { ...update }
    if (target.virtual === true && heldId !== undefined && Object.keys(instanceUpdate).length > 0) {
      Object.assign(instanceUpdate, { servoneResource: heldId, servoneBookingState: target.servoneBookingState }, booking)
    }
    if (isRulesChanged) instanceUpdate.rules = rules
    if (Object.keys(instanceUpdate).length > 0) await updateReccuringInstance(instanceUpdate, target)
  }

  function toDraft (): EventDraft {
    return {
      title,
      start: startDate,
      end: dueDate,
      allDay,
      rules,
      participants,
      externalParticipants,
      reminders: isReminderPicked ? reminders : undefined,
      visibility,
      isBusy,
      location: savedLocation(),
      description: savedDescription(),
      guestPermissions: permissions,
      timeZone,
      isMeeting,
      resource: pickedResource?._id
    }
  }

  async function meetingFor (seriesEventId: string): Promise<void> {
    const target = await client.findOne(calendar.class.Event, { eventId: seriesEventId })
    if (target === undefined) throw new Error(`Event ${seriesEventId} not found for the meeting room`)
    await makeMeeting(client, target)
  }

  function blockEnterSubmit (e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
  }

  async function save (): Promise<void> {
    if (!canSubmit) return
    isSaving = true
    isSaveFailed = false
    refusal = undefined
    try {
      if (editing === undefined) {
        await createEvent(client, toDraft(), $calendarStore, lang)
      } else if (isGuest) {
        await saveOwnFields(editing)
        if (hasSharedEdits) await saveShared(await organizerTarget(editing))
      } else {
        await saveShared(editing)
        if (isMeeting && !wasMeeting) await meetingFor(seriesId(editing))
      }
    } catch (err) {
      const starts = err instanceof Error ? refusedStarts(err) : undefined
      if (starts !== undefined && pickedResource !== undefined) {
        refusal = { key: draftKey, text: resourceTextOf(lang)('BookedFirst', { name: pickedResource.name, dates: datesText(starts, lang) }) }
        return
      }
      isSaveFailed = true
      throw err
    } finally {
      isSaving = false
    }
    dispatch('close')
  }
</script>

<form class="flex max-h-[84vh] min-h-0 flex-col" on:submit|preventDefault={save} on:keydown={blockEnterSubmit}>
  <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
    {#if isCompact && editing !== undefined}
      <div class="grid gap-5">
        <div class="grid gap-1 pr-8">
          <Dialog.Title class="text-lg font-semibold">{editing.title}</Dialog.Title>
          <p class="m-0 text-sm text-muted-foreground">{whenText({ start: startDate, end: dueDate }, allDay, lang)}</p>
          {#if canSave && !can('guests')}
            <p class="m-0 text-xs text-muted-foreground">{text('GuestOwnFields')}</p>
          {/if}
        </div>
        <div class="grid gap-1.5">
          <Label for="lich-reminder">{text('Reminders')}</Label>
          <ReminderField id="lich-reminder" bind:reminders {lang} disabled={!can('reminders')} />
        </div>
        <div class="grid gap-1.5">
          <Label for="lich-show-as">{text('ShowAs')}</Label>
          <Select.Root type="single" value={isBusy ? 'busy' : 'free'} disabled={!can('busy')} onValueChange={(picked) => { isBusy = picked === 'busy' }}>
            <Select.Trigger id="lich-show-as" class="w-full">{text(isBusy ? 'Busy' : 'Free')}</Select.Trigger>
            <Select.Content>
              <Select.Item value="busy" label={text('Busy')} />
              <Select.Item value="free" label={text('Free')} />
            </Select.Content>
          </Select.Root>
        </div>
        {#if can('guests')}
          <div class="grid gap-1.5">
            <Label for="lich-guests">{text('Guests')}</Label>
            <GuestPicker id="lich-guests" bind:participants={addedGuests} bind:externalParticipants={addedEmails} {me} {lang} />
          </div>
        {/if}
      </div>
    {:else}
      <Dialog.Title class="m-0 pr-8 text-[15px] font-semibold leading-6">{heading}</Dialog.Title>
      <div class="mt-4 grid gap-5">
        <Input
          id="lich-title"
          class="h-auto border-0 bg-transparent px-0 py-1 text-lg font-medium shadow-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 md:text-lg dark:bg-transparent"
          bind:value={title}
          disabled={!can('title')}
          placeholder={text(isMeeting ? 'MeetingName' : 'AddTitle')}
          aria-label={text('Title')}
          aria-required={isNew}
        />

        <div class="grid gap-2.5">
          <div class="flex flex-wrap items-center gap-2">
            <Label for="lich-start-date" class="sr-only">{t('starts')}</Label>
            <div class="w-44">
              <DatePicker id="lich-start-date" value={startDate} {lang} {firstDayOfWeek} disabled={!can('time')} on:change={(e) => { setStartDay(e.detail) }} />
            </div>
            {#if !allDay}
              <div class="flex items-center gap-2">
                <div class="w-24">
                  <TimeSelect
                    id="lich-start-time"
                    ariaLabel={text('StartTime')}
                    value={startMinutes}
                    options={startOptions}
                    disabled={!can('time')}
                    on:change={(e) => { moveStart(atMinutes(startOfDay(startDate), e.detail)) }}
                  />
                </div>
                <span class="text-muted-foreground" aria-hidden="true">–</span>
                <div class="w-24">
                  <TimeSelect
                    id="lich-end-time"
                    ariaLabel={text('EndTime')}
                    value={minutesOfDay(dueDate)}
                    options={endOptions}
                    disabled={!can('time')}
                    on:change={(e) => { dueDate = atMinutes(endDay, e.detail) }}
                  />
                </div>
                {#if dueDate > startDate}<span class="text-sm tabular-nums text-muted-foreground">{durationText(dueDate - startDate, lang)}</span>{/if}
              </div>
            {/if}
            <!-- Same-day timed events need no second date; it comes back once the span crosses midnight. -->
            {#if allDay || isMultiDay}
              <div class="flex items-center gap-2">
                {#if allDay}<span class="text-muted-foreground" aria-hidden="true">–</span>{/if}
                <Label for="lich-end-date" class="sr-only">{t('ends')}</Label>
                <div class="w-44">
                  <DatePicker id="lich-end-date" value={dueDate} min={startDate} {lang} {firstDayOfWeek} disabled={!can('time')} on:change={(e) => { setEndDay(e.detail) }} />
                </div>
              </div>
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div class="flex items-center gap-2">
              <Checkbox id="lich-all-day" checked={allDay} disabled={!can('time')} onCheckedChange={setAllDay} />
              <Label for="lich-all-day" class="font-normal">{text('AllDay')}</Label>
            </div>
            <div class="w-60">
              <RepeatSelect
                id="lich-repeat"
                {rules}
                {startDate}
                {lang}
                {firstDayOfWeek}
                disabled={!canRepeat}
                on:change={(e) => { rules = e.detail }}
              />
            </div>
          </div>
          {#if isForeignZone}
            <p class="m-0 text-xs text-muted-foreground">{text('TimeZoneNote', { zone: timeZone })}</p>
          {/if}
        </div>

        <section class="grid gap-2" aria-labelledby="lich-guests-heading">
          <h3 id="lich-guests-heading" class="sr-only">{text('Guests')}</h3>
          {#if editing !== undefined && invited.length + externalParticipants.length > 0}
            <p class="m-0 truncate text-xs text-muted-foreground">
              {text('GuestCount', { count: participants.length + externalParticipants.length })} · {text('GuestSummary', {
                yes: countOf('accepted') + participants.length - invited.length,
                no: countOf('declined'),
                maybe: countOf('tentative'),
                pending: pendingCount
              })}
            </p>
          {/if}
          <GuestPicker
            id="lich-guests"
            bind:participants
            bind:externalParticipants
            {me}
            {lang}
            disabled={!can('guests')}
            answers={guestAnswers}
            {organizer}
          />
          {#if guests.length > 0 && !allDay}
            <div class="pt-2">
              <FindTime
                {guests}
                {lang}
                day={startOfDay(startDate)}
                slot={{ start: startDate, end: dueDate }}
                {personToSocial}
                editedEventId={editing === undefined ? undefined : seriesId(editing)}
                on:pick={(e) => { if (can('time')) moveStart(e.detail) }}
              />
            </div>
          {/if}
        </section>

        {#if isMeeting}
          <div class="flex items-center gap-3 rounded-md border px-3 py-2">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Video class="size-4" /></span>
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="text-sm font-medium">{text('OnlineMeeting')}</span>
              <span class="truncate text-xs text-muted-foreground">{text('VideoMeetingHint')}</span>
            </span>
            {#if canToggleMeeting}
              <Button variant="ghost" size="icon-sm" aria-label={text('RemoveVideoMeeting')} onclick={() => { isMeeting = false }}><X /></Button>
            {/if}
          </div>
        {:else if canToggleMeeting}
          <Button variant="outline" class="w-fit" onclick={() => { isMeeting = true }}><Video />{text('AddVideoMeeting')}</Button>
        {/if}

        {#if hasLocationField}
          <InputGroup.Root>
            <InputGroup.Addon>
              <MapPin />
            </InputGroup.Addon>
            <InputGroup.Input
              id="lich-location"
              bind:value={locationText}
              readonly={!can('location')}
              placeholder={text('AddLocation')}
              aria-label={text('Location')}
            />
            {#if isLocationLink}
              <InputGroup.Addon align="inline-end">
                <Button variant="ghost" size="icon-xs" href={locationText.trim()} target="_blank" rel="noopener noreferrer" aria-label={t('openLink')}>
                  <ExternalLink />
                </Button>
              </InputGroup.Addon>
            {/if}
          </InputGroup.Root>
        {/if}

        <ResourcePicker
          {lang}
          bind:resourceId
          bind:resource={pickedResource}
          bind:problem={bookingProblem}
          base={booked}
          draft={bookingDraft}
          {isRebooking}
          disabled={!can('location') || isGuest}
          on:pick={(e) => { if (can('time')) moveStart(e.detail) }}
        />

        <div class="grid gap-1.5">
          <Textarea
            id="lich-description"
            class="min-h-20"
            bind:value={descriptionText}
            readonly={!can('description')}
            placeholder={text('AddDescription')}
            aria-label={text('Description')}
            aria-describedby={isRichDescription ? 'lich-description-note' : undefined}
          />
          {#if isRichDescription && can('description')}
            <p id="lich-description-note" class="m-0 text-xs text-muted-foreground">{t('richNote')}</p>
          {/if}
        </div>

        <div class="grid gap-4 border-t pt-3">
          <!-- Huly's unlayered `button { justify-content: center }` beats Tailwind utilities. -->
          <button
            type="button"
            class="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style:justify-content="flex-start"
            aria-expanded={isMoreOpen}
            aria-controls="lich-more-options"
            on:click={() => { isMoreOpen = !isMoreOpen }}
          >
            <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform {isMoreOpen ? 'rotate-90' : ''}" />
            <span class="shrink-0 font-medium">{text('MoreOptions')}</span>
            {#if !isMoreOpen}<span class="min-w-0 truncate text-muted-foreground">{moreSummary}</span>{/if}
          </button>

          {#if isMoreOpen}
            <div id="lich-more-options" class="grid gap-4 pl-6">
              <div class="grid gap-1.5">
                <Label for="lich-reminder">{text('Reminders')}</Label>
                <ReminderField
                  id="lich-reminder"
                  bind:reminders
                  {lang}
                  disabled={!can('reminders')}
                  on:change={() => { isReminderPicked = true }}
                />
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="grid content-start gap-1.5">
                  <Label for="lich-show-as">{text('ShowAs')}</Label>
                  <Select.Root type="single" value={isBusy ? 'busy' : 'free'} disabled={!can('busy')} onValueChange={(picked) => { isBusy = picked === 'busy' }}>
                    <Select.Trigger id="lich-show-as" class="w-full">{text(isBusy ? 'Busy' : 'Free')}</Select.Trigger>
                    <Select.Content>
                      <Select.Item value="busy" label={text('Busy')} />
                      <Select.Item value="free" label={text('Free')} />
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="grid content-start gap-1.5">
                  <Label for="lich-visibility">{text('Visibility')}</Label>
                  <Select.Root
                    type="single"
                    value={visibility}
                    disabled={!can('visibility')}
                    onValueChange={(picked) => { if (isVisibilityChoice(picked)) visibility = picked }}
                  >
                    <Select.Trigger id="lich-visibility" class="w-full">
                      <span class="flex min-w-0 items-center gap-2">
                        <svelte:component this={visibilityOption.icon} class="text-muted-foreground" />
                        <span class="truncate">{text(visibilityOption.label)}</span>
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each VISIBILITY_CHOICES as choice (choice)}
                        {@const option = VISIBILITY_OPTION[choice]}
                        <Select.Item value={choice} label={text(option.label)}>
                          <svelte:component this={option.icon} class="text-muted-foreground" />
                          <span class="grid gap-0.5">
                            <span>{text(option.label)}</span>
                            {#if option.hint !== undefined}<span class="text-xs text-muted-foreground">{text(option.hint)}</span>{/if}
                          </span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>

              {#if can('guestPermissions')}
                <fieldset class="m-0 grid gap-2.5 border-0 p-0">
                  <legend class="mb-2 text-sm font-medium">{text('GuestsCan')}</legend>
                  <div class="flex flex-wrap gap-x-5 gap-y-2.5">
                    <div class="flex items-center gap-2">
                      <Checkbox id="lich-can-modify" checked={permissions.canModify} onCheckedChange={(isChecked) => { setPermission('canModify', isChecked) }} />
                      <Label for="lich-can-modify" class="font-normal">{text('GuestsCanModify')}</Label>
                    </div>
                    <div class="flex items-center gap-2">
                      <Checkbox
                        id="lich-can-invite"
                        checked={permissions.canModify || permissions.canInvite}
                        disabled={permissions.canModify}
                        onCheckedChange={(isChecked) => { setPermission('canInvite', isChecked) }}
                      />
                      <Label for="lich-can-invite" class="font-normal">{text('GuestsCanInvite')}</Label>
                    </div>
                    <div class="flex items-center gap-2">
                      <Checkbox
                        id="lich-can-see"
                        checked={permissions.canModify || permissions.canSeeGuests}
                        disabled={permissions.canModify}
                        onCheckedChange={(isChecked) => { setPermission('canSeeGuests', isChecked) }}
                      />
                      <Label for="lich-can-see" class="font-normal">{text('GuestsCanSeeGuests')}</Label>
                    </div>
                  </div>
                </fieldset>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if refusal !== undefined && refusal.key === draftKey}
      <Alert.Root variant="destructive" class="mt-4">
        <TriangleAlert />
        <Alert.Description>{refusal.text}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if isSaveFailed}
      <Alert.Root variant="destructive" class="mt-4">
        <TriangleAlert />
        <Alert.Description>{t('saveFailed')}</Alert.Description>
      </Alert.Root>
    {/if}
  </div>

  <!-- Dialog.Content is p-0 so the body can scroll, so the footer drops the bleed that offsets the kit p-4. -->
  <Dialog.Footer class="mx-0 mb-0 px-6 py-3">
    <Button type="button" variant="ghost" onclick={() => { dispatch('close') }}>{t('cancel')}</Button>
    <Button data-track="calendar.event.submit" type="submit" disabled={!canSubmit}>
      {#if isSaving}<Loader2 class="animate-spin" />{/if}
      {submitLabel}
    </Button>
  </Dialog.Footer>
</form>
