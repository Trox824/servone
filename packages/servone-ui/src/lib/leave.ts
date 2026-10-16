import { LEAVE_APPROVAL_ATTR, type LeaveApproval } from '@servone/approvals/src/gate'

export interface LeaveDay {
  year: number
  month: number
  day: number
}

export interface Leave {
  type: string
  tzDate: LeaveDay
  tzDueDate: LeaveDay
  [LEAVE_APPROVAL_ATTR]?: LeaveApproval
}

const DAY_MS = 24 * 60 * 60 * 1000
export const utcOf = (d: LeaveDay): number => Date.UTC(d.year, d.month, d.day)

export function localDay (t: number): LeaveDay {
  const d = new Date(t)
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

const dayOf = (t: number): LeaveDay => {
  const d = new Date(t)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
}

export function nextWorkingDay (from: LeaveDay, holidays: LeaveDay[]): LeaveDay {
  let t = utcOf(from)
  while (workingDays(dayOf(t), dayOf(t), holidays) === 0) t += DAY_MS
  return dayOf(t)
}

export function workingDays (from: LeaveDay, to: LeaveDay, holidays: LeaveDay[]): number {
  const holidaySet = new Set(holidays.map(utcOf))
  let count = 0
  for (let t = utcOf(from); t <= utcOf(to); t += DAY_MS) {
    const weekday = new Date(t).getUTCDay()
    if (weekday !== 0 && weekday !== 6 && !holidaySet.has(t)) count++
  }
  return count
}

export function isApprovedLeave (leave: Leave): boolean {
  return leave[LEAVE_APPROVAL_ATTR] === 'approved'
}

export function isPendingLeave (leave: Leave): boolean {
  return leave[LEAVE_APPROVAL_ATTR] === 'pending'
}

export function isOffOn (leave: Leave, day: LeaveDay): boolean {
  const t = utcOf(day)
  return isApprovedLeave(leave) && utcOf(leave.tzDate) <= t && t <= utcOf(leave.tzDueDate)
}

export const DEFAULT_ANNUAL_LEAVE_DAYS = 12 // Labour Code 2019, art. 113, normal working conditions
export const ANNUAL_LEAVE_DAYS_ATTR = 'servoneAnnualLeaveDays'
export const MAX_ANNUAL_LEAVE_DAYS = 365 // one calendar year; anything above is a typo

export function annualAllowance (setting: number | undefined): number {
  return setting !== undefined && Number.isInteger(setting) && setting >= 1 && setting <= MAX_ANNUAL_LEAVE_DAYS
    ? setting
    : DEFAULT_ANNUAL_LEAVE_DAYS
}

export const ANNUAL_LEAVE_TYPE = 'hr:ids:Vacation'

export function workingDaysInYear (from: LeaveDay, to: LeaveDay, year: number, holidays: LeaveDay[]): number {
  const first = utcOf(from) < Date.UTC(year, 0, 1) ? { year, month: 0, day: 1 } : from
  const last = utcOf(to) > Date.UTC(year, 11, 31) ? { year, month: 11, day: 31 } : to
  return workingDays(first, last, holidays)
}

function annualDays (leaves: Leave[], isCounted: (leave: Leave) => boolean, year: number, holidays: LeaveDay[]): number {
  return leaves
    .filter((leave) => leave.type === ANNUAL_LEAVE_TYPE && isCounted(leave))
    .reduce((sum, leave) => sum + workingDaysInYear(leave.tzDate, leave.tzDueDate, year, holidays), 0)
}

export function daysLeft (allowance: number, leaves: Leave[], year: number, holidays: LeaveDay[]): number {
  return allowance - annualDays(leaves, isApprovedLeave, year, holidays)
}

export function pendingDays (leaves: Leave[], year: number, holidays: LeaveDay[]): number {
  return annualDays(leaves, isPendingLeave, year, holidays)
}
