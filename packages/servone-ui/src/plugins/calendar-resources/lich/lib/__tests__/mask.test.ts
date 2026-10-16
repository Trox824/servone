import { maskOf } from '../mask'
import type { Visibility } from '../types'

const isMine = (s: string): boolean => s === 'me'
const calendars: Record<string, Visibility> = { open: 'public', closed: 'freeBusy', secret: 'private' }
const calVis = (id: string): Visibility | undefined => calendars[id]

describe('maskOf', () => {
  it('shows my own events in full whatever their visibility', () => {
    expect(maskOf({ user: 'me', visibility: 'private', calendar: 'secret' }, calVis, isMine)).toBe('full')
  })
  it('uses the event visibility first', () => {
    expect(maskOf({ user: 'x', visibility: 'public', calendar: 'secret' }, calVis, isMine)).toBe('full')
    expect(maskOf({ user: 'x', visibility: 'freeBusy', calendar: 'open' }, calVis, isMine)).toBe('freeBusy')
    expect(maskOf({ user: 'x', visibility: 'private', calendar: 'open' }, calVis, isMine)).toBe('private')
  })
  it('falls back to the calendar visibility, then to public like upstream isVisible', () => {
    expect(maskOf({ user: 'x', calendar: 'closed' }, calVis, isMine)).toBe('freeBusy')
    expect(maskOf({ user: 'x', calendar: 'secret' }, calVis, isMine)).toBe('private')
    expect(maskOf({ user: 'x', calendar: 'open' }, calVis, isMine)).toBe('full')
    expect(maskOf({ user: 'x', calendar: 'unknown' }, calVis, isMine)).toBe('full')
  })
})
