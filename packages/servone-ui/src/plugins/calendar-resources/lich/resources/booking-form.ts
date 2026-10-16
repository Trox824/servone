import type { Event, ReccuringEvent, ReccuringInstance } from '@hcengineering/calendar'
import { PlatformError } from '@hcengineering/platform'
import {
  BOOKING_CLASH,
  RESOURCE_TYPES,
  initialBookingState,
  isBeyondWindow,
  isSupportedRule,
  type BookableResource,
  type BookingEvent,
  type BookingRule,
  type BookingState,
  type ResourceType
} from '@servone/approvals/src/booking'
import type { Lang } from '../lib/types'
import { resourceTextOf } from './strings'

export interface BookingAttrs {
  servoneResource?: string
  servoneBookingState?: string
}

export type BookedEvent = Event &
Partial<Pick<ReccuringEvent, 'rules' | 'exdate' | 'rdate'>> &
Partial<Pick<ReccuringInstance, 'recurringEventId' | 'originalStartTime'>> &
BookingAttrs

export interface ResourceGroup {
  type: ResourceType
  resources: BookableResource[]
}

export type BookingProblem = 'missing' | 'archived' | 'allDay' | 'rule' | 'tooFar' | 'clash'

export interface BookingDraft {
  start: number
  end: number
  allDay: boolean
  rules: BookingRule[]
  timeZone: string
}

const LISTED_DATES = 5
const EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function pickerGroups (resources: BookableResource[], lang: Lang): ResourceGroup[] {
  const active = resources.filter((resource) => !resource.archived).sort((a, b) => a.name.localeCompare(b.name, lang))
  return RESOURCE_TYPES.map((type) => ({ type, resources: active.filter((resource) => resource.type === type) })).filter(
    (group) => group.resources.length > 0
  )
}

export function heldResource (event: BookingAttrs | undefined): string | undefined {
  const state = event?.servoneBookingState
  return state === 'pending' || state === 'confirmed' ? event?.servoneResource : undefined
}

export function isRebook (held: string | undefined, picked: string | undefined, isMoved: boolean): boolean {
  return picked !== undefined && (picked !== held || isMoved)
}

export function bookingCandidate (base: BookedEvent | undefined, draft: BookingDraft, resource: string): BookingEvent {
  return {
    _id: base?._id ?? 'draft',
    eventId: base?.eventId ?? 'draft',
    recurringEventId: base?.recurringEventId,
    originalStartTime: base?.originalStartTime,
    exdate: base?.exdate,
    rdate: base?.rdate,
    date: draft.start,
    dueDate: draft.end,
    allDay: draft.allDay,
    rules: draft.rules,
    timeZone: draft.timeZone,
    access: 'owner',
    servoneResource: resource,
    servoneBookingState: 'pending'
  }
}

export function bookingProblem (
  resource: BookableResource | undefined,
  draft: BookingDraft,
  clashCount: number,
  now: number
): BookingProblem | undefined {
  if (resource === undefined) return 'missing'
  if (resource.archived) return 'archived'
  if (draft.allDay) return 'allDay'
  if (!isSupportedRule(draft.rules, draft.start, draft.timeZone)) return 'rule'
  if (isBeyondWindow(draft.start, now)) return 'tooFar'
  if (clashCount > 0) return 'clash'
  return undefined
}

export function sendsForApproval (resource: BookableResource | undefined, isRebooking: boolean): boolean {
  return isRebooking && resource?.needsApproval === true
}

export function bookingChange (
  held: string | undefined,
  pickedId: string | undefined,
  picked: BookableResource | undefined,
  isMoved: boolean
): BookingAttrs {
  if (pickedId === undefined) return held === undefined ? {} : { servoneBookingState: 'cancelled' satisfies BookingState }
  if (!isRebook(held, pickedId, isMoved)) return {}
  if (picked === undefined) throw new Error(`Resource ${pickedId} not loaded`)
  return { servoneResource: picked._id, servoneBookingState: initialBookingState(picked) }
}

function shortDate (ts: number, lang: Lang): string {
  const d = new Date(ts)
  return lang === 'vi' ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : `${EN_MONTH[d.getMonth()]} ${d.getDate()}`
}

export function datesText (starts: number[], lang: Lang): string {
  const t = resourceTextOf(lang)
  const days = [...new Set(starts.map((start) => shortDate(start, lang)))]
  const listed = days.slice(0, LISTED_DATES)
  const rest = days.length - listed.length
  if (rest > 0) return t('DatesAndMore', { dates: listed.join(', '), count: rest })
  if (listed.length === 1) return listed[0]
  return t('DatesAnd', { dates: listed.slice(0, -1).join(', '), last: listed[listed.length - 1] })
}

export function clashText (name: string, starts: number[], isRepeating: boolean, lang: Lang): string {
  const t = resourceTextOf(lang)
  return isRepeating ? t('TakenOnDates', { name, dates: datesText(starts, lang) }) : t('TakenAtThisTime', { name })
}

export function refusedStarts (err: Error): number[] | undefined {
  if (!(err instanceof PlatformError) || err.status.code !== BOOKING_CLASH) return undefined
  const starts: unknown = err.status.params.starts
  return Array.isArray(starts) ? starts.filter((start): start is number => typeof start === 'number') : []
}
