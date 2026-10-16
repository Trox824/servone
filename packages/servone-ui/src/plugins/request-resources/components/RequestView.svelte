<script lang="ts">
  import { getName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonIdCb, getPersonByPersonRefCb, PersonPresenter } from '@hcengineering/contact-resources'
  import type { Class, Doc, Ref, Status } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type Request, RequestStatus } from '@hcengineering/request'
  import { languageStore } from '@hcengineering/theme'
  import { Label, TimeSince } from '@hcengineering/ui'
  import { ObjectPresenter, statusStore } from '@hcengineering/view-resources'
  import type { RouteKind } from '@servone/notify-rules'
  import { RESOURCE_CLASS, type BookableResource } from '@servone/approvals/src/booking'
  import type { ApprovalActionName } from '@servone/approvals/src/gate'
  import { bookingKindLabel, endedBy, outcomeLabel } from '../approvals'
  import { ROUTE_REASON, routeStr } from '../route-strings'
  import { str } from '../strings'
  import RequestActions from './RequestActions.svelte'

  interface BookingEvent extends Doc {
    title: string
    date: number
    dueDate: number
  }

  type ApprovalRequest = Request & {
    servoneAction?: ApprovalActionName
    servoneReason?: string
    servoneGate?: Ref<Status>
    servoneRoute?: RouteKind
    servoneRouteFor?: string
    servoneResource?: string
  }

  export let heading: string | undefined = undefined
  export let showItem: boolean = true
  export let value: ApprovalRequest

  const EVENT_CLASS = 'calendar:class:Event' as Ref<Class<BookingEvent>>
  const hierarchy = getClient().getHierarchy()

  const eventQuery = createQuery()
  const resourceQuery = createQuery()
  const departmentQuery = createQuery()

  let submitter: Readonly<Person> | null | undefined
  let bookedEvent: BookingEvent | undefined
  let bookedResource: BookableResource | undefined
  let departmentName = ''
  let personRouteName = ''

  $: isActive = value.status === RequestStatus.Active
  $: isBooking = value.servoneAction === 'cal.booking'
  $: gate = value.servoneGate !== undefined ? $statusStore.byId.get(value.servoneGate) : undefined
  $: outcome = outcomeLabel(value.status, value.modifiedBy)
  $: endedByPerson = endedBy(value, submitter?._id)
  $: closingReason = isActive ? undefined : value.servoneReason

  $: {
    const createdBy = value.createdBy
    if (createdBy === undefined) {
      submitter = undefined
    } else {
      getPersonByPersonIdCb(createdBy, (found) => {
        if (value.createdBy === createdBy) submitter = found
      })
    }
  }

  $: if (isBooking) {
    eventQuery.query(EVENT_CLASS, { _id: value.attachedTo as Ref<BookingEvent> }, (found) => {
      bookedEvent = found[0]
    })
  } else {
    eventQuery.unsubscribe()
    bookedEvent = undefined
  }

  $: if (isBooking && value.servoneResource !== undefined && hierarchy.hasClass(RESOURCE_CLASS)) {
    resourceQuery.query(RESOURCE_CLASS, { _id: value.servoneResource as Ref<BookableResource> }, (found) => {
      bookedResource = found[0]
    })
  } else {
    resourceQuery.unsubscribe()
    bookedResource = undefined
  }

  $: bookingLabel = bookingKindLabel(bookedResource?.type)
  $: locale = $languageStore === '' ? undefined : $languageStore
  $: bookedTime =
    bookedEvent !== undefined
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).formatRange(
        bookedEvent.date,
        bookedEvent.dueDate
      )
      : ''

  $: routeKind = isActive ? value.servoneRoute : undefined
  $: routeTarget = value.servoneRouteFor

  $: if (routeKind === 'no_head' && routeTarget !== undefined) {
    departmentQuery.query(hr.class.Department, { _id: routeTarget as Ref<Department> }, (found) => {
      departmentName = found[0]?.name ?? ''
    })
  } else {
    departmentQuery.unsubscribe()
    departmentName = ''
  }

  $: if (routeKind !== undefined && routeKind !== 'no_head' && routeTarget !== undefined) {
    const target = routeTarget
    getPersonByPersonRefCb(target as Ref<Person>, (found) => {
      if (value.servoneRouteFor === target) personRouteName = found === null ? '' : getName(hierarchy, found)
    })
  } else {
    personRouteName = ''
  }

  $: routeName = routeKind === 'no_head' ? departmentName : personRouteName
  $: routeNote =
    routeKind !== undefined && (routeKind === 'admin' || routeName !== '') ? routeStr[ROUTE_REASON[routeKind]] : undefined
  $: subjectLabel = isBooking ? bookingLabel : gate !== undefined ? str.ApprovalTo : str.ApprovalRequest
  $: subjectParams = { status: gate?.name ?? '' }
  $: usesHeading = heading !== undefined && !isBooking && gate === undefined
