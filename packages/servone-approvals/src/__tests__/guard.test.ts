import contact, { AvatarType, type Employee, type Person } from '@hcengineering/contact'
import core, {
  AccountRole,
  ClassifierKind,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  TxFactory,
  TxProcessor,
  type Account,
  type AccountUuid,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type Domain,
  type MeasureContext,
  type Mixin,
  type PersonId,
  type Ref,
  type SessionData,
  type Space,
  type Status,
  type Tx,
  type TxCreateDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import hr, { type Department, type Request as Leave, type RequestType, type Staff } from '@hcengineering/hr'
import platform, { PlatformError, type IntlString } from '@hcengineering/platform'
import request, { RequestStatus, type Request } from '@hcengineering/request'
import task, {
  type Project,
  type ProjectType,
  type ProjectTypeDescriptor,
  type Task,
  type TaskType,
  type TaskTypeDescriptor
} from '@hcengineering/task'
import type { Middleware, PipelineContext } from '@hcengineering/server-core'
import {
  APPROVAL_SERVICE_ID,
  ApprovalGuardMiddleware,
  BOOKING_CLASH,
  RESOURCE_CLASS,
  type BookableResource,
  type BookingEvent,
  type LeaveApproval,
  WAITING_APPROVAL
} from '..'

const factory = new TxFactory('test:person' as PersonId)
const issueClass = 'test:class:Issue' as Ref<Class<Task>>
const project = 'test:space:Project' as Ref<Project>
const kind = 'test:taskType:Change' as Ref<TaskType>
const projectType = 'test:projectType:Change' as Ref<ProjectType>
const issue = 'test:issue:1' as Ref<Task>
interface AnnouncedChannel extends Space {
  topic?: string
  servonePostPolicy?: 'everyone' | 'admins'
}
const channelClass = 'chunter:class:Channel' as Ref<Class<AnnouncedChannel>>
const messageClass = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const [assigned, changeApproval, inProgress, resolved, closed, canceled] = [
  'Assigned',
  'ChangeApproval',
  'InProgress',
  'Resolved',
  'Closed',
  'Canceled'
].map((name) => `test:status:${name}` as Ref<Status>)

const eventClass = 'calendar:class:Event' as Ref<Class<Doc>>
const recurringEventClass = 'calendar:class:ReccuringEvent' as Ref<Class<Doc>>
const recurringInstanceClass = 'calendar:class:ReccuringInstance' as Ref<Class<Doc>>
const room = 'test:resource:room' as Ref<BookableResource>
const car = 'test:resource:car' as Ref<BookableResource>
const oldRoom = 'test:resource:old' as Ref<BookableResource>

function classTx (_class: Ref<Class<Doc>>, extendsClass?: Ref<Class<Doc>>, mixin = false, domain?: string): Tx {
  return factory.createTxCreateDoc(
    mixin ? core.class.Mixin : core.class.Class,
    core.space.Model,
    { label: 'test' as IntlString, kind: mixin ? ClassifierKind.MIXIN : ClassifierKind.CLASS, extends: extendsClass, domain: domain as Domain | undefined },
    _class
  )
}

function resourceTx (_id: Ref<BookableResource>, needsApproval: boolean, archived = false): Tx {
  return factory.createTxCreateDoc(RESOURCE_CLASS, core.space.Model, { name: _id, type: 'room', needsApproval, archived }, _id)
}

async function buildContext (): Promise<PipelineContext> {
  const hierarchy = new Hierarchy()
  const modelDb = new ModelDb(hierarchy)
  const classes = [
    classTx(core.class.Obj),
    classTx(core.class.Doc, core.class.Obj),
    classTx(core.class.AttachedDoc, core.class.Doc),
    classTx(core.class.Status, core.class.Doc),
    classTx(task.class.TaskType, core.class.Doc),
    classTx(task.class.ProjectType, core.class.Doc),
    classTx(task.class.Task, core.class.AttachedDoc),
    classTx(issueClass, task.class.Task),
    classTx(request.class.Request, core.class.AttachedDoc),
    classTx(hr.class.Request, core.class.AttachedDoc),
    classTx(hr.class.Department, core.class.Doc),
    classTx(contact.class.Person, core.class.Doc),
    classTx(hr.mixin.Staff, contact.class.Person, true),
    classTx(core.class.Space, core.class.Doc),
    classTx(channelClass, core.class.Space),
    classTx(messageClass, core.class.AttachedDoc),
    classTx(eventClass, core.class.AttachedDoc),
    classTx(recurringEventClass, eventClass),
    classTx(recurringInstanceClass, recurringEventClass),
    classTx(RESOURCE_CLASS, core.class.Doc, false, 'model')
  ]
  for (const tx of classes) hierarchy.tx(tx)
  const statuses = [assigned, changeApproval, inProgress, resolved, closed, canceled]
  const model = [
    ...statuses.map((status) =>
      factory.createTxCreateDoc(
        core.class.Status,
        core.space.Model,
        {
          ofAttribute: task.attribute.State,
          name: status,
          category: status === canceled ? task.statusCategory.Lost : task.statusCategory.Active
        },
        status
      )
    ),
    factory.createTxCreateDoc(
      task.class.TaskType,
      core.space.Model,
      {
        parent: projectType,
        descriptor: 'test:descriptor:Task' as Ref<TaskTypeDescriptor>,
        name: 'Change',
        kind: 'task',
        ofClass: issueClass,
        targetClass: issueClass,
        statusClass: core.class.Status,
        statuses,
        statusCategories: []
      },
      kind
    ),
    factory.createTxCreateDoc(
      task.class.ProjectType,
      core.space.Model,
      {
        name: 'Change',
        descriptor: 'test:descriptor:Project' as Ref<ProjectTypeDescriptor>,
        tasks: [kind],
        description: '',
        roles: 0,
        targetClass: task.class.Project,
        classic: false,
        statuses: statuses.map((_id) =>
          _id === changeApproval ? { _id, taskType: kind, servoneApproval: { by: 'manager' } } : { _id, taskType: kind }
        )
      },
      projectType
    ),
    resourceTx(room, false),
    resourceTx(car, true),
    resourceTx(oldRoom, false, true)
  ]
  for (const tx of model) await modelDb.tx(tx)
  const context = { hierarchy, modelDb }
  return context as PipelineContext
}

interface Session {
  role: AccountRole
  service: string
}

const user: Session = { role: AccountRole.User, service: 'user' }
const owner: Session = { role: AccountRole.Owner, service: 'user' }
const github: Session = { role: AccountRole.Owner, service: 'github' }
const engine: Session = { role: AccountRole.Owner, service: APPROVAL_SERVICE_ID }
const maintainer: Session = { role: AccountRole.Maintainer, service: 'user' }
const guest: Session = { role: AccountRole.Guest, service: 'user' }

function contextFor (session: Session): MeasureContext<SessionData> {
  const account: Account = {
    uuid: 'test-account' as AccountUuid,
    role: session.role,
    primarySocialId: 'test:person' as PersonId,
    socialIds: ['test:person' as PersonId],
    fullSocialIds: []
  }
  const ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>
  const contextData = { account, service: session.service }
  ctx.contextData = contextData as SessionData
  return ctx
}

function matches (doc: Doc, query: DocumentQuery<Doc>): boolean {
  return Object.entries(query).every(([key, wanted]) => {
    const actual = Reflect.get(doc, key)
    if (typeof wanted === 'object' && wanted !== null && '$in' in wanted) return Array.isArray(wanted.$in) && wanted.$in.includes(actual)
    return actual === wanted
  })
}

// `onStore` runs as the tx passes the guard, so a test can persist it or hold it in flight.
async function guardOver (stored: Doc[], onStore: (sent: Tx[]) => Promise<void>): Promise<Middleware> {
  const context = await buildContext()
  const next: Partial<Middleware> = {
    tx: async (_ctx, sent) => {
      await onStore(sent)
      return {}
    },
    findAll: async <T extends Doc>(_ctx: MeasureContext, _class: Ref<Class<T>>, query: DocumentQuery<T>) => {
      const found = stored.filter((doc) => context.hierarchy.isDerived(doc._class, _class) && matches(doc, query as DocumentQuery<Doc>))
      return Object.assign(found as T[], { total: found.length })
    }
  }
  return await ApprovalGuardMiddleware.create(contextFor(user), context, next as Middleware)
}

async function send (session: Session, txes: Tx[], stored: Doc[] = []): Promise<Tx[] | undefined> {
  let received: Tx[] | undefined
  const guard = await guardOver(stored, async (sent) => { received = sent })
  await guard.tx(contextFor(session), txes)
  return received
}

function issueData (status: Ref<Status>): Data<Task> {
  return {
    kind,
    status,
    number: 1,
    identifier: 'CHG-1',
    assignee: null,
    dueDate: null,
    rank: '0',
    attachedTo: issue,
    attachedToClass: issueClass,
    collection: 'subIssues'
  }
}

const storedIssue = (status: Ref<Status>): Task =>
  TxProcessor.createDoc2Doc(factory.createTxCreateDoc(issueClass, project, issueData(status), issue))

const move = (to: Ref<Status>): TxUpdateDoc<Task> =>
  factory.createTxUpdateDoc(issueClass, project, issue, { status: to })

function requestData (status: RequestStatus): Data<Request> {
  return {
    requested: [],
    approved: [],
    requiredApprovesCount: 1,
    status,
    tx: move(inProgress),
    attachedTo: issue,
    attachedToClass: issueClass,
    collection: 'requests'
  }
}

async function expectRefused (promise: Promise<unknown>, code = WAITING_APPROVAL): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(PlatformError)
  await expect(promise).rejects.toMatchObject({ status: { code } })
}

