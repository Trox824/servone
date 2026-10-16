import type { Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import type { ParticipantInfo, Room } from '@hcengineering/love'

export const PREP_LEAD_MS = 30 * 60 * 1000
export const AGENDA_LINES = 3

interface Timed {
  date: number
  dueDate: number
  allDay: boolean
}

export function prepMeeting<E extends Timed> (meetings: E[], now: number): E | undefined {
  return meetings
    .filter((e) => !e.allDay && now >= e.date - PREP_LEAD_MS && now <= e.dueDate)
    .sort((a, b) => a.date - b.date)[0]
}

export function agendaLines (text: string): { lines: string[], hasMore: boolean } {
  const all = text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  return { lines: all.slice(0, AGENDA_LINES), hasMore: all.length > AGENDA_LINES }
}

interface Tracked {
  createdOn?: number
  modifiedOn: number
}

export function openEarlierItems<I extends Tracked> (items: I[], occurrenceStart: number, isClosed: (item: I) => boolean): I[] {
  return items.filter((item) => !isClosed(item) && (item.createdOn ?? item.modifiedOn) < occurrenceStart)
}

export interface LiveCall {
  room: Ref<Room>
  people: Array<Ref<Person>>
}

export function liveCalls (
  infos: Array<Pick<ParticipantInfo, 'room' | 'person'>>,
  callRooms: ReadonlySet<Ref<Room>>,
  me: Ref<Person>
): LiveCall[] {
  const byRoom = new Map<Ref<Room>, Array<Ref<Person>>>()
  for (const { room, person } of infos) {
    if (!callRooms.has(room) || person === me) continue
    byRoom.set(room, [...(byRoom.get(room) ?? []), person])
  }
  return [...byRoom].map(([room, people]) => ({ room, people })).sort((a, b) => b.people.length - a.people.length)
}
