import type { Person } from '@hcengineering/contact'
import core, { type PersonId, type Ref } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { MIN_REASON_LENGTH } from '@servone/approvals/src/gate'
import type { ResourceType } from '@servone/approvals/src/booking'
import { serviceRequest } from '../chunter-resources/webhooks/api'
import { str } from './strings'

const ACTIVE = 'Active' // RequestStatus.Active
const COMPLETED = 'Completed' // RequestStatus.Completed
const REJECTED = 'Rejected' // RequestStatus.Rejected

export interface DecidableRequest {
  status: string
  requested: Array<Ref<Person>>
  createdBy?: PersonId
}

export interface ApprovalButtons {
  canDecide: boolean
  canWithdraw: boolean
}

export function approvalButtons (request: DecidableRequest, me: Ref<Person>, mySocialIds: PersonId[]): ApprovalButtons {
  if (request.status !== ACTIVE) return { canDecide: false, canWithdraw: false }
  const isSubmitter = request.createdBy !== undefined && mySocialIds.includes(request.createdBy)
  return { canDecide: request.requested.includes(me) && !isSubmitter, canWithdraw: isSubmitter }
}

export function isReasonLongEnough (reason: string): boolean {
  return reason.trim().length >= MIN_REASON_LENGTH
}

export function decisionErrorLabel (code: string): IntlString {
  if (code === 'not_active') return str.ErrorDecided
  if (code === 'not_configured') return str.ErrorNotConfigured
  return str.ErrorUnknown
}

export type Decision = 'approve' | 'reject' | 'withdraw'

export async function decide (request: string, decision: Decision, reason = '', next?: Ref<Person>): Promise<void> {
  const body = decision === 'reject' ? { reason: reason.trim() } : { next }
  await serviceRequest('POST', `/v1/approvals/${encodeURIComponent(request)}/${decision}`, body)
}

export interface RequestMessage {
  action: string
  attributeUpdates?: { attrKey: string, set: string[] }
  createdBy?: PersonId
}

export interface ActivityLine {
  label: IntlString
  approver?: Ref<Person>
  reason?: string
}

export function activityLine (
  message: RequestMessage,
  request: Pick<DecidableRequest, 'requested'> & { status?: string, servoneReason?: string }
): ActivityLine | undefined {
  const rejected = { label: str.Rejected, reason: request.servoneReason }
  if (message.action === 'create') {
    if (request.requested.length > 0) return { label: str.ActivityRequested, approver: request.requested[0] }
    return request.status === COMPLETED ? { label: str.Approved, reason: request.servoneReason } : rejected
  }
  if (message.attributeUpdates?.attrKey !== 'status') return undefined
  const status = message.attributeUpdates.set[0]
  if (status === REJECTED) return rejected
  return { label: outcomeLabel(status, message.createdBy) }
}

export function outcomeLabel (status: string, closedBy: PersonId | undefined): IntlString {
  if (status === ACTIVE) return str.Waiting
  if (status === COMPLETED) return str.Approved
  if (status === REJECTED) return str.Rejected
  return closedBy === core.account.System ? str.Canceled : str.Withdrawn
}

export interface EndedRequest {
  status: string
  modifiedBy: PersonId
  approved: Array<Ref<Person>>
  rejected?: Ref<Person>
}

export function endedBy (request: EndedRequest, submitter: Ref<Person> | undefined): Ref<Person> | undefined {
  if (request.status === COMPLETED) return request.approved[0]
  if (request.status === REJECTED) return request.rejected
  return outcomeLabel(request.status, request.modifiedBy) === str.Withdrawn ? submitter : undefined
}

export function awaitingApprovers (waiting: Array<{ attachedTo: string, requested: Array<Ref<Person>> }>): Map<string, Ref<Person>> {
  return new Map(waiting.map((request) => [request.attachedTo, request.requested[0]]))
}

const BOOKING_KIND: Record<ResourceType, IntlString> = {
  room: str.BookingRoom,
  car: str.BookingCar,
  equipment: str.BookingEquipment,
  other: str.BookingOther
}

export function bookingKindLabel (type: ResourceType | undefined): IntlString {
  return type === undefined ? str.BookingOther : BOOKING_KIND[type]
}