describe('ApprovalGuardMiddleware task status', () => {
  it('refuses a move out of a gate by a user, an Owner and another System service', async () => {
    for (const session of [user, owner, github]) {
      await expectRefused(send(session, [move(inProgress)], [storedIssue(changeApproval)]))
    }
  })

  it('lets the approvals service move an item out of a gate', async () => {
    const tx = move(inProgress)
    expect(await send(engine, [tx], [storedIssue(changeApproval)])).toEqual([tx])
  })

  it('lets the workspace service through, because migrations run in this pipeline', async () => {
    const tx = move(inProgress)
    expect(await send({ role: AccountRole.Owner, service: 'workspace' }, [tx], [storedIssue(changeApproval)])).toEqual([
      tx
    ])
  })

  it('refuses a jump past a gate and allows a move into it', async () => {
    await expectRefused(send(user, [move(inProgress)], [storedIssue(assigned)]))
    expect(await send(user, [move(changeApproval)], [storedIssue(assigned)])).toHaveLength(1)
  })

  it('refuses a move out of a gate hidden in an apply batch', async () => {
    const apply = factory.createTxApplyIf(core.space.Tx, 'scope', [], [], [move(inProgress)], 'test', true)
    await expectRefused(send(user, [apply], [storedIssue(changeApproval)]))
  })

  it('allows canceling out of a gate and refuses reopening from Canceled past it', async () => {
    expect(await send(user, [move(canceled)], [storedIssue(changeApproval)])).toHaveLength(1)
    await expectRefused(send(user, [move(inProgress)], [storedIssue(canceled)]))
  })

  it('allows a move between statuses after the gate', async () => {
    expect(await send(user, [move(closed)], [storedIssue(resolved)])).toHaveLength(1)
  })

  it('refuses any move while a request is active for the item', async () => {
    const active = TxProcessor.createDoc2Doc(
      factory.createTxCreateDoc(request.class.Request, project, requestData(RequestStatus.Active))
    )
    await expectRefused(send(user, [move(assigned)], [storedIssue(inProgress), active]))
  })

  it('refuses creating an item past a gate', async () => {
    const create = factory.createTxCreateDoc(issueClass, project, issueData(inProgress))
    await expectRefused(send(user, [create]))
  })

  it('refuses switching an item to a gated type past its gate', async () => {
    const incident = { ...storedIssue(inProgress), kind: 'test:taskType:Incident' as Ref<TaskType> }
    await expectRefused(send(user, [factory.createTxUpdateDoc(issueClass, project, issue, { kind })], [incident]))
  })

  it('leaves unrelated txes alone', async () => {
    const rename = factory.createTxUpdateDoc(issueClass, project, issue, { dueDate: 0 })
    expect(await send(user, [rename])).toEqual([rename])
  })
})

