import type { RestClient } from '@hcengineering/api-client'
import calendar, { AccessLevel, type Event, type ReccuringInstance } from '@hcengineering/calendar'
import contact, { type Employee, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type AttachedDoc,
  type Class,
  type Doc,
  type DocumentUpdate,
  type PersonId,
  type Ref,
  SortingOrder,
  type Status,
  type Tx,
  type TxApplyResult,
  type TxCreateDoc,
  type TxCUD,
  TxFactory,
  type TxUpdateDoc
} from '@hcengineering/core'
import hr, { type Department, type Request as Leave, type Staff } from '@hcengineering/hr'
import request, { type Request, RequestStatus } from '@hcengineering/request'
import task, { type Task } from '@hcengineering/task'
import {
  type ApprovalActionName,
  type ApproverRule,
  type BookableResource,
  BOOKING_RESOURCE_ATTR,
  BOOKING_STATE_ATTR,
  type BookingState,
  LEAVE_APPROVAL_ATTR,
  type LeaveApproval,
  MIN_REASON_LENGTH,
  RESOURCE_CLASS,
  statusApproval
} from '@servone/approvals'
import {
  adminRoute,
  type ApprovalRoute,
  HEAD_DEPARTMENT,
  isLeaveOn,
  isTopOfChart,
  routeApproval,
  type RouteInput,
  type RouteKind,
  type StandIn,
  withStandIn
} from '@servone/notify-rules'

// Admins live in the account service, not the workspace, so they come in beside the REST client; Owners first.
export type ApprovalClient = Pick<RestClient, 'findAll' | 'findOne' | 'tx'> & { workspaceAdmins: () => Promise<AccountUuid[]> }

export interface ApprovalRequest extends Request {
  servoneAction: ApprovalActionName
  servoneGate?: Ref<Status>
  servoneReturnTo?: Ref<Status>
  servoneReason?: string
  servoneRoute?: RouteKind
  // A Person for the stand-in and head-on-leave kinds, a Department for no_head.
  servoneRouteFor?: string
  // The resource a cal.booking request was routed for; a different one on the event means a new approver.
  servoneResource?: string
}

interface ApprovalLeave extends Leave {
  [LEAVE_APPROVAL_ATTR]?: LeaveApproval
}

interface BookingCopy extends Event, Partial<Pick<ReccuringInstance, 'recurringEventId' | 'isCancelled'>> {
  [BOOKING_RESOURCE_ATTR]?: string
  [BOOKING_STATE_ATTR]?: BookingState
}

export type Decision = 'approve' | 'reject' | 'withdraw'
export type DecisionRefusal = 'not_found' | 'not_active' | 'not_approver' | 'not_submitter' | 'reason_too_short' | 'bad_next'
type Outcome = Exclude<LeaveApproval, 'pending'>
type Target = Pick<ApprovalRequest, 'attachedTo' | 'space' | 'servoneAction' | 'servoneGate' | 'servoneReturnTo' | 'servoneResource'>
type Parent = Pick<ApprovalRequest, 'attachedTo' | 'attachedToClass' | 'space'>

// Stored as data, so it reads the same whatever the viewer's language.
export const NO_APPROVER_REASON = 'Không tìm thấy người duyệt / No approver found'
export const AUTO_APPROVED_REASON = 'Tự duyệt: người đứng đầu sơ đồ tổ chức / Auto-approved: top of the org chart'
export const EXPIRED_REASON = 'Hết hạn: chưa được duyệt trước giờ bắt đầu / Expired: not approved before the start time'

// Class<T> never uses T, so the stock refs type the custom fields without a cast.
export const approvalRequestClass: Ref<Class<ApprovalRequest>> = request.class.Request
const leaveClass: Ref<Class<ApprovalLeave>> = hr.class.Request
const eventClass: Ref<Class<BookingCopy>> = calendar.class.Event
const EVENT_CLASSES: Array<Ref<Class<Doc>>> = [calendar.class.Event, calendar.class.ReccuringEvent, calendar.class.ReccuringInstance]
const BOOKING_OUTCOME: Record<Outcome, BookingState> = { approved: 'confirmed', rejected: 'rejected', withdrawn: 'cancelled' }

