import { findClashes, bookingWindow, type BookingEvent } from '../../../packages/servone-approvals/src/booking'
import { APPROVALS, CHANNELS, PEOPLE_KEYS } from '../content'
import { buildScenario, markupOf, vietnamDayStart, type PlannedEvent } from '../scenario'
import { fileBytes } from '../files'
import { DRIVE_FOLDERS } from '../content'

const NOW = Date.UTC(2026, 9, 4, 5, 0) // Sun 4 Oct 2026, 12:00 in Vietnam

function bookingOf (event: PlannedEvent): BookingEvent {
  return {
    _id: event.key,
    eventId: event.key,
    date: event.start,
    dueDate: event.end,
    allDay: false,
    access: 'owner',
    timeZone: 'Asia/Ho_Chi_Minh',
    rules: event.rule === undefined ? undefined : [event.rule],
    exdate: [],
    rdate: [],
    servoneResource: event.resource,
    servoneBookingState: 'confirmed'
  }
}

describe('demo scenario', () => {
  const scenario = buildScenario(NOW)

  it('never double-books a resource, including repeats', () => {
    const booked = scenario.events.filter((event) => event.resource !== undefined).map(bookingOf)
    expect(booked.length).toBeGreaterThan(5)
    booked.forEach((candidate, i) => {
      expect(findClashes(candidate, booked.slice(0, i), bookingWindow(candidate, NOW))).toEqual([])
    })
  })

  it('detects a real clash, so the test above can fail', () => {
    const sync = scenario.events.find((event) => event.key === 'sync') as PlannedEvent
    const clashing = bookingOf({ ...sync, key: 'clone' })
    expect(findClashes(clashing, [bookingOf(sync)], bookingWindow(clashing, NOW)).length).toBeGreaterThan(0)
  })

  it('keeps messages in the past, in order, and only by known people', () => {
    for (const channel of scenario.channels) {
      const times = channel.messages.map((message) => message.at)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      for (const message of channel.messages) {
        expect(message.at).toBeLessThan(NOW)
        expect(PEOPLE_KEYS).toContain(message.by)
      }
    }
    expect(CHANNELS.filter((channel) => channel.isPrivate)).toHaveLength(1)
  })

  it('puts upcoming events inside the next two weeks and anchors repeats in the past', () => {
    const one = scenario.events.filter((event) => event.rule === undefined && event.start > NOW)
    expect(one.length).toBeGreaterThanOrEqual(3)
    for (const event of one) expect(event.start - NOW).toBeLessThan(14 * 24 * 3600_000)
    expect(scenario.events.find((event) => event.key === 'sync')?.start).toBeLessThan(NOW)
  })

  it('files one approval waiting at a gate for each workflow that has one', () => {
    for (const approval of APPROVALS) expect(approval.items.length).toBeGreaterThanOrEqual(4)
    expect(APPROVALS.flatMap((approval) => approval.items).filter((item) => item.status === 'Awaiting approval' || item.status === 'Offer').length).toBeGreaterThanOrEqual(2)
  })

  it('turns @key into a mention only for known people', () => {
    const markup = JSON.parse(markupOf('Hi @linh and @nobody', (key) => (key === 'linh' ? { id: 'p1', name: 'Linh Tran' } : undefined)))
    expect(markup.content[0].content).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'reference', attrs: { id: 'p1', objectclass: 'contact:class:Person', label: 'Linh Tran' } },
      { type: 'text', text: ' and ' },
      { type: 'text', text: '@nobody' }
    ])
  })

  it('finds Vietnam midnight', () => {
    expect(vietnamDayStart(NOW)).toBe(Date.UTC(2026, 9, 3, 17, 0))
  })

  it('generates valid file bytes', () => {
    for (const file of DRIVE_FOLDERS.flatMap((folder) => folder.files)) {
      const bytes = fileBytes(file)
      if (file.kind === 'pdf') {
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
        const xref = Number(/startxref\n(\d+)/.exec(bytes.toString('latin1'))?.[1])
        expect(bytes.subarray(xref, xref + 4).toString()).toBe('xref')
      }
      if (file.kind === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    }
  })
})