describe('ApprovalGuardMiddleware requests and leave', () => {
  it('refuses a Request create or update from a user session', async () => {
    const create = factory.createTxCreateDoc(request.class.Request, project, requestData(RequestStatus.Active))
    await expectRefused(send(owner, [create]))
    const update = factory.createTxUpdateDoc(request.class.Request, project, create.objectId, {
      status: RequestStatus.Completed
    })
    await expectRefused(send(user, [update]))
  })

  interface MarkedLeave extends Leave {
    servoneApproval?: LeaveApproval
  }
  const leaveClass = hr.class.Request as Ref<Class<MarkedLeave>>
  const leave = 'test:leave:1' as Ref<MarkedLeave>
  const day = { year: 2026, month: 9, day: 30, offset: 0 }
  const leaveData: Data<MarkedLeave> = {
    attachedTo: 'test:employee:1' as Ref<Staff>,
    attachedToClass: hr.mixin.Staff,
    collection: 'requests',
    department: hr.ids.Head,
    type: 'test:requestType:Vacation' as Ref<RequestType>,
    description: '',
    tzDate: day,
    tzDueDate: day
  }
  const storedLeave = (servoneApproval: LeaveApproval): MarkedLeave =>
    TxProcessor.createDoc2Doc(
      factory.createTxCreateDoc(leaveClass, core.space.Workspace, { ...leaveData, servoneApproval }, leave)
    )
  const editLeave = (operations: DocumentUpdate<MarkedLeave>): Tx =>
    factory.createTxUpdateDoc(leaveClass, core.space.Workspace, leave, operations)

  it('refuses edits of a pending or approved leave, and allows them once rejected', async () => {
    await expectRefused(send(user, [editLeave({ description: 'x' })], [storedLeave('pending')]))
    await expectRefused(send(user, [editLeave({ description: 'x' })], [storedLeave('approved')]))
    expect(await send(user, [editLeave({ description: 'x' })], [storedLeave('rejected')])).toHaveLength(1)
  })

  it('refuses setting servoneApproval on a leave', async () => {
    await expectRefused(send(owner, [editLeave({ servoneApproval: 'approved' })], [storedLeave('rejected')]))
    const create = factory.createTxCreateDoc(leaveClass, core.space.Workspace, {
      ...leaveData,
      servoneApproval: 'approved'
    })
    await expectRefused(send(user, [create]))
  })

  it('refuses deleting an approved leave unless admin', async () => {
    const remove = factory.createTxRemoveDoc(leaveClass, core.space.Workspace, leave)
    await expectRefused(send(user, [remove], [storedLeave('approved')]), platform.status.Forbidden)
    expect(await send(owner, [remove], [storedLeave('approved')])).toEqual([remove])
  })

  it('allows deleting a pending leave', async () => {
    const remove = factory.createTxRemoveDoc(leaveClass, core.space.Workspace, leave)
    expect(await send(user, [remove], [storedLeave('pending')])).toEqual([remove])
  })
})