const txFactory = new TxFactory(core.account.System)
const OUTCOMES: Record<Decision, Outcome> = { approve: 'approved', reject: 'rejected', withdraw: 'withdrawn' }

// The stock OnRequest trigger adds a request tx to the item's activity only when it is filed under the item.
function underItem (parent: Parent, tx: TxCUD<ApprovalRequest>): TxCUD<ApprovalRequest> {
  return txFactory.createTxCollectionCUD(parent.attachedToClass, parent.attachedTo, parent.space, 'requests', tx, tx.modifiedOn, tx.modifiedBy)
}

async function socialIdOf (client: ApprovalClient, person: Ref<Person>): Promise<PersonId | undefined> {
  return (await client.findOne(contact.class.SocialIdentity, { attachedTo: person }))?._id
}

async function personOf (client: ApprovalClient, social: PersonId): Promise<Ref<Person> | undefined> {
  return (await client.findOne(contact.class.SocialIdentity, { _id: social as SocialIdentityRef }))?.attachedTo
}

// Lịch's stand-in setting clears them to null.
interface RoutingStaff extends Staff {
  servoneStandIn?: Ref<Person> | null
  servoneStandInFrom?: number | null
  servoneStandInTo?: number | null
}

function staffOf (employee: Employee): Partial<RoutingStaff> | undefined {
  return Reflect.get(employee, hr.mixin.Staff)
}

function standInOf (staff: Partial<RoutingStaff> | undefined): StandIn<Ref<Person>> | undefined {
  const person = staff?.servoneStandIn
  if (person === undefined || person === null) return undefined
  return { person, from: staff?.servoneStandInFrom ?? undefined, to: staff?.servoneStandInTo ?? undefined }
}

type Routing = RouteInput<Ref<Department>, Ref<Person>>

// ponytail: reads every approved leave in the workspace; filter by date in the query if leave history grows large.
async function routingFor (client: ApprovalClient, submitter: Ref<Person>): Promise<Routing> {
  const employees = await client.findAll(contact.mixin.Employee, { active: true })
  const employee = employees.find((candidate) => candidate._id === submitter)
  const leaves = await client.findAll(leaveClass, { [LEAVE_APPROVAL_ATTR]: 'approved' })
  const now = Date.now()
  const admins = await client.workspaceAdmins()
  return {
    submitter,
    department: (employee === undefined ? undefined : staffOf(employee)?.department) ?? (HEAD_DEPARTMENT as Ref<Department>),
    departments: await client.findAll(hr.class.Department, {}),
    active: new Set(employees.map((candidate) => candidate._id)),
    onLeave: new Set(leaves.filter((leave) => isLeaveOn(leave, now)).map((leave) => leave.attachedTo)),
    standIns: new Map(employees.flatMap((candidate) => {
      const standIn = standInOf(staffOf(candidate))
      return standIn === undefined ? [] : [[candidate._id, standIn] as const]
    })),
    admins: admins.flatMap((account) => employees.filter((candidate) => candidate.personUuid === account).map((candidate) => candidate._id)),
    now
  }
}

async function isTop (client: ApprovalClient, person: Ref<Person>): Promise<boolean> {
  const employees = await client.findAll(contact.mixin.Employee, { active: true })
  const departments = await client.findAll(hr.class.Department, {})
  return isTopOfChart(person, departments, new Set(employees.map((employee) => employee._id)))
}

async function routeOf (client: ApprovalClient, rule: ApproverRule, submitter: Ref<Person>, item: Task): Promise<ApprovalRoute<Ref<Department>, Ref<Person>> | undefined> {
  const routing = await routingFor(client, submitter)
  if (rule.by === 'manager') return routeApproval(routing)
  const approver: Ref<Person> | undefined = rule.by === 'person' ? rule.person : Reflect.get(item, rule.attribute)
  if (approver === undefined || !routing.active.has(approver) || approver === submitter) return adminRoute(routing)
  return withStandIn(approver, routing)
}

