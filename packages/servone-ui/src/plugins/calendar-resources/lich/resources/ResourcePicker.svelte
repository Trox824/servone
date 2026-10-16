<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Box, Car, DoorOpen, Projector, TriangleAlert } from '@lucide/svelte'
  import calendar, { AccessLevel, type ReccuringInstance } from '@hcengineering/calendar'
  import contact, { formatName, type Person } from '@hcengineering/contact'
  import type { Class, Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import {
    BOOKING_WINDOW_DAYS,
    RESOURCE_CLASS,
    bookingWindow,
    busyIntervals,
    findClashes,
    suggestSlots,
    type BookableResource,
    type Interval,
    type ResourceType
  } from '@servone/approvals/src/booking'
  import * as Alert from '../../../../lib/components/ui/alert'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import { Label } from '../../../../lib/components/ui/label'
  import * as Select from '../../../../lib/components/ui/select'
  import { timeRange } from '../lib/format'
  import { addDays, startOfDay } from '../lib/time'
  import type { Lang } from '../lib/types'
  import {
    bookingCandidate,
    bookingProblem,
    clashText,
    pickerGroups,
    sendsForApproval,
    type BookedEvent,
    type BookingDraft,
    type BookingProblem
  } from './booking-form'
  import { resourceTextOf } from './strings'

  export let lang: Lang
  export let resourceId: string | undefined
  export let base: BookedEvent | undefined
  export let draft: BookingDraft
  export let isRebooking: boolean
  export let disabled = false
  export let resource: BookableResource | undefined = undefined
  export let problem: BookingProblem | undefined = undefined

  const ICONS: Record<ResourceType, typeof DoorOpen> = { room: DoorOpen, car: Car, equipment: Projector, other: Box }
  const NONE = 'none'
  const BOOKED_EVENT: Ref<Class<BookedEvent>> = calendar.class.Event

  const dispatch = createEventDispatcher<{ pick: number }>()
  const now = Date.now()
  const client = getClient()
  const hasResources = client.getHierarchy().hasClass(RESOURCE_CLASS)

  let resources: BookableResource[] = []
  let isLoaded = false
  if (hasResources) {
    createQuery().query(RESOURCE_CLASS, {}, (found) => {
      resources = found
      isLoaded = true
    })
  }

  let bookings: BookedEvent[] = []
  let overrides: ReccuringInstance[] = []
  const bookingsQuery = createQuery()
  const overridesQuery = createQuery()
  $: if (hasResources && resourceId !== undefined) {
    bookingsQuery.query(BOOKED_EVENT, { servoneResource: resourceId, access: AccessLevel.Owner }, (found) => {
      bookings = found
    })
  } else {
    bookingsQuery.unsubscribe()
    bookings = []
  }
  $: seriesIds = bookings.filter((b) => (b.rules ?? []).length > 0 && b.recurringEventId === undefined).map((b) => b.eventId)
  $: if (seriesIds.length > 0) {
    overridesQuery.query(calendar.class.ReccuringInstance, { recurringEventId: { $in: seriesIds }, access: AccessLevel.Owner }, (found) => {
      overrides = found
    })
  } else {
    overridesQuery.unsubscribe()
    overrides = []
  }

  let approverName: string | undefined
  const approverQuery = createQuery()
  $: approver = resource?.needsApproval === true ? resource.approver : undefined
  $: if (approver !== undefined) {
    approverQuery.query(contact.class.Person, { _id: approver }, ([person]: Person[]) => {
      approverName = person === undefined ? undefined : formatName(person.name)
    })
  } else {
    approverQuery.unsubscribe()
    approverName = undefined
  }

  $: t = resourceTextOf(lang)
  $: groups = pickerGroups(resources, lang)
  $: resource = resources.find((r) => r._id === resourceId)
  $: candidate = resourceId === undefined ? undefined : bookingCandidate(base, draft, resourceId)
  $: existing = [...bookings, ...overrides]
  $: span = candidate === undefined ? undefined : bookingWindow(candidate, now)
  $: clashes = isRebooking && candidate !== undefined && span !== undefined && !draft.allDay ? findClashes(candidate, existing, span) : []
  $: problem = !hasResources || !isRebooking ? undefined : bookingProblem(resource, draft, clashes.length, now)
  $: day = { start: startOfDay(draft.start), end: addDays(startOfDay(draft.start), 1) }
  $: suggestions =
    problem === 'clash' && candidate !== undefined && span !== undefined
      ? suggestSlots({ start: draft.start, end: draft.end }, busyIntervals(candidate, existing, span), now, day)
      : []
  $: isVisible = hasResources && (groups.length > 0 || resourceId !== undefined)
  $: isRepeating = draft.rules.length > 0
  $: icon = resource === undefined ? DoorOpen : ICONS[resource.type]

  function choose (picked: string): void {
    resourceId = resources.find((r) => r._id === picked)?._id
  }

  function slotText (slot: Interval): string {
    return timeRange({ date: slot.start, dueDate: slot.end, allDay: false }, lang)
  }
</script>

{#if isVisible}
  <div class="grid gap-2">
    <Label for="lich-resource" class="sr-only">{t('Picker')}</Label>
    <Select.Root type="single" value={resourceId ?? NONE} {disabled} onValueChange={choose}>
      <Select.Trigger id="lich-resource" class="w-full">
        <span class="flex min-w-0 items-center gap-2">
          <svelte:component this={icon} class="text-muted-foreground" />
          {#if resource !== undefined}
            <span class="truncate">{resource.name}</span>
            {#if resource.capacity !== undefined}
              <span class="shrink-0 tabular-nums text-muted-foreground">{t('People', { count: resource.capacity })}</span>
            {/if}
          {:else}
            <span class="truncate text-muted-foreground">{t('PickerPlaceholder')}</span>
          {/if}
        </span>
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={NONE} label={t('PickerNone')} />
        {#each groups as group (group.type)}
          <Select.Separator />
          <Select.Label>{t(group.type)}</Select.Label>
          {#each group.resources as option (option._id)}
            <Select.Item value={option._id} label={option.name}>
              <svelte:component this={ICONS[option.type]} class="text-muted-foreground" />
              <span class="truncate">{option.name}</span>
              {#if option.capacity !== undefined}
                <span class="tabular-nums text-xs text-muted-foreground">{t('People', { count: option.capacity })}</span>
              {/if}
              {#if option.needsApproval}<Badge variant="secondary">{t('NeedsApproval')}</Badge>{/if}
            </Select.Item>
          {/each}
        {/each}
      </Select.Content>
    </Select.Root>

    {#if problem !== undefined && (problem !== 'missing' || isLoaded)}
      <Alert.Root variant="destructive">
        <TriangleAlert />
        <Alert.Description class="grid gap-2">
          {#if problem === 'clash' && resource !== undefined}
            <span>{clashText(resource.name, clashes.map((c) => c.start), isRepeating, lang)}</span>
            {#if suggestions.length > 0}
              <span class="flex flex-wrap items-center gap-1.5">
                <span class="text-muted-foreground">{t('FreeTimes')}</span>
                {#each suggestions as slot (slot.start)}
                  <Button type="button" variant="outline" size="xs" class="tabular-nums" onclick={() => { dispatch('pick', slot.start) }}>
                    {slotText(slot)}
                  </Button>
                {/each}
              </span>
            {:else if !isRepeating}
              <span class="text-muted-foreground">{t('NoFreeTime')}</span>
            {/if}
          {:else if problem === 'allDay' && resource !== undefined}
            <span>{t('AllDayNotBookable')}</span>
            <span>
              <Button type="button" variant="outline" size="xs" onclick={() => { resourceId = undefined }}>
                {t('RemoveResource', { name: resource.name })}
              </Button>
            </span>
          {:else if problem === 'archived' && resource !== undefined}
            <span>{t('ArchivedNotBookable', { name: resource.name })}</span>
          {:else if problem === 'rule'}
            <span>{t('RuleNotBookable')}</span>
          {:else if problem === 'tooFar'}
            <span>{t('TooFar', { days: BOOKING_WINDOW_DAYS })}</span>
          {:else}
            <span>{t('MissingResource')}</span>
          {/if}
        </Alert.Description>
      </Alert.Root>
    {:else if sendsForApproval(resource, isRebooking)}
      <p class="m-0 text-xs text-muted-foreground">{t('ApprovalNotice', { approver: approverName ?? t('YourManager') })}</p>
    {/if}
  </div>
{/if}