describe('ApprovalGuardMiddleware departments', () => {
  const department = 'test:department:1' as Ref<Department>
  const setHead = factory.createTxUpdateDoc(hr.class.Department, core.space.Workspace, department, {
    teamLead: 'test:employee:1' as Ref<Employee>
  })
  const setDepartment = factory.createTxMixin(
    'test:employee:1' as Ref<Person>,
    contact.class.Person,
    core.space.Workspace,
    hr.mixin.Staff,
    { department }
  )

  it('refuses a Department teamLead or Staff department edit by a User', async () => {
    await expectRefused(send(user, [setHead]), platform.status.Forbidden)
    await expectRefused(send(user, [setDepartment]), platform.status.Forbidden)
  })

  it('lets a Maintainer edit them', async () => {
    expect(await send(maintainer, [setHead, setDepartment])).toHaveLength(2)
  })
})

describe('ApprovalGuardMiddleware stand-ins', () => {
  interface StandInStaff extends Staff {
    servoneStandIn?: Ref<Person>
  }
  // Class<T> never uses T, so the stock ref types the custom field without a cast.
  const standInStaff: Ref<Mixin<StandInStaff>> = hr.mixin.Staff
  const head = 'test:employee:head' as Ref<Person>
  const nameStandIn = factory.createTxMixin(head, contact.class.Person, core.space.Workspace, standInStaff, {
    servoneStandIn: 'test:employee:2' as Ref<Person>
  })
  const storedHead = (personUuid: string): Doc => TxProcessor.createDoc2Doc(
    factory.createTxCreateDoc(contact.class.Person, core.space.Workspace, { name: 'Bình', avatarType: AvatarType.COLOR, personUuid: personUuid as AccountUuid }, head)
  )

  it('refuses a User naming a stand-in for someone else', async () => {
    await expectRefused(send(user, [nameStandIn], [storedHead('other-account')]), platform.status.Forbidden)
  })

  it('lets a User name their own stand-in, and a Maintainer anyone\'s', async () => {
    expect(await send(user, [nameStandIn], [storedHead('test-account')])).toEqual([nameStandIn])
    expect(await send(maintainer, [nameStandIn], [storedHead('other-account')])).toEqual([nameStandIn])
  })
})