async function hasActiveRequest (client: ApprovalClient, item: Ref<Doc>, gate?: Ref<Status>): Promise<boolean> {
  const active = await client.findAll(approvalRequestClass, { attachedTo: item, status: RequestStatus.Active })
  return active.some((candidate) => candidate.servoneGate === gate)
}

async function isCanceled (client: ApprovalClient, status: Ref<Status>): Promise<boolean> {
  return (await client.findOne(core.class.Status, { _id: status }))?.category === task.statusCategory.Lost
}

async function nextStatus (client: ApprovalClient, order: Array<Ref<Status>>, gate: Ref<Status>): Promise<Ref<Status> | undefined> {
  for (const status of order.slice(order.indexOf(gate) + 1)) {
    if (!(await isCanceled(client, status))) return status
  }
  return undefined
}

// Older workspaces wrap attached-doc txes in a collection tx, as issue-dates/history.ts handles.
type StoredTx = TxCUD<Doc> & { tx?: TxCUD<Doc> }

function statusSet (tx: TxCUD<Doc>): Ref<Status> | undefined {
  if (tx._class === core.class.TxCreateDoc) return (tx as TxCreateDoc<Task>).attributes.status
  if (tx._class === core.class.TxUpdateDoc) return (tx as TxUpdateDoc<Task>).operations.status
  return undefined
}

// The status held just before the latest entry into the gate; the one before it in order when history has none.
async function returnStatus (client: ApprovalClient, item: Task, order: Array<Ref<Status>>, gate: Ref<Status>): Promise<Ref<Status> | undefined> {
  const txes: StoredTx[] = await client.findAll(core.class.TxCUD, { objectId: item._id }, { sort: { modifiedOn: SortingOrder.Ascending } })
  let held: Ref<Status> | undefined
  let returnTo: Ref<Status> | undefined
  for (const stored of txes) {
    const status = statusSet(stored.tx ?? stored)
    if (status === undefined) continue
    if (status === gate && held !== undefined && held !== gate) returnTo = held
    held = status
  }
  return returnTo ?? order[order.indexOf(gate) - 1]
}

function bookingStateTx (event: BookingCopy, state: BookingState, by?: PersonId): TxCUD<Doc> {
  return txFactory.createTxUpdateDoc(event._class, event.space, event._id, { [BOOKING_STATE_ATTR]: state }, false, undefined, by)
}

// A pending series carries the instances Lịch split off it while pending (an edited occurrence), so they share its outcome.
async function bookingTxes (client: ApprovalClient, event: BookingCopy, state: BookingState, by: PersonId | undefined): Promise<Array<TxCUD<Doc>>> {
  if (event[BOOKING_STATE_ATTR] !== 'pending') return []
  const riders = await client.findAll(eventClass, {
    recurringEventId: event.eventId,
    access: AccessLevel.Owner,
    [BOOKING_RESOURCE_ATTR]: event[BOOKING_RESOURCE_ATTR],
    [BOOKING_STATE_ATTR]: 'pending'
  })
  return [event, ...riders].map((copy) => bookingStateTx(copy, state, by))
}

interface Handover {
  attribute: string
  person: Ref<Person>
}

async function fieldGateAfter (client: ApprovalClient, target: Target): Promise<string | undefined> {
  if (target.servoneGate === undefined) return undefined
  const item = await client.findOne(task.class.Task, { _id: target.attachedTo as Ref<Task> })
  const taskType = item === undefined ? undefined : await client.findOne(task.class.TaskType, { _id: item.kind })
  const projectType = taskType === undefined ? undefined : await client.findOne(task.class.ProjectType, { _id: taskType.parent })
  if (taskType === undefined || projectType === undefined) return undefined
  const next = await nextStatus(client, taskType.statuses, target.servoneGate)
  const rule = next === undefined ? undefined : statusApproval(projectType, next)
  return rule?.by === 'field' ? rule.attribute : undefined
}