</script>

{#if !isActive}
  <div class="flex flex-col gap-1 text-[13px] text-foreground" data-status={value.status}>
    <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span class="status-dot"></span>
      <span class="font-medium">
        {#if isBooking}
          <Label label={bookingLabel} />{#if bookedResource !== undefined}&nbsp;· {bookedResource.name}{/if}
        {:else}
          <Label label={subjectLabel} params={subjectParams} />
        {/if}
      </span>
      <span class="text-muted-foreground">·</span>
      <Label label={outcome} />
      {#if endedByPerson !== undefined}
        <span class="text-muted-foreground">·</span>
        <PersonPresenter value={endedByPerson} />
      {/if}
      <span class="text-muted-foreground">· <TimeSince value={value.modifiedOn} /></span>
    </div>
    {#if closingReason}
      <div class="pl-3.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
        <Label label={str.Reason} />: {closingReason}
      </div>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-2 p-3 border border-border rounded-lg bg-card text-[13px]">
    <div class="font-medium text-foreground">
      {#if usesHeading}
        {heading}
      {:else}
        <Label label={subjectLabel} params={subjectParams} />
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class="status-pill inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-foreground font-medium"
        data-status={value.status}
      >
        <span class="status-dot"></span>
        <Label label={outcome} />
      </span>
      {#if submitter}
        <span class="text-muted-foreground">
          <Label label={str.RequestedBy} params={{ name: getName(hierarchy, submitter) }} /> · <TimeSince
            value={value.createdOn}
          />
        </span>
      {/if}
    </div>

    {#if isBooking}
      {#if bookedResource !== undefined}
        <div class="flex items-center gap-2">
          <span class="w-24 shrink-0 text-muted-foreground"><Label label={str.Resource} /></span>
          <span class="min-w-0 text-foreground">{bookedResource.name}</span>
        </div>
      {/if}
      {#if bookedEvent !== undefined}
        <div class="flex items-center gap-2">
          <span class="w-24 shrink-0 text-muted-foreground"><Label label={str.Time} /></span>
          <span class="min-w-0 text-foreground tabular-nums">{bookedTime}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 shrink-0 text-muted-foreground"><Label label={str.Purpose} /></span>
          <span class="min-w-0 text-foreground [overflow-wrap:anywhere]">{bookedEvent.title}</span>
        </div>
      {/if}
    {:else if showItem}
      <div class="text-foreground">
        <ObjectPresenter objectId={value.attachedTo} _class={value.attachedToClass} />
      </div>
    {/if}

    {#if value.requested.length > 0}
      <div class="flex items-center gap-2">
        <span class="w-24 shrink-0 text-muted-foreground"><Label label={str.Approver} /></span>
        <span class="flex flex-wrap items-center gap-2 min-w-0 text-foreground">
          {#each value.requested as person (person)}
            <PersonPresenter value={person} />
          {/each}
          {#if routeNote !== undefined}
            <span class="text-muted-foreground">
              (<Label label={routeNote} params={{ name: routeName, team: routeName }} />)
            </span>
          {/if}
        </span>
      </div>
    {/if}

    {#if isBooking}
      <div class="text-xs text-muted-foreground"><Label label={str.BookingExpiryHint} /></div>
    {/if}

    <RequestActions {value} />
  </div>
{/if}

<style>
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    flex-shrink: 0;
    background: var(--muted-foreground);
  }
  [data-status='Active'] .status-dot {
    background: var(--primary);
  }
  [data-status='Completed'] .status-dot {
    background: var(--color-emerald-500);
  }
  [data-status='Rejected'] .status-dot {
    background: var(--destructive);
  }
</style>