describe('ApprovalGuardMiddleware channel settings', () => {
  const random = 'test:channel:random' as Ref<AnnouncedChannel>
  const storedChannel = (owners: string[]): AnnouncedChannel =>
    TxProcessor.createDoc2Doc(
      factory.createTxCreateDoc(
        channelClass,
        core.space.Space,
        { name: 'random', description: '', private: false, members: [], archived: false, owners: owners as AccountUuid[] },
        random
      )
    )
  const edit = (operations: DocumentUpdate<AnnouncedChannel>): TxUpdateDoc<AnnouncedChannel> =>
    factory.createTxUpdateDoc(channelClass, core.space.Space, random, operations)
  const rename = edit({ name: 'general' })
  const setTopic = edit({ topic: 'x' })
  const archive = edit({ archived: true })

  it('refuses a rename, topic change or archive by a User or Guest who does not own the channel', async () => {
    for (const session of [user, guest]) {
      for (const tx of [rename, setTopic, archive, edit({ servonePostPolicy: 'admins' })]) {
        await expectRefused(send(session, [tx], [storedChannel(['other-account'])]), platform.status.Forbidden)
      }
    }
  })

  it('refuses one hidden in an apply batch', async () => {
    const apply = factory.createTxApplyIf(core.space.Tx, 'scope', [], [], [archive], 'test', true)
    await expectRefused(send(user, [apply], [storedChannel([])]), platform.status.Forbidden)
  })

  it('lets an owner, Guest included, edit it but not clear the owners', async () => {
    for (const session of [user, guest]) {
      expect(await send(session, [rename, setTopic, archive], [storedChannel(['test-account'])])).toHaveLength(3)
    }
    await expectRefused(send(user, [edit({ owners: [] })], [storedChannel(['test-account'])]), platform.status.Forbidden)
  })

  it('lets a Maintainer edit any channel', async () => {
    expect(await send(maintainer, [rename, archive, edit({ owners: [] })], [storedChannel(['other-account'])])).toHaveLength(3)
  })

  it('leaves membership and message posts to everyone', async () => {
    const join = edit({ $push: { members: 'test-account' as AccountUuid } })
    const post = factory.createTxCreateDoc(messageClass, random, { attachedTo: random, attachedToClass: channelClass, collection: 'messages' })
    expect(await send(guest, [join, post], [storedChannel([])])).toEqual([join, post])
  })
})

describe('ApprovalGuardMiddleware resources', () => {
  const addRoom = factory.createTxCreateDoc(RESOURCE_CLASS, core.space.Model, { name: 'Phòng họp lớn', type: 'room', capacity: 12, needsApproval: false, archived: false })
  const archiveRoom = factory.createTxUpdateDoc(RESOURCE_CLASS, core.space.Model, room, { archived: true })
  const redefineClass = factory.createTxUpdateDoc(core.class.Class, core.space.Model, RESOURCE_CLASS, { label: 'x' as IntlString })

  it('refuses a User or Guest adding, editing or redefining resources', async () => {
    for (const session of [user, guest]) {
      for (const tx of [addRoom, archiveRoom, redefineClass]) await expectRefused(send(session, [tx]), platform.status.Forbidden)
    }
  })

  it('lets a Maintainer or Owner manage them', async () => {
    for (const session of [maintainer, owner]) expect(await send(session, [addRoom, archiveRoom, redefineClass])).toHaveLength(3)
  })
})