async function actionTxes (
  client: ApprovalClient,
  target: Target,
  outcome: Outcome,
  by: PersonId | undefined,
  handover?: Handover
): Promise<Array<TxCUD<Doc>>> {
  if (target.servoneAction === 'hr.leave') {
    const leave = target.attachedTo as Ref<ApprovalLeave>
    return [txFactory.createTxUpdateDoc(leaveClass, target.space, leave, { [LEAVE_APPROVAL_ATTR]: outcome }, false, undefined, by)]
  }
  if (target.servoneAction === 'cal.booking') {
    const event = await client.findOne(eventClass, { _id: target.attachedTo as Ref<BookingCopy> })
    return event === undefined ? [] : await bookingTxes(client, event, BOOKING_OUTCOME[outcome], by)
  }
  const item = await client.findOne(task.class.Task, { _id: target.attachedTo as Ref<Task> })
  if (item === undefined || target.servoneGate === undefined) return []
  const order = (await client.findOne(task.class.TaskType, { _id: item.kind }))?.statuses ?? []
  const status = outcome === 'approved' ? await nextStatus(client, order, target.servoneGate) : target.servoneReturnTo
  if (status === undefined) return []
  const update: DocumentUpdate<Task> = { status }
  if (outcome === 'approved' && handover !== undefined) Object.assign(update, { [handover.attribute]: handover.person })
  return [txFactory.createTxUpdateDoc(item._class, item.space, item._id, update, false, undefined, by)]
}

interface Submission {
  item: Doc
  target: Target
  route: ApprovalRoute<Ref<Department>, Ref<Person>> | undefined
  by: PersonId | undefined
  planned: Tx
  withoutApprover: 'approved' | 'rejected'
}

// No approver closes the request at once, as history shows, so the item never sits in a gate forever.
async function submit (client: ApprovalClient, submission: Submission): Promise<boolean> {
  const { item, target, route, by, withoutApprover } = submission
  const approver = route?.approver
  const hasApprover = approver !== undefined
  const closed = withoutApprover === 'approved' ? RequestStatus.Completed : RequestStatus.Rejected
  const fields: Omit<ApprovalRequest, keyof AttachedDoc> = {
    servoneAction: target.servoneAction,
    servoneGate: target.servoneGate,
    servoneReturnTo: target.servoneReturnTo,
    requested: hasApprover ? [approver] : [],
    approved: [],
    requiredApprovesCount: 1,
    status: hasApprover ? RequestStatus.Active : closed,
    tx: submission.planned
  }
  if (route?.kind !== undefined) {
    fields.servoneRoute = route.kind
    fields.servoneRouteFor = route.for
  }
  if (target.servoneResource !== undefined) fields.servoneResource = target.servoneResource
  if (!hasApprover) fields.servoneReason = withoutApprover === 'approved' ? AUTO_APPROVED_REASON : NO_APPROVER_REASON
  const attached = { attachedTo: item._id, attachedToClass: item._class, collection: 'requests' }
  await client.tx(
    underItem({ ...attached, space: item.space }, txFactory.createTxCreateDoc(approvalRequestClass, item.space, { ...fields, ...attached }, undefined, undefined, by))
  )
  const closing = hasApprover ? [] : await actionTxes(client, target, withoutApprover, by)
  for (const tx of closing) await client.tx(tx)
  return hasApprover
}

