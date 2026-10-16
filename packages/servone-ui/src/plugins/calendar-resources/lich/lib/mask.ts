import type { CalEvent, Visibility } from './types'

export type Mask = 'full' | 'freeBusy' | 'private'

export function maskOf (
  e: Pick<CalEvent, 'user' | 'visibility' | 'calendar'>,
  calendarVisibility: (calendarId: string) => Visibility | undefined,
  isMine: (socialId: string) => boolean
): Mask {
  if (isMine(e.user)) return 'full'
  const visibility = e.visibility ?? calendarVisibility(e.calendar) ?? 'public'
  return visibility === 'public' ? 'full' : visibility
}
