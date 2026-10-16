import calendar, {
  AccessLevel,
  generateEventId,
  getAllEvents,
  getPrimaryCalendar,
  type Calendar,
  type Event,
  type ReccuringEvent,
  type ReccuringInstance,
  type RecurringRule
} from '@hcengineering/calendar'
import type { Person } from '@hcengineering/contact'
import { generateId, getCurrentAccount, type DocumentUpdate, type Markup, type Ref, type TxOperations } from '@hcengineering/core'
import { EmptyMarkup } from '@hcengineering/text'
import { initialBookingState, type BookableResource } from '@servone/approvals/src/booking'
import { getUserTimezone } from '@hcengineering/ui'
import { makeMeeting } from '../../love-resources/calls/join'
import { saveUTC } from '../utils'
import { DEFAULT_GUEST_PERMISSIONS, permissionFields, type GuestPermissions } from './lib/guests'
import { seriesEndBefore } from './lib/recurrence'
import { defaultDuration, defaultReminders } from './lib/reminders'
import type { Lang, Slot } from './lib/types'
import { visibilityOf, type VisibilityChoice } from './lib/visibility'
import { textOf } from './strings'

export interface EventDraft {
  title: string
  start: number
  end: number
  allDay: boolean
  rules: RecurringRule[]
  participants: Array<Ref<Person>>
  externalParticipants: string[]
  reminders: number[] | undefined
  visibility: VisibilityChoice
  isBusy: boolean
  location: string | undefined
  description: Markup
  guestPermissions: GuestPermissions
  timeZone: string
  isMeeting: boolean
  resource?: Ref<BookableResource>
}

export type RecurringScope = 'current' | 'next' | 'all'

export function newDraft (slot: Slot, allDay: boolean, me: Ref<Person>): EventDraft {
  return {
    title: '',
    start: slot.start,
    end: slot.end,
    allDay,
    rules: [],
    participants: [me],
    externalParticipants: [],
    reminders: undefined,
    visibility: 'default',
    isBusy: !allDay,
    location: undefined,
    description: EmptyMarkup,
    guestPermissions: DEFAULT_GUEST_PERMISSIONS,
    timeZone: getUserTimezone(),
    isMeeting: false
  }
}

function writableOf (calendars: Calendar[]): Calendar[] {
  const account = getCurrentAccount()
  return calendars.filter(
    (c) => account.socialIds.includes(c.user) && !c.hidden && (c.access === AccessLevel.Owner || c.access === AccessLevel.Writer)
  )
}

export async function findPrimaryCalendar (client: TxOperations, calendars: Calendar[]): Promise<Ref<Calendar>> {
  const preference = await client.findOne(calendar.class.PrimaryCalendar, {})
  return getPrimaryCalendar(writableOf(calendars), preference, getCurrentAccount().uuid)
}

export function durationCalendarOf (calendars: Calendar[]): Ref<Calendar> {
  return getPrimaryCalendar(writableOf(calendars), undefined, getCurrentAccount().uuid)
}

export function eventDurationFor (calendars: Calendar[]): number {
  const id = durationCalendarOf(calendars)
  return defaultDuration(calendars.find((c) => c._id === id))
}

export function remindersFor (calendars: Calendar[], id: Ref<Calendar>, allDay: boolean): number[] {
  return defaultReminders(calendars.find((c) => c._id === id), allDay)
}

export async function createEvent (client: TxOperations, draft: EventDraft, calendars: Calendar[], lang: Lang): Promise<Ref<Event>> {
  const calendarId = await findPrimaryCalendar(client, calendars)
  const title = draft.title.trim()
  const start = draft.allDay ? saveUTC(draft.start) : draft.start
  const resource = draft.resource === undefined ? undefined : client.getModel().findObject(draft.resource)
  if (draft.resource !== undefined && resource === undefined) throw new Error(`Resource ${draft.resource} not found`)
  const base = {
    calendar: calendarId,
    eventId: generateEventId(),
    title: title === '' ? textOf(lang)('NoTitle') : title,
    date: start,
    dueDate: draft.allDay ? saveUTC(draft.end) : draft.end,
    allDay: draft.allDay,
    participants: draft.participants,
    externalParticipants: draft.externalParticipants,
    reminders: draft.reminders ?? remindersFor(calendars, calendarId, draft.allDay),
    visibility: visibilityOf(draft.visibility),
    location: draft.location,
    description: draft.description,
    blockTime: draft.isBusy,
    access: AccessLevel.Owner,
    timeZone: draft.timeZone,
    user: getCurrentAccount().primarySocialId,
    ...permissionFields(draft.guestPermissions),
    servoneResource: resource?._id,
    servoneBookingState: resource === undefined ? undefined : initialBookingState(resource)
  }
  const createdId = draft.rules.length > 0
    ? await client.addCollection(
      calendar.class.ReccuringEvent,
      calendar.space.Calendar,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events',
      { ...base, rules: draft.rules, exdate: [], rdate: [], originalStartTime: start },
      generateId<ReccuringEvent>()
    )
    : await client.addCollection(calendar.class.Event, calendar.space.Calendar, calendar.ids.NoAttached, calendar.class.Event, 'events', base)
  if (draft.isMeeting) {
    const created = await client.findOne(calendar.class.Event, { _id: createdId })
    if (created === undefined) throw new Error(`Event ${createdId} not found for the meeting room`)
    await makeMeeting(client, created)
  }
  return createdId
}

export function visibilityUpdate (choice: VisibilityChoice): DocumentUpdate<Event> {
  const visibility = visibilityOf(choice)
  return visibility === undefined ? { $unset: { visibility: true } } : { visibility }
}

export async function deleteOccurrence (client: TxOperations, instance: ReccuringInstance, scope: RecurringScope): Promise<void> {
  if (scope === 'current') {
    if (instance.virtual !== true) {
      await client.update(instance, { isCancelled: true })
      return
    }
    await client.addCollection(
      instance._class,
      instance.space,
      instance.attachedTo,
      instance.attachedToClass,
      instance.collection,
      {
        eventId: instance.eventId,
        title: instance.title,
        description: instance.description,
        date: instance.date,
        dueDate: instance.dueDate,
        calendar: instance.calendar,
        allDay: instance.allDay,
        participants: instance.participants,
        externalParticipants: instance.externalParticipants,
        originalStartTime: instance.originalStartTime,
        recurringEventId: instance.recurringEventId,
        reminders: instance.reminders,
        location: instance.location,
        isCancelled: true,
        rdate: instance.rdate,
        rules: instance.rules,
        exdate: instance.exdate,
        visibility: instance.visibility,
        access: instance.access,
        timeZone: instance.timeZone,
        user: instance.user,
        blockTime: instance.blockTime
      },
      instance._id
    )
    return
  }
  const origin = await client.findOne(calendar.class.ReccuringEvent, { calendar: instance.calendar, eventId: instance.recurringEventId })
  if (origin === undefined) return
  const target = instance.originalStartTime
  const kept = scope === 'all' ? [] : getAllEvents([origin], origin.date, target).filter((e) => e.date < target)
  const lastKept = kept[kept.length - 1]
  if (lastKept === undefined) {
    await client.remove(origin)
    return
  }
  await client.update(origin, {
    rules: [{ ...origin.rules[0], endDate: seriesEndBefore(lastKept.date, target) }],
    rdate: origin.rdate.filter((p) => p < target)
  })
  const later = await client.findAll(calendar.class.ReccuringInstance, {
    calendar: instance.calendar,
    recurringEventId: origin.eventId,
    originalStartTime: { $gte: target }
  })
  for (const moved of later) await client.remove(moved)
}
