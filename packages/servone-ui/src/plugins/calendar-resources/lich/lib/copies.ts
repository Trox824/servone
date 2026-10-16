import type { CalEvent } from './types'

type Copy = Pick<CalEvent, 'eventId' | 'user' | 'access'>

export function onePerPerson<E extends Copy> (events: E[], personOf: (socialId: string) => string | undefined): E[] {
  const kept = new Map<string, E>()
  for (const e of events) {
    const key = `${personOf(e.user) ?? e.user} ${e.eventId}`
    const seen = kept.get(key)
    if (seen === undefined || (seen.access !== 'owner' && e.access === 'owner')) kept.set(key, e)
  }
  return [...kept.values()]
}
