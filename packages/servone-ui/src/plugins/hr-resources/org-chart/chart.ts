import { HEAD_DEPARTMENT, resolveManager, type TeamSource } from '@servone/notify-rules'
import { isOffOn, type LeaveDay } from '../../../lib/leave'
import type { Leave } from '../../calendar-resources/lich/lib/leave'

type ChartDepartment = Pick<TeamSource, '_id' | 'name' | 'parent' | 'teamLead'>

export interface ChartStaff {
  _id: string
  department?: string
}

export interface ChartNode<D extends ChartDepartment> {
  department: D
  head?: string
  members: string[]
  direct: number
  total: number
  children: Array<ChartNode<D>>
}

export function buildOrgChart<D extends ChartDepartment> (
  departments: readonly D[],
  staff: readonly ChartStaff[]
): ChartNode<D> | undefined {
  const root = departments.find((dept) => dept._id === HEAD_DEPARTMENT)
  if (root === undefined) return undefined
  const activeIds = new Set(staff.map((person) => person._id))
  const byName = [...departments].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  const ids = new Set(departments.map((dept) => dept._id))
  const parentOf = (dept: D): string =>
    dept.parent !== undefined && ids.has(dept.parent) ? dept.parent : HEAD_DEPARTMENT
  const leads = new Set(byName.map((dept) => dept.teamLead).filter((lead): lead is string => lead !== null && activeIds.has(lead)))
  const drawn = new Set<string>()
  const build = (dept: D): ChartNode<D> => {
    drawn.add(dept._id)
    const head = dept.teamLead !== null && activeIds.has(dept.teamLead) ? dept.teamLead : undefined
    const members = staff
      .filter((person) => (person.department ?? HEAD_DEPARTMENT) === dept._id && !leads.has(person._id))
      .map((person) => person._id)
    const children = byName.filter((child) => !drawn.has(child._id) && parentOf(child) === dept._id).map(build)
    const direct = members.length + (head === undefined ? 0 : 1)
    return {
      department: dept,
      head,
      members,
      direct,
      total: direct + children.reduce((sum, child) => sum + child.total, 0),
      children
    }
  }
  const chart = build(root)
  for (const dept of byName) {
    if (drawn.has(dept._id)) continue
    const orphan = build(dept)
    chart.children.push(orphan)
    chart.total += orphan.total
  }
  return chart
}

export function reportingLines<D extends TeamSource> (
  departments: readonly D[],
  staff: readonly ChartStaff[]
): Map<string, string | undefined> {
  const activeIds = new Set(staff.map((person) => person._id))
  return new Map(
    staff.map((person) => [person._id, resolveManager(person._id, person.department ?? HEAD_DEPARTMENT, departments, activeIds)])
  )
}

export function loopAfterMove<D extends TeamSource> (
  departments: readonly D[],
  staff: readonly ChartStaff[],
  person: string,
  department: string
): string[] {
  const moved = staff.map((member) => (member._id === person ? { ...member, department } : member))
  const lines = reportingLines(departments, moved)
  const chain = [person]
  for (let next = lines.get(person); next !== undefined && !chain.includes(next, 1); next = lines.get(next)) {
    chain.push(next)
    if (next === person) return chain
  }
  return []
}

export function pathTo<D extends ChartDepartment> (chart: ChartNode<D>, person: string): string[] {
  if (chart.head === person || chart.members.includes(person)) return [chart.department._id]
  for (const child of chart.children) {
    const path = pathTo(child, person)
    if (path.length > 0) return [chart.department._id, ...path]
  }
  return []
}

export function offOn (leaves: readonly Leave[], day: LeaveDay, active: ReadonlySet<string>): Map<string, LeaveDay> {
  const off = new Map<string, LeaveDay>()
  for (const leave of leaves) {
    if (!active.has(leave.attachedTo) || !isOffOn(leave, day)) continue
    const until = off.get(leave.attachedTo)
    if (until === undefined || isOffOn(leave, until)) off.set(leave.attachedTo, leave.tzDueDate)
  }
  return off
}

export function formatLeaveDay (day: LeaveDay, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: language === 'vi' ? 'numeric' : 'short',
    timeZone: 'UTC'
  }).format(Date.UTC(day.year, day.month, day.day))
}

export function departmentTree<D extends ChartDepartment> (chart: ChartNode<D>, depth = 0): Array<{ department: D, depth: number }> {
  return [{ department: chart.department, depth }, ...chart.children.flatMap((child) => departmentTree(child, depth + 1))]
}

export function directoryGroups<D extends ChartDepartment> (chart: ChartNode<D>): Array<{ department: D, people: string[] }> {
  const people = chart.head === undefined ? chart.members : [chart.head, ...chart.members]
  const own = people.length === 0 ? [] : [{ department: chart.department, people }]
  return [...own, ...chart.children.flatMap((child) => directoryGroups(child))]
}
