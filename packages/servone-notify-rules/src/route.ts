import { HEAD_DEPARTMENT, isTopOfChart, type TeamSource } from './team'

// from and to are both set or both absent; absent means only while the person is on leave.
export interface StandIn<Person extends string = string> {
  person: Person
  from?: number
  to?: number
}

export type RouteKind = 'stand_in' | 'stand_in_leave' | 'head_on_leave' | 'no_head' | 'admin'

// kind is absent when the request went where the submitter would expect: their own head, or the named person.
export interface ApprovalRoute<Id extends string = string, Person extends string = string> {
  approver: Person
  kind?: RouteKind
  for?: Id | Person
}

export interface RouteInput<Id extends string, Person extends string> {
  submitter: Person
  department: Id
  departments: ReadonlyArray<TeamSource<Id, Person>>
  active: ReadonlySet<Person>
  onLeave: ReadonlySet<Person>
  standIns: ReadonlyMap<Person, StandIn<Person>>
  // Owners first, then Maintainers.
  admins: readonly Person[]
  now: number
}

type StandInContext<Person extends string> = Pick<RouteInput<string, Person>, 'submitter' | 'active' | 'onLeave' | 'standIns' | 'now'>

function standInOf<Person extends string> (person: Person, input: StandInContext<Person>): ApprovalRoute<string, Person> | undefined {
  const standIn = input.standIns.get(person)
  if (standIn === undefined) return undefined
  const isAway = input.onLeave.has(person)
  const isInRange = standIn.from !== undefined && standIn.to !== undefined && standIn.from <= input.now && input.now <= standIn.to
  const isUsable = input.active.has(standIn.person) && standIn.person !== input.submitter && !input.onLeave.has(standIn.person)
  if (!(isAway || isInRange) || !isUsable) return undefined
  return { approver: standIn.person, kind: isAway ? 'stand_in_leave' : 'stand_in', for: person }
}

// For the person and field rules: no chart to walk, so an away approver without a stand-in still gets it.
export function withStandIn<Person extends string> (approver: Person, input: StandInContext<Person>): ApprovalRoute<string, Person> {
  return standInOf(approver, input) ?? { approver }
}

// Walks up the way resolveManager does, skipping heads on leave; undefined only for the top of the chart or no admin.
export function routeApproval<Id extends string, Person extends string> (input: RouteInput<Id, Person>): ApprovalRoute<Id, Person> | undefined {
  const { submitter, departments, active, onLeave } = input
  const byId = new Map(departments.map((dept) => [dept._id, dept]))
  const root = byId.get(HEAD_DEPARTMENT as Id)
  const parentOf = (dept: TeamSource<Id, Person>): TeamSource<Id, Person> | undefined =>
    dept === root ? undefined : (dept.parent === undefined ? undefined : byId.get(dept.parent)) ?? root
  const visited = new Set<TeamSource<Id, Person>>()
  let skipped: Pick<ApprovalRoute<Id, Person>, 'kind' | 'for'> | undefined
  for (let dept = byId.get(input.department); dept !== undefined && !visited.has(dept); dept = parentOf(dept)) {
    visited.add(dept)
    const head = dept.teamLead
    if (head === null || !active.has(head)) {
      skipped ??= { kind: 'no_head', for: dept._id }
      continue
    }
    if (head === submitter) continue
    const standIn = standInOf(head, input)
    if (standIn !== undefined) return standIn
    if (!onLeave.has(head)) return { approver: head, ...skipped }
    skipped ??= { kind: 'head_on_leave', for: head }
  }
  if (isTopOfChart(submitter, departments, active)) return undefined
  return adminRoute(input)
}

export function adminRoute<Id extends string, Person extends string> (
  input: Pick<RouteInput<Id, Person>, 'submitter' | 'active' | 'onLeave' | 'admins'>
): ApprovalRoute<Id, Person> | undefined {
  const admins = input.admins.filter((admin) => input.active.has(admin) && admin !== input.submitter)
  const admin = admins.find((candidate) => !input.onLeave.has(candidate)) ?? admins[0]
  return admin === undefined ? undefined : { approver: admin, kind: 'admin' }
}

// TzDate offset is minutes behind UTC (Date.getTimezoneOffset), so the leave's own day needs no server time zone.
export function isLeaveOn (leave: { tzDate: LeaveDate, tzDueDate: LeaveDate }, now: number): boolean {
  const local = new Date(now - leave.tzDate.offset * 60_000)
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const dayOf = (date: LeaveDate): number => Date.UTC(date.year, date.month, date.day)
  return dayOf(leave.tzDate) <= today && today <= dayOf(leave.tzDueDate)
}

export interface LeaveDate {
  year: number
  month: number
  day: number
  offset: number
}
