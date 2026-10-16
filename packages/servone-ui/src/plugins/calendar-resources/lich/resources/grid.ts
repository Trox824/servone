import {
  bookingIntervals,
  RESOURCE_TYPES,
  type BookableResource,
  type BookingEvent,
  type Interval,
  type ResourceType
} from '@servone/approvals/src/booking'
import { HOUR_MS } from '../lib/time'
import type { Lang } from '../lib/types'

export const TYPE_FILTERS = ['all', 'room', 'car', 'equipment'] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]

export type Block<E> = Interval & { event: E }

export function columnsOf<R extends Pick<BookableResource, 'name' | 'type' | 'archived'>> (resources: R[], filter: TypeFilter, lang: Lang): R[] {
  const rank = (type: ResourceType): number => RESOURCE_TYPES.indexOf(type)
  return resources
    .filter((resource) => !resource.archived && (filter === 'all' || resource.type === filter))
    .sort((a, b) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name, lang))
}

export function draftSlotOf (slot: Interval, blocks: Interval[]): Interval {
  const nextStart = Math.min(...blocks.filter((block) => block.start >= slot.end).map((block) => block.start))
  return { start: slot.start, end: Math.min(slot.start + HOUR_MS, nextStart) }
}

export const DRAG_STEP_MS = 15 * 60 * 1000

export function dragSlot (pressedAt: number, pointerAt: number, blocks: Interval[], earliest: number): Interval | undefined {
  const snap = (ts: number): number => Math.floor(ts / DRAG_STEP_MS) * DRAG_STEP_MS
  const anchor = snap(pressedAt)
  if (anchor < earliest || blocks.some((block) => block.start <= anchor && block.end > anchor)) return undefined
  const pointer = snap(pointerAt)
  if (pointer >= anchor) {
    const limit = Math.min(...blocks.filter((block) => block.start > anchor).map((block) => block.start))
    return { start: anchor, end: Math.min(pointer + DRAG_STEP_MS, limit) }
  }
  const limit = Math.max(earliest, ...blocks.filter((block) => block.end <= anchor).map((block) => block.end))
  return { start: Math.max(pointer, limit), end: anchor + DRAG_STEP_MS }
}

export function packLanes<T extends Interval> (blocks: T[]): Array<T & { lane: number, lanes: number }> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const packed: Array<T & { lane: number, lanes: number }> = []
  let cluster: Array<T & { lane: number, lanes: number }> = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity
  const close = (): void => {
    for (const block of cluster) block.lanes = laneEnds.length
    packed.push(...cluster)
    cluster = []
    laneEnds = []
  }
  for (const block of sorted) {
    if (block.start >= clusterEnd) close()
    let lane = laneEnds.findIndex((end) => end <= block.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = block.end
    cluster.push({ ...block, lane, lanes: 0 })
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  close()
  return packed
}

export function blocksOf<E extends BookingEvent> (events: E[], resource: string, window: Interval): Array<Block<E>> {
  const byId = new Map(events.map((event) => [event._id, event]))
  return bookingIntervals(events, resource, window).flatMap(({ _id, start, end }) => {
    const event = byId.get(_id)
    return event === undefined ? [] : [{ start, end, event }]
  })
}