async function submitLeave (client: ApprovalClient, id: Ref<ApprovalLeave>): Promise<void> {
  const leave = await client.findOne(leaveClass, { _id: id })
  if (leave === undefined || leave[LEAVE_APPROVAL_ATTR] !== undefined) return
  if (await hasActiveRequest(client, leave._id)) return
  const submitter = leave.attachedTo
  const by = await socialIdOf(client, submitter)
  const route = routeApproval(await routingFor(client, submitter))
  const isActive = await submit(client, {
    item: leave,
    target: { attachedTo: leave._id, space: leave.space, servoneAction: 'hr.leave' },
    route,
    by,
    planned: txFactory.createTxUpdateDoc(leaveClass, leave.space, leave._id, { [LEAVE_APPROVAL_ATTR]: 'approved' }),
    // The top of the chart has nobody to ask by design; any other gap is a broken chart and stays a reject.
    withoutApprover: route === undefined && (await isTop(client, submitter)) ? 'approved' : 'rejected'
  })
  if (isActive) {
    await client.tx(txFactory.createTxUpdateDoc(leaveClass, leave.space, leave._id, { [LEAVE_APPROVAL_ATTR]: 'pending' }, false, undefined, by))
  }
}

// Private projects hide their items from non-members, and the approver has to open the item to decide.
async function admitToProject (client: ApprovalClient, item: Task, approver: Ref<Person>): Promise<void> {
  const project = await client.findOne(core.class.Space, { _id: item.space })
  const account = (await client.findOne(contact.mixin.Employee, { _id: approver as Ref<Employee> }))?.personUuid
  if (project === undefined || account === undefined || !project.private || project.members.includes(account)) return
  await client.tx(txFactory.createTxUpdateDoc(project._class, project.space, project._id, { members: [...project.members, account] }))
}

async function closeActive (client: ApprovalClient, item: Ref<Doc>): Promise<void> {
  const active = await client.findAll(approvalRequestClass, { attachedTo: item, status: RequestStatus.Active })
  for (const approval of active) {
    await client.tx(underItem(approval, txFactory.createTxUpdateDoc(approvalRequestClass, approval.space, approval._id, { status: RequestStatus.Cancelled })))
  }
}

async function bookingRoute (client: ApprovalClient, approver: Ref<Person> | undefined, submitter: Ref<Person>): Promise<ApprovalRoute<string, Ref<Person>> | undefined> {
  const routing = await routingFor(client, submitter)
  // Nobody approves their own booking: a booker who is the resource's approver goes up the chart instead.
  return approver === undefined || approver === submitter ? routeApproval(routing) : withStandIn(approver, routing)
}

async function ridesPendingSeries (client: ApprovalClient, event: BookingCopy): Promise<boolean> {
  if (event.recurringEventId === undefined) return false
  const series = await client.findAll(eventClass, { eventId: event.recurringEventId, access: AccessLevel.Owner })
  return series.some(
    (copy) => copy._id !== event._id && copy[BOOKING_RESOURCE_ATTR] === event[BOOKING_RESOURCE_ATTR] && copy[BOOKING_STATE_ATTR] === 'pending'
  )
}

// The booker is the organizer, whoever wrote the tx. A booking that left pending closes its request; a rebook
// to another resource replaces it, since the approver may differ.
async function onBooking (client: ApprovalClient, id: Ref<BookingCopy>): Promise<void> {
  const event = await client.findOne(eventClass, { _id: id })
  if (event === undefined || event.access !== AccessLevel.Owner) return
  const resourceId = event[BOOKING_RESOURCE_ATTR]
  if (resourceId === undefined || event[BOOKING_STATE_ATTR] !== 'pending' || event.isCancelled === true) {
    await closeActive(client, event._id)
    return
  }
  const active = await client.findAll(approvalRequestClass, { attachedTo: event._id, status: RequestStatus.Active })
  if (active.some((approval) => approval.servoneResource === resourceId)) return
  await closeActive(client, event._id)
  if (await ridesPendingSeries(client, event)) return
  const resource = await client.findOne(RESOURCE_CLASS, { _id: resourceId as Ref<BookableResource> })
  const by = event.user
  const submitter = await personOf(client, by)
  const route = submitter === undefined ? undefined : await bookingRoute(client, resource?.approver, submitter)
  await submit(client, {
    item: event,
    target: { attachedTo: event._id, space: event.space, servoneAction: 'cal.booking', servoneResource: resourceId },
    route,
    by,
    planned: bookingStateTx(event, 'confirmed'),
    withoutApprover: route === undefined && submitter !== undefined && (await isTop(client, submitter)) ? 'approved' : 'rejected'
  })
}

