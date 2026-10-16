import calendar, { AccessLevel, type Calendar, type Event, type ReccuringEvent } from '@hcengineering/calendar'
import contact, { AvatarType, type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import { type Class, type Doc, type PersonId, type Ref, SocialIdType, toFindResult } from '@hcengineering/core'

import { ToolInputError } from '../tool'
import { calendarTools } from '../tools/calendar'
import { fakeSession, ME_ACCOUNT, ME_PERSON, ME_SOCIAL } from './fixtures'

const listEvents = calendarTools.find((t) => t.name === 'list_events')
const createEvent = calendarTools.find((t) => t.name === 'create_event')
if (listEvents === undefined || createEvent === undefined) throw new Error('calendar tools missing')

const HOUR = 3_600_000
const DAY = 24 * HOUR

const primaryId = `${ME_ACCOUNT}_calendar` as Ref<Calendar>

function makeCalendar (id: Ref<Calendar>, name: string): Calendar {
  return {
    _id: id,
    _class: calendar.class.Calendar,
    space: calendar.space.Calendar,
    modifiedOn: 0,
    modifiedBy: ME_SOCIAL,
    createdBy: ME_SOCIAL,
    name,
    hidden: false,
    visibility: 'public',
    user: ME_SOCIAL,
    access: AccessLevel.Owner
  }
}

function makeEvent (id: string, title: string, date: number, dueDate: number): Event {
  return {
    _id: id as Ref<Event>,
    _class: calendar.class.Event,
    space: calendar.space.Calendar,
    modifiedOn: 0,
    modifiedBy: ME_SOCIAL,
    attachedTo: calendar.ids.NoAttached,
    attachedToClass: calendar.class.Event,
    collection: 'events',
    eventId: `eid-${id}`,
    title,
    description: '',
    calendar: primaryId,
    allDay: false,
    date,
    dueDate,
    participants: [ME_PERSON],
    access: AccessLevel.Owner,
    user: ME_SOCIAL,
    blockTime: true
  }
}

function makeSeries (id: string, title: string, date: number, dueDate: number): ReccuringEvent {
  return {
    ...makeEvent(id, title, date, dueDate),
    _id: id as Ref<ReccuringEvent>,
    _class: calendar.class.ReccuringEvent,
    rules: [{ freq: 'DAILY' }],
    exdate: [],
    rdate: [],
    originalStartTime: date,
    timeZone: 'UTC'
  }
}

function setup (docs: Map<Ref<Class<Doc>>, Doc[]>, findOneDocs: Map<Ref<Class<Doc>>, Doc | undefined> = new Map()): ReturnType<typeof fakeSession> {
  const session = fakeSession()
  jest.mocked(session.client.findAll).mockImplementation(async (_class) => toFindResult(docs.get(_class) ?? []))
  jest.mocked(session.client.findOne).mockImplementation(async (_class) => findOneDocs.get(_class))
  return session
}

describe('list_events', () => {
  it('rejects a range over 62 days without querying', async () => {
    const session = setup(new Map())
    await expect(listEvents.run(session, { from: '2026-01-01', to: '2026-03-15' })).rejects.toThrow(ToolInputError)
    expect(session.client.findAll).not.toHaveBeenCalled()
  })

  it('rejects to before from', async () => {
    const session = setup(new Map())
    await expect(listEvents.run(session, { from: '2026-01-10', to: '2026-01-01' })).rejects.toThrow(ToolInputError)
  })

  it('reads offset-less times in the given time zone', async () => {
    const session = setup(new Map([[calendar.class.Calendar, [makeCalendar(primaryId, 'Me')]]]))
    await listEvents.run(session, { from: '2026-09-25T00:00', to: '2026-09-26T00:00', timeZone: 'Asia/Ho_Chi_Minh' })
    const eventQuery = jest.mocked(session.client.findAll).mock.calls.find((c) => c[0] === calendar.class.Event)
    expect(eventQuery?.[1]).toMatchObject({
      calendar: { $in: [primaryId] },
      date: { $lt: Date.UTC(2026, 8, 25, 17) },
      dueDate: { $gt: Date.UTC(2026, 8, 24, 17) }
    })
  })

  it('prints single and expanded recurring events in time order', async () => {
    const from = Date.UTC(2026, 8, 25)
    const single = makeEvent('e1', 'Planning', from + 14 * HOUR, from + 15 * HOUR)
    single.location = 'Room 2'
    const series = makeSeries('s1', 'Standup', from - 3 * DAY + 9 * HOUR, from - 3 * DAY + 9 * HOUR + 15 * 60_000)
    const session = setup(
      new Map<Ref<Class<Doc>>, Doc[]>([
        [calendar.class.Calendar, [makeCalendar(primaryId, 'Me')]],
        [calendar.class.Event, [single]],
        [calendar.class.ReccuringEvent, [series]]
      ])
    )
    const out = await listEvents.run(session, { from: '2026-09-25', to: '2026-09-27' })
    const lines = out.split('\n').filter((l) => /^\d{4}-/.test(l))
    expect(lines).toEqual([
      '2026-09-25 09:00-09:15  Standup',
      '2026-09-25 14:00-15:00  Planning  (Room 2)',
      '2026-09-26 09:00-09:15  Standup'
    ])
  })

  it('says so when there are no calendars', async () => {
    const session = setup(new Map())
    expect(await listEvents.run(session, { from: '2026-09-25', to: '2026-09-26' })).toContain('No events')
  })
})

describe('create_event', () => {
  const calendars = new Map<Ref<Class<Doc>>, Doc[]>([[calendar.class.Calendar, [makeCalendar(primaryId, 'Me')]]])

  it('rejects end not after start', async () => {
    const session = setup(calendars)
    await expect(
      createEvent.run(session, { title: 'Sync', start: '2026-09-25T10:00:00Z', end: '2026-09-25T10:00:00Z' })
    ).rejects.toThrow(ToolInputError)
    expect(session.client.addCollection).not.toHaveBeenCalled()
  })

  it('rejects an unknown participant before any write', async () => {
    const session = setup(calendars)
    await expect(
      createEvent.run(session, {
        title: 'Sync',
        start: '2026-09-25T10:00:00Z',
        end: '2026-09-25T11:00:00Z',
        participants: ['ghost@example.com']
      })
    ).rejects.toThrow('ghost@example.com')
    expect(session.client.addCollection).not.toHaveBeenCalled()
  })

  it('writes the event to the primary calendar with resolved participants', async () => {
    const other = 'person-ann' as Ref<Person>
    const identity: SocialIdentity = {
      _id: 'sid-ann' as SocialIdentity['_id'],
      _class: contact.class.SocialIdentity,
      space: contact.space.Contacts,
      modifiedOn: 0,
      modifiedBy: ME_SOCIAL,
      attachedTo: other,
      attachedToClass: contact.class.Person,
      collection: 'socialIds',
      type: SocialIdType.EMAIL,
      value: 'ann@example.com',
      key: 'email:ann@example.com' as PersonId
    }
    const session = setup(calendars, new Map([[contact.class.SocialIdentity, identity]]))
    const out = await createEvent.run(session, {
      title: 'Sync',
      start: '2026-09-25T10:00:00Z',
      end: '2026-09-25T11:00:00Z',
      location: 'Room 1',
      participants: ['Ann@Example.com']
    })
    expect(jest.mocked(session.client.findOne).mock.calls[0][1]).toEqual({ key: 'email:ann@example.com' })
    expect(session.client.addCollection).toHaveBeenCalledWith(
      calendar.class.Event,
      calendar.space.Calendar,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events',
      expect.objectContaining({
        calendar: primaryId,
        title: 'Sync',
        date: Date.UTC(2026, 8, 25, 10),
        dueDate: Date.UTC(2026, 8, 25, 11),
        allDay: false,
        participants: [ME_PERSON, other],
        access: AccessLevel.Owner,
        user: ME_SOCIAL,
        blockTime: true,
        location: 'Room 1',
        eventId: expect.any(String)
      })
    )
    expect(out).toContain('Created event "Sync"')
  })

  it('stores all-day events as UTC days with an inclusive end day', async () => {
    const session = setup(calendars)
    await createEvent.run(session, { title: 'Offsite', start: '2026-09-25', end: '2026-09-26', allDay: true })
    expect(session.client.addCollection).toHaveBeenCalledWith(
      calendar.class.Event,
      calendar.space.Calendar,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events',
      expect.objectContaining({ allDay: true, date: Date.UTC(2026, 8, 25), dueDate: Date.UTC(2026, 8, 27) - 1, blockTime: false })
    )
  })

  it('resolves a participant by full name', async () => {
    const ann: Employee = {
      _id: 'person-ann' as Ref<Employee>,
      _class: contact.class.Person,
      space: contact.space.Contacts,
      modifiedOn: 0,
      modifiedBy: ME_SOCIAL,
      name: 'Tran,Ann',
      avatarType: AvatarType.COLOR,
      active: true
    }
    const session = setup(new Map<Ref<Class<Doc>>, Doc[]>([...calendars, [contact.mixin.Employee, [ann]]]))
    await createEvent.run(session, {
      title: 'Sync',
      start: '2026-09-25T10:00:00Z',
      end: '2026-09-25T11:00:00Z',
      participants: ['Ann Tran']
    })
    expect(session.client.addCollection).toHaveBeenCalledWith(
      calendar.class.Event,
      calendar.space.Calendar,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events',
      expect.objectContaining({ participants: [ME_PERSON, ann._id] })
    )
  })
})
