import type { Event } from '@hcengineering/calendar'
import type { Readable } from 'svelte/store'
import type { Answer } from './lib/rsvp'
import type { Mask } from './lib/mask'

export const LICH_CONTEXT = 'servone:lich'

export const DRAFT_EVENT_ID = 'servone-lich-draft'

export interface CardLook {
  mask: Mask
  answer: Answer
  color: string
  isDeclined: boolean
  isFree: boolean
  isDraft: boolean
}

export function isDraftEvent (e: Pick<Event, '_id'>): boolean {
  return e._id === DRAFT_EVENT_ID
}

export interface LichContext {
  openEvent: (e: Event, anchor: HTMLElement) => void
  cardOf: Readable<(e: Event) => CardLook>
}

const OVERLAY_COLORS = [1, 2, 3, 4, 5, 6].map((n) => `var(--lich-overlay-${n})`)

export function overlayColor (index: number): string {
  return OVERLAY_COLORS[Math.max(0, index) % OVERLAY_COLORS.length]
}
