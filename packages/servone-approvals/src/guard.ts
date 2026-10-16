import core, {
  AccountRole,
  type DocumentUpdate,
  hasAccountRole,
  type Doc,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Class,
  type Space,
  type Status,
  type Tx,
  type TxApplyIf,
  type TxCreateDoc,
  type TxCUD,
  type TxMixin,
  TxProcessor,
  type TxUpdateDoc
} from '@hcengineering/core'
import contact, { type Person } from '@hcengineering/contact'
import hr from '@hcengineering/hr'
import platform, { PlatformError, Severity, Status as PlatformStatus, type StatusCode } from '@hcengineering/platform'
import request, { RequestStatus } from '@hcengineering/request'
import task, { type ProjectType, type Task, type TaskType } from '@hcengineering/task'
import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'

import {
  BOOKING_CLASH,
  BOOKING_RESOURCE_ATTR,
  BOOKING_STATE_ATTR,
  BOOKING_STATES,
  bookingWindow,
  findClashes,
  initialBookingState,
  isBeyondWindow,
  isShrink,
  isSupportedRule,
  RESOURCE_CLASS,
  type BookableResource,
  type BookingEvent
} from './booking'
import { APPROVAL_SERVICE_ID, gateRefusal, LEAVE_APPROVAL_ATTR, STAND_IN_ATTRS, statusApproval, WAITING_APPROVAL } from './gate'

// server/workspace-service mints this service id; its migrations run through this pipeline and must never be refused.
const WORKSPACE_SERVICE_ID = 'workspace'
const LOCKED_LEAVE_STATES = ['pending', 'approved']
// This package cannot depend on chunter, so the class id is a string.
const CHANNEL_CLASS = 'chunter:class:Channel' as Ref<Class<Space>>
// Mirrors the fields packages/servone-ui/src/plugins/chunter-resources locks to canManage; keep both in sync.
const MANAGED_CHANNEL_ATTRS = [
  'name',
  'description',
  'topic',
  'private',
  'owners',
  'archived',
  'autoJoin',
  'autoJoinForRoles',
  'servonePostPolicy',
  'servoneThreadReplies'
]

// This package cannot depend on calendar; ReccuringEvent and ReccuringInstance derive from it.
type StoredEvent = Doc & BookingEvent
const EVENT_CLASS = 'calendar:class:Event' as Ref<Class<StoredEvent>>
// Event fields whose change can make a booking hold time it did not hold before.
const BOOKING_FIELDS = [
  'date',
  'dueDate',
  'allDay',
  'rules',
  'exdate',
  'rdate',
  'isCancelled',
  'access',
  'recurringEventId',
  'originalStartTime',
  BOOKING_RESOURCE_ATTR,
  BOOKING_STATE_ATTR
]

function refuse (code: StatusCode, params: Record<string, number[]> = {}): never {
  throw new PlatformError(new PlatformStatus(Severity.ERROR, code, params))
}

function touchedAttrs<T extends Doc> (operations: DocumentUpdate<T>): string[] {
  return [operations, operations.$push, operations.$pull, operations.$unset].flatMap((ops) =>
    ops === undefined ? [] : Object.keys(ops)
  )
}

