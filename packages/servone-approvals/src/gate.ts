import type { Person } from '@hcengineering/contact'
import type { Ref, Status } from '@hcengineering/core'
import type { StatusCode } from '@hcengineering/platform'
import type { ProjectType } from '@hcengineering/task'

export const APPROVAL_SERVICE_ID = 'servone-approvals'
export const STATUS_APPROVAL_ATTR = 'servoneApproval'
export const LEAVE_APPROVAL_ATTR = 'servoneApproval'
export const MIN_REASON_LENGTH = 10
// On hr.mixin.Staff; only the person themselves or a Maintainer may write them, or anyone could approve for a team.
export const STAND_IN_ATTRS = ['servoneStandIn', 'servoneStandInFrom', 'servoneStandInTo'] as const
// pods/server/src/rpc.ts repeats this code; keep them in sync.
export const WAITING_APPROVAL = 'servone:status:WaitingApproval' as StatusCode

export type ApproverRule =
  | { by: 'manager' }
  | { by: 'person', person: Ref<Person> }
  | { by: 'field', attribute: string }
export type ApprovalActionName = 'hr.leave' | 'task.status' | 'cal.booking'
export type LeaveApproval = 'pending' | 'approved' | 'rejected' | 'withdrawn'

// A present but malformed marker reads as manager so the guard fails closed.
export function statusApproval (projectType: ProjectType, status: Ref<Status>): ApproverRule | undefined {
  for (const entry of projectType.statuses) {
    if (entry._id !== status || !(STATUS_APPROVAL_ATTR in entry)) continue
    const marker = entry[STATUS_APPROVAL_ATTR]
    if (marker === undefined || marker === null) continue
    if (typeof marker === 'object' && 'by' in marker) {
      if (marker.by === 'person' && 'person' in marker && typeof marker.person === 'string') {
        return { by: 'person', person: marker.person as Ref<Person> }
      }
      if (marker.by === 'field' && 'attribute' in marker && typeof marker.attribute === 'string') {
        return { by: 'field', attribute: marker.attribute }
      }
    }
    return { by: 'manager' }
  }
  return undefined
}

// A current status that is Canceled or outside the order sits before every gate, so cancel-then-reopen can't skip one.
export function gateRefusal (
  order: Array<Ref<Status>>,
  gates: Set<Ref<Status>>,
  from: Ref<Status> | undefined,
  to: Ref<Status>,
  isCanceled: (status: Ref<Status>) => boolean
): boolean {
  if (isCanceled(to) || from === to) return false
  if (from !== undefined && gates.has(from)) return true
  const fromIndex = from === undefined || isCanceled(from) ? -1 : order.indexOf(from)
  const toIndex = order.indexOf(to)
  const end = toIndex === -1 ? order.length : toIndex
  return order.slice(fromIndex + 1, end).some((status) => gates.has(status))
}
