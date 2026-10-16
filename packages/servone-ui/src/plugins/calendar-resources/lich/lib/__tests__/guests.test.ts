import type { CalEvent } from '../types'
import { DEFAULT_GUEST_PERMISSIONS, guestAccess, guestPermissionsOf, permissionFields, shownGuests } from '../guests'

const event = (over: Partial<CalEvent>): CalEvent => ({
  _id: 'e1', eventId: 'ev', title: 'Họp', user: 'me', calendar: 'cal', access: 'owner',
  participants: [], blockTime: true, date: 0, dueDate: 1, allDay: false, ...over
})

describe('guestPermissionsOf', () => {
  it('uses Google defaults when the attributes are missing', () => {
    expect(guestPermissionsOf(event({}))).toEqual({ canModify: false, canInvite: true, canSeeGuests: true })
    expect(DEFAULT_GUEST_PERMISSIONS).toEqual({ canModify: false, canInvite: true, canSeeGuests: true })
  })
  it('reads stored values', () => {
    expect(guestPermissionsOf(event({ servoneGuestsCanModify: true, servoneGuestsCanInvite: false, servoneGuestsCanSeeGuests: false })))
      .toEqual({ canModify: true, canInvite: false, canSeeGuests: false })
  })
  it('maps back to attributes', () => {
    expect(permissionFields({ canModify: true, canInvite: false, canSeeGuests: true }))
      .toEqual({ servoneGuestsCanModify: true, servoneGuestsCanInvite: false, servoneGuestsCanSeeGuests: true })
  })
})

describe('guestAccess', () => {
  it('gives the organizer every field', () => {
    const access = guestAccess(true, { canModify: false, canInvite: false, canSeeGuests: false })
    expect(access.canSeeGuests).toBe(true)
    expect(access.fields.has('title')).toBe(true)
    expect(access.fields.has('guestPermissions')).toBe(true)
  })
  it('limits a guest to their own fields plus inviting by default', () => {
    const access = guestAccess(false, DEFAULT_GUEST_PERMISSIONS)
    expect([...access.fields].sort()).toEqual(['busy', 'guests', 'reminders'])
    expect(access.canSeeGuests).toBe(true)
  })
  it('lets a guest edit the event when allowed, which implies inviting and seeing guests', () => {
    const access = guestAccess(false, { canModify: true, canInvite: false, canSeeGuests: false })
    expect(access.fields.has('time')).toBe(true)
    expect(access.fields.has('guests')).toBe(true)
    expect(access.fields.has('guestPermissions')).toBe(false)
    expect(access.canSeeGuests).toBe(true)
  })
  it('hides the guest list and inviting when both are off', () => {
    const access = guestAccess(false, { canModify: false, canInvite: false, canSeeGuests: false })
    expect([...access.fields].sort()).toEqual(['busy', 'reminders'])
    expect(access.canSeeGuests).toBe(false)
  })
})

describe('shownGuests', () => {
  it('keeps everyone when the list is visible', () => {
    expect(shownGuests(['an', 'binh', 'chi'], true, ['an', 'binh'])).toEqual(['an', 'binh', 'chi'])
  })
  it('keeps only the organizer and me otherwise', () => {
    expect(shownGuests(['an', 'binh', 'chi'], false, ['an', 'chi'])).toEqual(['an', 'chi'])
  })
})