function touchesBooking (tx: TxCUD<Doc>): boolean {
  const attrs = [BOOKING_RESOURCE_ATTR, BOOKING_STATE_ATTR]
  if (tx._class === core.class.TxCreateDoc) return attrs.some((attr) => attr in (tx as TxCreateDoc<BookingCopy>).attributes)
  const { operations } = tx as TxUpdateDoc<BookingCopy>
  return attrs.some((attr) => attr in operations || attr in (operations.$unset ?? {}))
}

// A booking still pending at its start (a series' first occurrence) frees the slot; the Active match makes a repeat a no-op.
export async function expireBookings (client: ApprovalClient, now: number): Promise<void> {
  const due = await client.findAll(eventClass, { [BOOKING_STATE_ATTR]: 'pending', access: AccessLevel.Owner, date: { $lte: now } })
  for (const event of due) {
    const txes = await bookingTxes(client, event, 'expired', undefined)
    const active = await client.findAll(approvalRequestClass, { attachedTo: event._id, status: RequestStatus.Active })
    for (const approval of active) {
      txes.push(
        underItem(approval, txFactory.createTxUpdateDoc(approvalRequestClass, approval.space, approval._id, { status: RequestStatus.Cancelled })),
        txFactory.createTxUpdateDoc(approvalRequestClass, approval.space, approval._id, { servoneReason: EXPIRED_REASON })
      )
    }
    const stillPending = { _class: eventClass, query: { _id: event._id, [BOOKING_STATE_ATTR]: 'pending' } }
    await client.tx(txFactory.createTxApplyIf(core.space.Tx, undefined, [stillPending], [], txes, undefined, true))
  }
}

// The mover submits; a System move (an import, a template) is credited to the item's creator.
async function onStatus (client: ApprovalClient, id: Ref<Task>, mover: PersonId): Promise<void> {
  const item = await client.findOne(task.class.Task, { _id: id })
  if (item === undefined) return
  if (await isCanceled(client, item.status)) {
    await closeActive(client, item._id)
    return
  }
  const taskType = await client.findOne(task.class.TaskType, { _id: item.kind })
  const projectType = taskType === undefined ? undefined : await client.findOne(task.class.ProjectType, { _id: taskType.parent })
  const gate = item.status
  const rule = projectType === undefined ? undefined : statusApproval(projectType, gate)
  if (taskType === undefined || rule === undefined) return
  if (await hasActiveRequest(client, item._id, gate)) return
  const by = mover === core.account.System ? item.createdBy : mover
  const submitter = by === undefined ? undefined : await personOf(client, by)
  const route = submitter === undefined ? undefined : await routeOf(client, rule, submitter, item)
  const isActive = await submit(client, {
    item,
    target: {
      attachedTo: item._id,
      space: item.space,
      servoneAction: 'task.status',
      servoneGate: gate,
      servoneReturnTo: await returnStatus(client, item, taskType.statuses, gate)
    },
    route,
    by,
    planned: txFactory.createTxUpdateDoc(item._class, item.space, item._id, { status: await nextStatus(client, taskType.statuses, gate) }),
    withoutApprover: 'rejected'
  })
  if (isActive && route !== undefined) await admitToProject(client, item, route.approver)
}

