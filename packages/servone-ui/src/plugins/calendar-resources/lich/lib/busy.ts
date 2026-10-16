import { addDays, spanOf } from './time'
import { isDeclined, myAnswer } from './rsvp'
import type { CalEvent, Slot, Timed } from './types'

export function busyBlocks (events: Array<Timed & { blockTime: boolean }>, day: number): Slot[] {
  const dayEnd = addDays(day, 1)
  const clipped = events
    .filter((e) => e.blockTime && !e.allDay)
    .map(spanOf)
    .filter((s) => s.start < dayEnd && s.end > day)
    .map((s) => ({ start: Math.max(s.start, day), end: Math.min(s.end, dayEnd) }))
    .sort((a, b) => a.start - b.start)
  const merged: Slot[] = []
  for (const slot of clipped) {
    const last = merged[merged.length - 1]
    if (last !== undefined && slot.start <= last.end) last.end = Math.max(last.end, slot.end)
    else merged.push({ ...slot })
  }
  return merged
}

export function overlaps (slot: Slot, blocks: Slot[]): boolean {
  return blocks.some((b) => b.start < slot.end && b.end > slot.start)
}

export function blocksTime (e: CalEvent, stored: CalEvent[]): boolean {
  return e.blockTime && !isDeclined(myAnswer(e, stored, (socialId) => socialId === e.user))
}
