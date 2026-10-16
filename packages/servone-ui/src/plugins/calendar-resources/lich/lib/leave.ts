import { AccountRole, type AccountUuid, type WorkspaceMemberInfo } from '@hcengineering/core'
import { isApprovedLeave, utcOf, type Leave as LeaveFields } from '../../../../lib/leave'
import type { Timed } from './types'

export interface Leave extends LeaveFields {
  _id: string
  attachedTo: string
}

export interface LeaveItem extends Timed {
  _id: string
  type: string
  color: string
}

export function leaveItems (leaves: Leave[], colorOf: (person: string) => string): LeaveItem[] {
  return leaves
    .filter(isApprovedLeave)
    .map((leave) => ({
      _id: leave._id,
      type: leave.type,
      color: colorOf(leave.attachedTo),
      allDay: true,
      date: utcOf(leave.tzDate),
      dueDate: Date.UTC(leave.tzDueDate.year, leave.tzDueDate.month, leave.tzDueDate.day, 23, 59, 59, 999)
    }))
}

export function shortNames (people: Array<{ first: string, last: string }>): string[] {
  const counts = new Map<string, number>()
  for (const { first } of people) counts.set(first, (counts.get(first) ?? 0) + 1)
  return people.map(({ first, last }) =>
    (counts.get(first) ?? 0) > 1 && last !== '' ? `${first} ${last.charAt(0).toLocaleUpperCase('vi')}.` : first
  )
}

export function leaveAdmins (members: WorkspaceMemberInfo[], me: AccountUuid): AccountUuid[] {
  const isAdmin = (role: AccountRole): boolean => role === AccountRole.Owner || role === AccountRole.Maintainer
  return members
    .filter((member) => member.person !== me && !member.disabled && isAdmin(member.role))
    .sort((a, b) => Number(b.role === AccountRole.Owner) - Number(a.role === AccountRole.Owner))
    .map((member) => member.person)
}
