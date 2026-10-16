import type { Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import type { Room } from '@hcengineering/love'
import { agendaLines, liveCalls, openEarlierItems, prepMeeting } from '../today'

const at = (hour: number, minute = 0): number => new Date(2026, 9, 5, hour, minute).getTime()
const meeting = (title: string, start: number, end: number, allDay = false): { title: string, date: number, dueDate: number, allDay: boolean } =>
  ({ title, date: start, dueDate: end, allDay })
const room = (id: string): Ref<Room> => id as Ref<Room>
const person = (id: string): Ref<Person> => id as Ref<Person>

describe('prepMeeting', () => {
  const sync = meeting('Weekly sync', at(10), at(11))

  it('shows from 30 minutes before the start', () => {
    expect(prepMeeting([sync], at(9, 29))).toBeUndefined()
    expect(prepMeeting([sync], at(9, 30))).toBe(sync)
    expect(prepMeeting([sync], at(9, 50))).toBe(sync)
  })

  it('keeps showing until the meeting ends', () => {
    expect(prepMeeting([sync], at(11))).toBe(sync)
    expect(prepMeeting([sync], at(11, 1))).toBeUndefined()
  })

  it('prefers the meeting in progress over the next one', () => {
    const next = meeting('Design review', at(11), at(12))
    expect(prepMeeting([next, sync], at(10, 45))).toBe(sync)
    expect(prepMeeting([next, sync], at(11, 1))).toBe(next)
  })

  it('skips all-day events', () => {
    expect(prepMeeting([meeting('Offsite', at(0), at(23, 59), true)], at(10))).toBeUndefined()
  })
})

describe('agendaLines', () => {
  it('takes the first non-empty lines', () => {
    expect(agendaLines('  Goals \n\n Blockers\nDemo\nAOB')).toEqual({ lines: ['Goals', 'Blockers', 'Demo'], hasMore: true })
  })

  it('reports no more when everything fits', () => {
    expect(agendaLines('Goals\n')).toEqual({ lines: ['Goals'], hasMore: false })
    expect(agendaLines('')).toEqual({ lines: [], hasMore: false })
  })
})

describe('openEarlierItems', () => {
  const start = at(10)
  const item = (title: string, createdOn: number, isDone = false): { title: string, createdOn: number, modifiedOn: number, isDone: boolean } =>
    ({ title, createdOn, modifiedOn: createdOn, isDone })
  const isClosed = (i: { isDone: boolean }): boolean => i.isDone

  it('keeps open items made before this occurrence', () => {
    const lastWeek = item('Send deck', start - 7 * 24 * 3600 * 1000)
    const done = item('Book room', start - 7 * 24 * 3600 * 1000, true)
    const today = item('Follow up', at(10, 30))
    expect(openEarlierItems([lastWeek, done, today], start, isClosed)).toEqual([lastWeek])
  })
})

describe('liveCalls', () => {
  const me = person('me')
  const calls = new Set([room('call-a'), room('call-b')])

  it('groups people by call room and leaves me out', () => {
    const infos = [
      { room: room('call-a'), person: person('an') },
      { room: room('call-a'), person: me },
      { room: room('call-b'), person: person('binh') },
      { room: room('call-b'), person: person('chi') }
    ]
    expect(liveCalls(infos, calls, me)).toEqual([
      { room: room('call-b'), people: [person('binh'), person('chi')] },
      { room: room('call-a'), people: [person('an')] }
    ])
  })

  it('ignores reception and offices', () => {
    expect(liveCalls([{ room: room('love:ids:Reception'), person: person('an') }], calls, me)).toEqual([])
  })

  it('drops a call where only I am left', () => {
    expect(liveCalls([{ room: room('call-a'), person: me }], calls, me)).toEqual([])
  })
})