describe('ApprovalGuardMiddleware bookings', () => {
  type StoredBooking = Doc & BookingEvent & { title?: string }
  const bookingClass = eventClass as Ref<Class<StoredBooking>>
  const seriesClass = recurringEventClass as Ref<Class<StoredBooking>>
  const calendarSpace = 'calendar:space:Calendar' as Ref<Space>
  const TZ = 'Asia/Ho_Chi_Minh'
  // Wall clock on Monday 5 Oct 2026 in Hanoi.
  const at = (hour: number, minute = 0): number => Date.UTC(2026, 9, 5, hour - 7, minute)
  const taken = 'test:event:taken' as Ref<StoredBooking>
  const mine = 'test:event:mine' as Ref<StoredBooking>

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1))
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function bookingData (fields: Partial<Data<StoredBooking>>): Data<StoredBooking> {
    return {
      eventId: 'new',
      date: at(9),
      dueDate: at(10),
      allDay: false,
      access: 'owner',
      timeZone: TZ,
      servoneResource: room,
      servoneBookingState: 'confirmed',
      ...fields
    }
  }
  const book = (fields: Partial<Data<StoredBooking>> = {}, _class = bookingClass): TxCreateDoc<StoredBooking> =>
    factory.createTxCreateDoc(_class, calendarSpace, bookingData(fields))
  const storedBooking = (_id: Ref<StoredBooking>, fields: Partial<Data<StoredBooking>>, _class = bookingClass): StoredBooking =>
    TxProcessor.createDoc2Doc(factory.createTxCreateDoc(_class, calendarSpace, bookingData({ eventId: _id, ...fields }), _id))
  const edit = (_id: Ref<StoredBooking>, operations: DocumentUpdate<StoredBooking>): Tx =>
    factory.createTxUpdateDoc(bookingClass, calendarSpace, _id, operations)
  const roomTaken = storedBooking(taken, { date: at(9), dueDate: at(10) })

  async function expectClash (promise: Promise<unknown>, starts: number[]): Promise<void> {
    await expect(promise).rejects.toMatchObject({ status: { code: BOOKING_CLASH, params: { starts } } })
  }

  it('books a free slot', async () => {
    const tx = book({ date: at(10), dueDate: at(11) })
    expect(await send(user, [tx], [roomTaken])).toEqual([tx])
  })

  it('refuses an overlap with a confirmed or pending booking, from anyone but the approvals service', async () => {
    const tx = book({ date: at(9, 30), dueDate: at(10, 30) })
    for (const session of [user, maintainer]) await expectClash(send(session, [tx], [roomTaken]), [at(9, 30)])
    const pendingCar = storedBooking(taken, { servoneResource: car, servoneBookingState: 'pending' })
    await expectClash(send(user, [book({ servoneResource: car, servoneBookingState: 'pending' })], [pendingCar]), [at(9)])
    expect(await send(engine, [tx], [roomTaken])).toEqual([tx])
  })

  it('ignores rejected, expired and cancelled bookings and guest copies', async () => {
    const freed = ['rejected', 'expired', 'cancelled'].map((state, i) =>
      storedBooking(`test:event:${i}` as Ref<StoredBooking>, { servoneBookingState: state })
    )
    const guestCopy = storedBooking('test:event:copy' as Ref<StoredBooking>, { access: 'reader' })
    expect(await send(user, [book()], [...freed, guestCopy])).toHaveLength(1)
  })

  it('refuses a weekly booking whole and names the clashing date', async () => {
    const lastWeek = storedBooking(taken, { date: at(9) + 14 * 24 * 3600 * 1000, dueDate: at(10) + 14 * 24 * 3600 * 1000 })
    const weekly = book({ eventId: 'weekly', rules: [{ freq: 'WEEKLY', byDay: ['MO'] }], exdate: [], rdate: [] }, seriesClass)
    await expectClash(send(user, [weekly], [lastWeek]), [at(9) + 14 * 24 * 3600 * 1000])
  })

  it('refuses two bookings of one slot in the same batch', async () => {
    const apply = factory.createTxApplyIf(core.space.Tx, 'scope', [], [], [book({ eventId: 'a' }), book({ eventId: 'b' })], 'test', true)
    await expectClash(send(user, [apply]), [at(9)])
  })

  it('lets only one of two simultaneous bookings of a slot win', async () => {
    const stored: Doc[] = []
    const guard = await guardOver(stored, async (sent) => {
      // Stays in flight past the other session's check, as a slow database write would.
      await new Promise((resolve) => setTimeout(resolve, 20))
      for (const tx of sent) stored.push(TxProcessor.createDoc2Doc(tx as TxCreateDoc<StoredBooking>))
    })
    const results = await Promise.allSettled([guard.tx(contextFor(user), [book({ eventId: 'a' })]), guard.tx(contextFor(user), [book({ eventId: 'b' })])])
    expect(results.map((it) => it.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(stored).toHaveLength(1)
  })

  it('refuses archived, unknown, all-day, unsupported-rule and too-far bookings', async () => {
    for (const fields of [
      { servoneResource: oldRoom },
      { servoneResource: 'test:resource:none' },
      { allDay: true },
      { rules: [{ freq: 'MONTHLY', bySetPos: [1] }] },
      { date: at(9) + 100 * 24 * 3600 * 1000, dueDate: at(10) + 100 * 24 * 3600 * 1000 }
    ]) {
      await expectRefused(send(user, [book(fields)]), platform.status.Forbidden)
    }
  })

  it('starts a booking confirmed, or pending when the resource needs approval', async () => {
    await expectRefused(send(user, [book({ servoneBookingState: 'pending' })]), platform.status.Forbidden)
    await expectRefused(send(user, [book({ servoneResource: car })]), platform.status.Forbidden)
    await expectRefused(send(user, [book({ servoneBookingState: undefined })]), platform.status.Forbidden)
    expect(await send(user, [book({ servoneResource: car, servoneBookingState: 'pending' })])).toHaveLength(1)
    expect(await send(maintainer, [book({ servoneResource: car })])).toHaveLength(1)
  })

  it('leaves state changes to the approvals service and a Maintainer, except cancelling', async () => {
    const pendingCar = storedBooking(mine, { servoneResource: car, servoneBookingState: 'pending' })
    for (const state of ['confirmed', 'rejected', 'expired']) {
      await expectRefused(send(user, [edit(mine, { servoneBookingState: state })], [pendingCar]), platform.status.Forbidden)
      expect(await send(engine, [edit(mine, { servoneBookingState: state })], [pendingCar])).toHaveLength(1)
      expect(await send(maintainer, [edit(mine, { servoneBookingState: state })], [pendingCar])).toHaveLength(1)
    }
    expect(await send(user, [edit(mine, { servoneBookingState: 'cancelled' })], [pendingCar])).toHaveLength(1)
    await expectRefused(send(user, [edit(mine, { servoneBookingState: 'approved' })], [pendingCar]), platform.status.Forbidden)
  })

  it('re-checks a move, and a confirmed booking that needs approval goes back to pending', async () => {
    const own = storedBooking(mine, { date: at(11), dueDate: at(12) })
    await expectClash(send(user, [edit(mine, { date: at(9, 30), dueDate: at(10, 30) })], [roomTaken, own]), [at(9, 30)])
    expect(await send(user, [edit(mine, { date: at(11, 30), dueDate: at(12, 30) })], [roomTaken, own])).toHaveLength(1)
    const confirmedCar = storedBooking(mine, { servoneResource: car, date: at(11), dueDate: at(12) })
    await expectRefused(send(user, [edit(mine, { date: at(13) })], [confirmedCar]), platform.status.Forbidden)
    expect(await send(user, [edit(mine, { date: at(13), dueDate: at(14), servoneBookingState: 'pending' })], [confirmedCar])).toHaveLength(1)
  })

  it('re-checks a switch to another resource', async () => {
    const onCar = storedBooking(mine, { servoneResource: car, servoneBookingState: 'pending' })
    await expectClash(send(user, [edit(mine, { servoneResource: room, servoneBookingState: 'confirmed' })], [roomTaken, onCar]), [at(9)])
  })

  it('lets a booker shorten a confirmed series without new approval, and ignores unrelated edits', async () => {
    const series = storedBooking(mine, { servoneResource: car, rules: [{ freq: 'DAILY', count: 5 }], exdate: [], rdate: [] }, seriesClass)
    expect(await send(user, [edit(mine, { rules: [{ freq: 'DAILY', count: 2 }] })], [series])).toHaveLength(1)
    expect(await send(user, [edit(mine, { $push: { exdate: at(9) + 24 * 3600 * 1000 } })], [series])).toHaveLength(1)
    expect(await send(user, [edit(mine, { title: 'Họp' })], [series])).toHaveLength(1)
  })

  it('treats an edited but unmoved occurrence as part of its approved series', async () => {
    const series = storedBooking(mine, { servoneResource: car, rules: [{ freq: 'DAILY', count: 5 }], exdate: [], rdate: [] }, seriesClass)
    const occurrence = (date: number): TxCreateDoc<StoredBooking> =>
      book({ eventId: 'one', recurringEventId: mine, originalStartTime: at(9), servoneResource: car, date, dueDate: date + 3600 * 1000 }, recurringInstanceClass as Ref<Class<StoredBooking>>)
    expect(await send(user, [occurrence(at(9))], [series])).toHaveLength(1)
    await expectRefused(send(user, [occurrence(at(15))], [series]), platform.status.Forbidden)
  })
})
