import type { Person } from '@hcengineering/contact'
import type { PersonId, Ref } from '@hcengineering/core'
import core from '@hcengineering/core'
import { activityLine, approvalButtons, awaitingApprovers, bookingKindLabel, type DecidableRequest, decisionErrorLabel, endedBy, isReasonLongEnough, outcomeLabel } from '../approvals'
import { str } from '../strings'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))

const approver = 'person-approver' as Ref<Person>
const submitterSocialId = 'social-submitter' as PersonId

function pending (status = 'Active'): DecidableRequest {
  return { status, requested: [approver], createdBy: submitterSocialId }
}

describe('approval buttons', () => {
  it('lets the approver approve or reject a waiting request', () => {
    expect(approvalButtons(pending(), approver, ['social-approver' as PersonId])).toEqual({
      canDecide: true,
      canWithdraw: false
    })
  })

  it('lets the submitter only withdraw, even when listed as approver', () => {
    const selfApproved = { ...pending(), requested: [approver] }
    expect(approvalButtons(selfApproved, approver, [submitterSocialId])).toEqual({
      canDecide: false,
      canWithdraw: true
    })
  })

  it('shows nothing to anyone else, or once the request is decided', () => {
    const none = { canDecide: false, canWithdraw: false }
    expect(approvalButtons(pending(), 'person-other' as Ref<Person>, ['social-other' as PersonId])).toEqual(none)
    expect(approvalButtons(pending('Completed'), approver, ['social-approver' as PersonId])).toEqual(none)
    expect(approvalButtons(pending('Rejected'), approver, [submitterSocialId])).toEqual(none)
  })
})

describe('reject reason', () => {
  it('needs ten characters after trimming, as the service does', () => {
    expect(isReasonLongEnough('  123456789  ')).toBe(false)
    expect(isReasonLongEnough('1234567890')).toBe(true)
  })
})

describe('decision errors', () => {
  it('says so when someone else decided first, and asks to retry otherwise', () => {
    expect(decisionErrorLabel('not_active')).toBe('servone-approval:string:ErrorDecided')
    expect(decisionErrorLabel('not_approver')).toBe('servone-approval:string:ErrorUnknown')
  })

  it('says the approvals service is not set up when the front has no service URL', () => {
    expect(decisionErrorLabel('not_configured')).toBe('servone-approval:string:ErrorNotConfigured')
  })
})

describe('activity line', () => {
  const asked = { requested: [approver] }
  const statusSet = (status: string, createdBy = 'social-approver' as PersonId): Parameters<typeof activityLine>[0] =>
    ({ action: 'update', attributeUpdates: { attrKey: 'status', set: [status] }, createdBy })

  it('names the approver on submit, or the reason when nobody could approve', () => {
    expect(activityLine({ action: 'create' }, asked)).toEqual({ label: 'servone-approval:string:ActivityRequested', approver })
    expect(activityLine({ action: 'create' }, { requested: [], servoneReason: 'No approver found' })).toEqual({
      label: 'servone-approval:string:Rejected',
      reason: 'No approver found'
    })
  })

  it('says approved with the reason when the engine approves on submit', () => {
    const auto = { requested: [], status: 'Completed', servoneReason: 'Auto-approved: top of the org chart' }
    expect(activityLine({ action: 'create' }, auto)).toEqual({
      label: 'servone-approval:string:Approved',
      reason: 'Auto-approved: top of the org chart'
    })
  })

  it('says approved, rejected with the reason, withdrawn, or canceled by the system', () => {
    expect(activityLine(statusSet('Completed'), asked)).toEqual({ label: 'servone-approval:string:Approved' })
    expect(activityLine(statusSet('Rejected'), { ...asked, servoneReason: 'Thiếu báo giá' })).toEqual({
      label: 'servone-approval:string:Rejected',
      reason: 'Thiếu báo giá'
    })
    expect(activityLine(statusSet('Cancelled', submitterSocialId), asked)).toEqual({ label: 'servone-approval:string:Withdrawn' })
    expect(activityLine(statusSet('Cancelled', core.account.System), asked)).toEqual({ label: 'servone-approval:string:Canceled' })
  })

  it('shows nothing for other request fields', () => {
    expect(activityLine({ action: 'update', attributeUpdates: { attrKey: 'approved', set: [approver] } }, asked)).toBeUndefined()
  })
})

describe('outcome label', () => {
  it('gives the block and the activity one word per outcome', () => {
    expect(outcomeLabel('Active', submitterSocialId)).toBe('servone-approval:string:Waiting')
    expect(outcomeLabel('Completed', 'social-approver' as PersonId)).toBe('servone-approval:string:Approved')
    expect(outcomeLabel('Rejected', 'social-approver' as PersonId)).toBe('servone-approval:string:Rejected')
    expect(outcomeLabel('Cancelled', submitterSocialId)).toBe('servone-approval:string:Withdrawn')
    expect(outcomeLabel('Cancelled', core.account.System)).toBe('servone-approval:string:Canceled')
  })
})

describe('ended by', () => {
  const submitter = 'person-submitter' as Ref<Person>
  const ended = (status: string, modifiedBy: PersonId): Parameters<typeof endedBy>[0] =>
    ({ status, modifiedBy, approved: [], rejected: undefined })

  it('credits the approver, the rejecter, or the submitter who withdrew', () => {
    expect(endedBy({ ...ended('Completed', 'social-approver' as PersonId), approved: [approver] }, submitter)).toBe(approver)
    expect(endedBy({ ...ended('Rejected', 'social-approver' as PersonId), rejected: approver }, submitter)).toBe(approver)
    expect(endedBy(ended('Cancelled', submitterSocialId), submitter)).toBe(submitter)
  })

  it('credits nobody for a system cancel or an auto-reject with no approver', () => {
    expect(endedBy(ended('Cancelled', core.account.System), submitter)).toBeUndefined()
    expect(endedBy(ended('Rejected', submitterSocialId), submitter)).toBeUndefined()
  })
})

describe('awaiting approvers', () => {
  it('maps each waiting item to the person who must decide', () => {
    const other = 'person-other' as Ref<Person>
    const waiting = [
      { attachedTo: 'item-1', requested: [approver] },
      { attachedTo: 'item-2', requested: [other] }
    ]
    expect(awaitingApprovers(waiting)).toEqual(new Map([['item-1', approver], ['item-2', other]]))
  })
})

describe('booking kind', () => {
  it('names the booking by resource type, generic until the resource is known', () => {
    expect(bookingKindLabel('room')).toBe(str.BookingRoom)
    expect(bookingKindLabel('car')).toBe(str.BookingCar)
    expect(bookingKindLabel('equipment')).toBe(str.BookingEquipment)
    expect(bookingKindLabel(undefined)).toBe(str.BookingOther)
  })
})