// Sits before MarkDerivedEntryMiddleware so trigger-derived txes (sent via context.derived) never reach it.
export class ApprovalGuardMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ApprovalGuardMiddleware(context, next)
  }

  // One guard per workspace pipeline, so this serializes every booking of a resource within this transactor.
  private readonly bookingLocks = new Map<string, Promise<void>>()

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const { service } = ctx.contextData
    if (service === APPROVAL_SERVICE_ID || service === WORKSPACE_SERVICE_ID) return await this.provideTx(ctx, txes)
    const bookings: StoredEvent[] = []
    for (const tx of txes) await this.judge(ctx, tx, bookings)
    if (bookings.length === 0) return await this.provideTx(ctx, txes)
    // The lock spans the clash check and the store, so a second booking of the same slot reads the first one.
    return await this.underBookingLocks(
      bookings.flatMap((booking) => booking.servoneResource ?? []),
      async () => {
        for (const [index, booking] of bookings.entries()) await this.judgeClash(ctx, booking, bookings.slice(0, index))
        return await this.provideTx(ctx, txes)
      }
    )
  }

  // At this pipeline position apply batches are still packed.
  private async judge (ctx: MeasureContext<SessionData>, tx: Tx, bookings: StoredEvent[]): Promise<void> {
    if (tx._class === core.class.TxApplyIf) {
      for (const inner of (tx as TxApplyIf).txes) await this.judge(ctx, inner, bookings)
      return
    }
    if (!TxProcessor.isExtendsCUD(tx._class)) return
    const cud = tx as TxCUD<Doc>
    const h = this.context.hierarchy
    if (h.isDerived(cud.objectClass, EVENT_CLASS)) await this.judgeBooking(ctx, cud, bookings)
    if (h.isDerived(cud.objectClass, request.class.Request)) refuse(WAITING_APPROVAL)
    if (h.isDerived(cud.objectClass, hr.class.Request)) await this.judgeLeave(ctx, cud)
    if (h.isDerived(cud.objectClass, hr.class.Request) && cud._class === core.class.TxRemoveDoc && !hasAccountRole(ctx.contextData.account, AccountRole.Maintainer)) {
      // Deleting an approved leave hands the days back to the allowance, so only an admin may.
      const [leave] = await this.findAll(ctx, cud.objectClass, { _id: cud.objectId }, { limit: 1 })
      if (leave !== undefined && LEAVE_APPROVAL_ATTR in leave && leave[LEAVE_APPROVAL_ATTR] === 'approved') refuse(platform.status.Forbidden)
    }
    if (h.isDerived(cud.objectClass, task.class.Task)) await this.judgeStatus(ctx, cud)
    if (hasAccountRole(ctx.contextData.account, AccountRole.Maintainer)) return
    if (cud.objectClass === RESOURCE_CLASS || cud.objectId === RESOURCE_CLASS) refuse(platform.status.Forbidden)
    if (this.isManagedChannelEdit(cud)) await this.judgeChannelEdit(ctx, cud as TxUpdateDoc<Space>)
    if (this.isOrgChartWrite(cud)) refuse(platform.status.Forbidden)
    if (this.isStandInWrite(cud) && !(await this.isOwnPerson(ctx, cud.objectId as Ref<Person>))) refuse(platform.status.Forbidden)
  }

  private isManagedChannelEdit (cud: TxCUD<Doc>): boolean {
    if (cud._class !== core.class.TxUpdateDoc || !this.context.hierarchy.isDerived(cud.objectClass, CHANNEL_CLASS)) return false
    return touchedAttrs((cud as TxUpdateDoc<Space>).operations).some((attr) => MANAGED_CHANNEL_ATTRS.includes(attr))
  }

  // Only the organizer's copy holds a resource; guest copies are trigger-derived and never reach this guard.
  private async judgeBooking (ctx: MeasureContext<SessionData>, cud: TxCUD<Doc>, bookings: StoredEvent[]): Promise<void> {
    let before: StoredEvent | undefined
    let after: StoredEvent
    if (cud._class === core.class.TxCreateDoc) {
      after = TxProcessor.createDoc2Doc(cud as TxCreateDoc<StoredEvent>)
      // Editing one occurrence creates an instance; judged against its series, an unmoved one takes no new time.
      if (after.recurringEventId !== undefined) {
        ;[before] = await this.findAll(ctx, EVENT_CLASS, { eventId: after.recurringEventId, access: 'owner' }, { limit: 1 })
      }
    } else if (cud._class === core.class.TxUpdateDoc) {
      const update = cud as TxUpdateDoc<StoredEvent>
      if (!touchedAttrs(update.operations).some((attr) => BOOKING_FIELDS.includes(attr))) return
      ;[before] = await this.findAll(ctx, EVENT_CLASS, { _id: update.objectId }, { limit: 1 })
      if (before === undefined) return
      after = TxProcessor.updateDoc2Doc(structuredClone(before), update)
    } else {
      return
    }
    const resourceId = after.servoneResource
    if (after.access !== 'owner' || resourceId === undefined) return
    const state = after.servoneBookingState
    if (state !== undefined && !BOOKING_STATES.some((known) => known === state)) refuse(platform.status.Forbidden)
    const isMaintainer = hasAccountRole(ctx.contextData.account, AccountRole.Maintainer)
    if (before !== undefined && isShrink(before, after, bookingWindow(after, Date.now()))) {
      // Freeing time needs no approval; besides that a booker may only cancel.
      if (!isMaintainer && state !== before.servoneBookingState && state !== 'cancelled') refuse(platform.status.Forbidden)
      return
    }
    const resource = this.bookableResource(resourceId)
    if (resource === undefined || resource.archived) refuse(platform.status.Forbidden)
    // All-day times are stored as UTC midnight, which would not compare with timed bookings.
    if (after.allDay || !isSupportedRule(after.rules, after.date, after.timeZone ?? 'UTC')) refuse(platform.status.Forbidden)
    // Clashes are only checked within the window, so a start past it could never be checked at all.
    if (isBeyondWindow(after.date, Date.now())) refuse(platform.status.Forbidden)
    if (!isMaintainer && state !== initialBookingState(resource)) refuse(platform.status.Forbidden)
    bookings.push(after)
  }

  private bookableResource (id: string): BookableResource | undefined {
    if (!this.context.hierarchy.hasClass(RESOURCE_CLASS)) return undefined
    return this.context.modelDb.findAllSync(RESOURCE_CLASS, { _id: id as Ref<BookableResource> })[0]
  }

  private async judgeClash (ctx: MeasureContext<SessionData>, candidate: StoredEvent, earlier: StoredEvent[]): Promise<void> {
    const held = await this.findAll(ctx, EVENT_CLASS, { [BOOKING_RESOURCE_ATTR]: candidate.servoneResource, access: 'owner' })
    const seriesIds = held.filter((e) => e.recurringEventId === undefined && (e.rules ?? []).length > 0).map((e) => e.eventId)
    // An instance without the resource still replaces its series occurrence, so instances are read by series.
    const instances = seriesIds.length === 0 ? [] : await this.findAll(ctx, EVENT_CLASS, { recurringEventId: { $in: seriesIds }, access: 'owner' })
    const clashes = findClashes(candidate, [...held, ...instances, ...earlier], bookingWindow(candidate, Date.now()))
    if (clashes.length > 0) refuse(BOOKING_CLASH, { starts: clashes.map((clash) => clash.start) })
  }

  // Sorted keys, so two batches over the same resources cannot wait on each other in a cycle.
  private async underBookingLocks<T> (resources: string[], run: () => Promise<T>): Promise<T> {
    const releases: Array<() => void> = []
    try {
      for (const key of [...new Set(resources)].sort()) {
        const previous = this.bookingLocks.get(key) ?? Promise.resolve()
        let release = (): void => {}
        const held = new Promise<void>((resolve) => { release = resolve })
        const tail = previous.then(async () => { await held })
        this.bookingLocks.set(key, tail)
        releases.push(() => {
          release()
          if (this.bookingLocks.get(key) === tail) this.bookingLocks.delete(key)
        })
        await previous
      }
      return await run()
    } finally {
      for (const release of releases) release()
    }
  }

  // Same rule as canEditChannel and canSetOwners in servone-ui announce/policy.ts, for a non-Maintainer.
  private async judgeChannelEdit (ctx: MeasureContext<SessionData>, update: TxUpdateDoc<Space>): Promise<void> {
    const [channel] = await this.findAll(ctx, update.objectClass, { _id: update.objectId }, { limit: 1 })
    if (channel === undefined || !(channel.owners ?? []).includes(ctx.contextData.account.uuid)) refuse(platform.status.Forbidden)
    if (update.operations.owners?.length === 0) refuse(platform.status.Forbidden)
  }

  private isStandInWrite (cud: TxCUD<Doc>): boolean {
    if (cud._class !== core.class.TxMixin) return false
    const mixinTx = cud as TxMixin<Doc, Doc>
    return mixinTx.mixin === hr.mixin.Staff && STAND_IN_ATTRS.some((attr) => attr in mixinTx.attributes)
  }

  private async isOwnPerson (ctx: MeasureContext<SessionData>, person: Ref<Person>): Promise<boolean> {
    const [found] = await this.findAll(ctx, contact.class.Person, { _id: person }, { limit: 1 })
    return found?.personUuid !== undefined && found.personUuid === ctx.contextData.account.uuid
  }

  private isOrgChartWrite (cud: TxCUD<Doc>): boolean {
    if (this.context.hierarchy.isDerived(cud.objectClass, hr.class.Department)) return true
    if (cud._class !== core.class.TxMixin) return false
    const mixinTx = cud as TxMixin<Doc, Doc>
    return mixinTx.mixin === hr.mixin.Staff && 'department' in mixinTx.attributes
  }

  private async judgeLeave (ctx: MeasureContext<SessionData>, cud: TxCUD<Doc>): Promise<void> {
    if (cud._class === core.class.TxCreateDoc) {
      if (LEAVE_APPROVAL_ATTR in (cud as TxCreateDoc<Doc>).attributes) refuse(WAITING_APPROVAL)
      return
    }
    if (cud._class !== core.class.TxUpdateDoc) return
    if (LEAVE_APPROVAL_ATTR in (cud as TxUpdateDoc<Doc>).operations) refuse(WAITING_APPROVAL)
    const [leave] = await this.findAll(ctx, cud.objectClass, { _id: cud.objectId }, { limit: 1 })
    if (
      leave !== undefined &&
      LEAVE_APPROVAL_ATTR in leave &&
      LOCKED_LEAVE_STATES.includes(String(leave[LEAVE_APPROVAL_ATTR]))
    ) {
      refuse(WAITING_APPROVAL)
    }
  }

  private async judgeStatus (ctx: MeasureContext<SessionData>, cud: TxCUD<Doc>): Promise<void> {
    if (cud._class === core.class.TxCreateDoc) {
      const created = (cud as TxCreateDoc<Task>).attributes
      this.judgeMove(created.kind, undefined, created.status)
      return
    }
    if (cud._class !== core.class.TxUpdateDoc) return
    const update = cud as TxUpdateDoc<Task>
    const { operations } = update
    if (operations.status === undefined && operations.space === undefined && operations.kind === undefined) return
    const [item] = await this.findAll(ctx, update.objectClass, { _id: update.objectId }, { limit: 1 })
    if (item === undefined) return
    const to = operations.status ?? item.status
    if (this.isCanceled(to)) return
    const active = await this.findAll(
      ctx,
      request.class.Request,
      { attachedTo: item._id, status: RequestStatus.Active },
      { limit: 1 }
    )
    if (active.length > 0) refuse(WAITING_APPROVAL)
    // Moving to another project or task type is judged like a create there, so Incident -> Change can't skip its gate.
    const isProjectMove = operations.space !== undefined && operations.space !== item.space
    const isKindChange = operations.kind !== undefined && operations.kind !== item.kind
    this.judgeMove(operations.kind ?? item.kind, isProjectMove || isKindChange ? undefined : item.status, to)
  }

  private judgeMove (kind: Ref<TaskType>, from: Ref<Status> | undefined, to: Ref<Status>): void {
    const model = this.context.modelDb
    const taskType = model.findObject(kind)
    const projectType = taskType === undefined ? undefined : model.findObject<ProjectType>(taskType.parent)
    if (taskType === undefined || projectType === undefined) return
    const gates = new Set(taskType.statuses.filter((status) => statusApproval(projectType, status) !== undefined))
    if (gateRefusal(taskType.statuses, gates, from, to, (status) => this.isCanceled(status))) refuse(WAITING_APPROVAL)
  }

  private isCanceled (status: Ref<Status>): boolean {
    return this.context.modelDb.findObject(status)?.category === task.statusCategory.Lost
  }
}
