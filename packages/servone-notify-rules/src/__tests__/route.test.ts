import { isLeaveOn, routeApproval, withStandIn, type RouteInput } from '../route'
import { HEAD_DEPARTMENT, type TeamSource } from '../team'

const dept = (_id: string, teamLead: string | null, parent?: string): TeamSource => ({ _id, name: _id, parent, teamLead, managers: [], members: [] })

// Công ty (boss) > Kinh doanh (binh) > Bán lẻ (no head); An sits in Bán lẻ, Chi in Kinh doanh.
const chart = [dept(HEAD_DEPARTMENT, 'boss'), dept('sales', 'binh', HEAD_DEPARTMENT), dept('retail', null, 'sales')]
const NOW = Date.UTC(2026, 9, 5, 3)

function input (overrides: Partial<RouteInput<string, string>> = {}): RouteInput<string, string> {
  return {
    submitter: 'chi',
    department: 'sales',
    departments: chart,
    active: new Set(['boss', 'binh', 'an', 'chi', 'dung', 'owner']),
    onLeave: new Set(),
    standIns: new Map(),
    admins: ['owner'],
    now: NOW,
    ...overrides
  }
}

describe('routeApproval', () => {
  it('sends to the head with no reason when the head is in', () => {
    expect(routeApproval(input())).toEqual({ approver: 'binh' })
  })

  it('sends to the stand-in of a head on leave', () => {
    const route = routeApproval(input({ onLeave: new Set(['binh']), standIns: new Map([['binh', { person: 'an' }]]) }))
    expect(route).toEqual({ approver: 'an', kind: 'stand_in_leave', for: 'binh' })
  })

  it('sends to a stand-in during their date range while the head is in', () => {
    const standIns = new Map([['binh', { person: 'an', from: NOW - 1, to: NOW + 1 }]])
    expect(routeApproval(input({ standIns }))).toEqual({ approver: 'an', kind: 'stand_in', for: 'binh' })
  })

  it('ignores a stand-in outside their range while the head is in', () => {
    const standIns = new Map([['binh', { person: 'an', from: NOW + 1, to: NOW + 2 }]])
    expect(routeApproval(input({ standIns }))).toEqual({ approver: 'binh' })
  })

  it('passes up past a head on leave with no stand-in, naming that head', () => {
    expect(routeApproval(input({ onLeave: new Set(['binh']) }))).toEqual({ approver: 'boss', kind: 'head_on_leave', for: 'binh' })
  })

  it('never sends a stand-in their own request, nor a stand-in who is also away', () => {
    const standIns = new Map([['binh', { person: 'chi' }]])
    expect(routeApproval(input({ onLeave: new Set(['binh']), standIns }))).toEqual({ approver: 'boss', kind: 'head_on_leave', for: 'binh' })
    const awayStandIn = new Map([['binh', { person: 'an' }]])
    expect(routeApproval(input({ onLeave: new Set(['binh', 'an']), standIns: awayStandIn }))).toEqual({ approver: 'boss', kind: 'head_on_leave', for: 'binh' })
  })

  it('sends from a team with no head to the parent head, naming the team', () => {
    expect(routeApproval(input({ submitter: 'an', department: 'retail' }))).toEqual({ approver: 'binh', kind: 'no_head', for: 'retail' })
  })

  it('sends to an admin, preferring one in the office, when nobody up the chart can approve', () => {
    const headless = [dept(HEAD_DEPARTMENT, null), dept('sales', null, HEAD_DEPARTMENT)]
    const route = routeApproval(input({ departments: headless, admins: ['owner', 'dung'], onLeave: new Set(['owner']) }))
    expect(route).toEqual({ approver: 'dung', kind: 'admin' })
  })

  it('finds nobody for the top of the chart, whose leave the engine approves itself', () => {
    expect(routeApproval(input({ submitter: 'boss', department: HEAD_DEPARTMENT }))).toBeUndefined()
  })

  it('swaps a named approver for their stand-in without walking anywhere', () => {
    const context = input({ onLeave: new Set(['dung']), standIns: new Map([['dung', { person: 'an' }]]) })
    expect(withStandIn('dung', context)).toEqual({ approver: 'an', kind: 'stand_in_leave', for: 'dung' })
    expect(withStandIn('dung', input({ onLeave: new Set(['dung']) }))).toEqual({ approver: 'dung' })
  })
})

describe('isLeaveOn', () => {
  // Vietnam is UTC+7, so getTimezoneOffset() is -420; 18:00 UTC on Oct 4 is already Oct 5 there.
  const leave = { tzDate: { year: 2026, month: 9, day: 5, offset: -420 }, tzDueDate: { year: 2026, month: 9, day: 6, offset: -420 } }

  it('reads the day in the leave\'s own time zone', () => {
    expect(isLeaveOn(leave, Date.UTC(2026, 9, 4, 18))).toBe(true)
    expect(isLeaveOn(leave, Date.UTC(2026, 9, 4, 16))).toBe(false)
    expect(isLeaveOn(leave, Date.UTC(2026, 9, 6, 16, 59))).toBe(true)
    expect(isLeaveOn(leave, Date.UTC(2026, 9, 6, 17))).toBe(false)
  })
})