// Reads the item's current state, not the tx's, so a redelivered or stale tx never submits twice.
export async function onTx (client: ApprovalClient, tx: Tx): Promise<void> {
  if (tx._class === core.class.TxRemoveDoc) {
    await closeActive(client, (tx as TxCUD<Doc>).objectId)
    return
  }
  if (tx._class !== core.class.TxCreateDoc && tx._class !== core.class.TxUpdateDoc) return
  const cud = tx as TxCUD<Doc>
  if (cud.objectClass === request.class.Request) return
  if (cud.objectClass === hr.class.Request) {
    if (cud._class === core.class.TxCreateDoc) await submitLeave(client, cud.objectId as Ref<ApprovalLeave>)
    return
  }
  if (EVENT_CLASSES.includes(cud.objectClass)) {
    if (touchesBooking(cud)) await onBooking(client, cud.objectId as Ref<BookingCopy>)
    return
  }
  if (statusSet(cud) !== undefined) await onStatus(client, cud.objectId as Ref<Task>, cud.modifiedBy)
}

const CLOSED: Record<Decision, RequestStatus> = { approve: RequestStatus.Completed, reject: RequestStatus.Rejected, withdraw: RequestStatus.Cancelled }

// Kept out of the status tx: activity makes one line per changed attribute, and the status line already names who and why.
function decisionRecord (decision: Decision, caller: Ref<Person>, reason: string): DocumentUpdate<ApprovalRequest> {
  if (decision === 'approve') return { approved: [caller], approvedDates: [Date.now()] }
  if (decision === 'reject') return { rejected: caller, servoneReason: reason.trim() }
  return {}
}

// The submitter is whoever the create carried as modifiedBy, so even an Owner who is approver of record can't self-approve.
export async function decide (
  client: ApprovalClient,
  account: AccountUuid,
  id: Ref<ApprovalRequest>,
  decision: Decision,
  reason: string,
  next?: Ref<Person>
): Promise<DecisionRefusal | undefined> {
  const approval = await client.findOne(approvalRequestClass, { _id: id })
  if (approval === undefined) return 'not_found'
  if (approval.status !== RequestStatus.Active) return 'not_active'
  const caller = await client.findOne(contact.mixin.Employee, { personUuid: account })
  if (caller === undefined) return decision === 'withdraw' ? 'not_submitter' : 'not_approver'
  const submitter = approval.createdBy === undefined ? undefined : await personOf(client, approval.createdBy)
  const isSubmitter = caller._id === submitter
  if (decision === 'withdraw' && !isSubmitter) return 'not_submitter'
  if (decision !== 'withdraw' && (isSubmitter || !approval.requested.includes(caller._id))) return 'not_approver'
  if (decision === 'reject' && reason.trim().length < MIN_REASON_LENGTH) return 'reason_too_short'
  let handover: Handover | undefined
  if (next !== undefined) {
    const attribute = decision === 'approve' ? await fieldGateAfter(client, approval) : undefined
    const isPickable = next !== caller._id && (await client.findOne(contact.mixin.Employee, { _id: next as Ref<Employee>, active: true })) !== undefined
    if (attribute === undefined || !isPickable) return 'bad_next'
    handover = { attribute, person: next }
  }
  const by = await socialIdOf(client, caller._id)
  const txes: Array<TxCUD<Doc>> = [
    underItem(approval, txFactory.createTxUpdateDoc(approvalRequestClass, approval.space, approval._id, { status: CLOSED[decision] }, false, undefined, by)),
    txFactory.createTxUpdateDoc(approvalRequestClass, approval.space, approval._id, decisionRecord(decision, caller._id, reason), false, undefined, by)
  ]
  txes.push(...(await actionTxes(client, approval, OUTCOMES[decision], by, handover)))
  // One apply: a request closed without its action would leave the item behind the guard with no way to retry.
  // The Active match turns a double click's second approve into not_active instead of a second move.
  const stillActive = { _class: approvalRequestClass, query: { _id: approval._id, status: RequestStatus.Active } }
  const applied: Partial<TxApplyResult> = await client.tx(
    txFactory.createTxApplyIf(core.space.Tx, undefined, [stillActive], [], txes, undefined, true, [], undefined, by)
  )
  if (applied.success !== true) return 'not_active'
  return undefined
}
