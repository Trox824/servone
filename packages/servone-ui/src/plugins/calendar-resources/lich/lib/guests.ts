import type { CalEvent } from './types'

export const GUESTS_CAN_MODIFY_ATTR = 'servoneGuestsCanModify'
export const GUESTS_CAN_INVITE_ATTR = 'servoneGuestsCanInvite'
export const GUESTS_CAN_SEE_GUESTS_ATTR = 'servoneGuestsCanSeeGuests'

export interface GuestPermissions {
  canModify: boolean
  canInvite: boolean
  canSeeGuests: boolean
}

export type PermissionFields = Required<Pick<CalEvent, 'servoneGuestsCanModify' | 'servoneGuestsCanInvite' | 'servoneGuestsCanSeeGuests'>>

export const DEFAULT_GUEST_PERMISSIONS: GuestPermissions = { canModify: false, canInvite: true, canSeeGuests: true }

export type EventField =
  | 'title'
  | 'time'
  | 'repeat'
  | 'guests'
  | 'location'
  | 'description'
  | 'visibility'
  | 'guestPermissions'
  | 'reminders'
  | 'busy'

export const OWN_COPY_FIELDS: ReadonlySet<EventField> = new Set<EventField>(['reminders', 'busy'])
const EVENT_FIELDS: readonly EventField[] = ['title', 'time', 'repeat', 'guests', 'location', 'description', 'visibility', 'reminders', 'busy']

export interface GuestAccess {
  fields: ReadonlySet<EventField>
  canSeeGuests: boolean
}

export function guestPermissionsOf (e: CalEvent): GuestPermissions {
  return {
    canModify: e.servoneGuestsCanModify ?? DEFAULT_GUEST_PERMISSIONS.canModify,
    canInvite: e.servoneGuestsCanInvite ?? DEFAULT_GUEST_PERMISSIONS.canInvite,
    canSeeGuests: e.servoneGuestsCanSeeGuests ?? DEFAULT_GUEST_PERMISSIONS.canSeeGuests
  }
}

export function permissionFields (permissions: GuestPermissions): PermissionFields {
  return {
    servoneGuestsCanModify: permissions.canModify,
    servoneGuestsCanInvite: permissions.canInvite,
    servoneGuestsCanSeeGuests: permissions.canSeeGuests
  }
}

export function guestAccess (isOrganizer: boolean, permissions: GuestPermissions): GuestAccess {
  if (isOrganizer) return { fields: new Set<EventField>([...EVENT_FIELDS, 'guestPermissions']), canSeeGuests: true }
  if (permissions.canModify) return { fields: new Set(EVENT_FIELDS), canSeeGuests: true }
  const fields = new Set<EventField>(OWN_COPY_FIELDS)
  if (permissions.canInvite) fields.add('guests')
  return { fields, canSeeGuests: permissions.canSeeGuests }
}

export function shownGuests<T> (participants: T[], canSeeGuests: boolean, always: T[]): T[] {
  return canSeeGuests ? participants : participants.filter((p) => always.includes(p))
}
