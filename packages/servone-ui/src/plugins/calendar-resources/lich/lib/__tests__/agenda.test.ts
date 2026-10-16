import { agendaDays } from '../agenda'

const local = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime()

describe('agendaDays', () => {
  it('lists only days with events, in order, inside the window', () => {
    const a = { date: local(2026, 9, 26, 9), dueDate: local(2026, 9, 26, 10), allDay: false }
    const b = { date: local(2026, 9, 24, 9), dueDate: local(2026, 9, 24, 10), allDay: false }
    const outside = { date: local(2026, 11, 1, 9), dueDate: local(2026, 11, 1, 10), allDay: false }
    const days = agendaDays([a, b, outside], local(2026, 9, 24, 15), 30)
    expect(days.map((d) => d.day)).toEqual([local(2026, 9, 24), local(2026, 9, 26)])
  })
  it('repeats a multi-day event on each day it covers', () => {
    const trip = { date: local(2026, 9, 24, 20), dueDate: local(2026, 9, 26, 8), allDay: false }
    expect(agendaDays([trip], local(2026, 9, 24), 30).map((d) => d.events.length)).toEqual([1, 1, 1])
  })
  it('puts an all-day event stored at UTC midnight on its local days', () => {
    const retreat = { date: Date.UTC(2026, 8, 24), dueDate: Date.UTC(2026, 8, 26, 23, 59, 59, 999), allDay: true }
    expect(agendaDays([retreat], local(2026, 9, 20), 30).map((d) => d.day)).toEqual([
      local(2026, 9, 24),
      local(2026, 9, 25),
      local(2026, 9, 26)
    ])
  })
})
