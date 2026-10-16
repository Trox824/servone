import { BOOKING_STATES, type BookingEvent, type BookingState } from '@servone/approvals/src/booking'
import type { resourceTextOf } from './strings'

export interface BookingLook {
  resource: string
  state: BookingState
  isPending: boolean
  isVoid: boolean
}

const VOID_STATES: readonly BookingState[] = ['rejected', 'expired', 'cancelled']

export function bookingLook (event: Pick<BookingEvent, '_id' | 'servoneResource' | 'servoneBookingState'>): BookingLook | undefined {
  const state = BOOKING_STATES.find((known) => known === event.servoneBookingState)
  if (event.servoneResource === undefined || state === undefined) return undefined
  return { resource: event.servoneResource, state, isPending: state === 'pending', isVoid: VOID_STATES.includes(state) }
}

export function bookingLine (t: ReturnType<typeof resourceTextOf>, resource: string, state: BookingState, approver: string | undefined): string {
  const status = state === 'pending' && approver !== undefined && approver !== '' ? t('WaitingForApprover', { name: approver }) : t(state)
  return `${resource} · ${status}`
}
