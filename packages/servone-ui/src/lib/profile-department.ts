import type { Doc, Hierarchy, Mixin, Ref } from '@hcengineering/core'
import { headDepartment, type TeamDepartment } from './team-mentions'

export const staffMixin = 'hr:mixin:Staff' as Ref<Mixin<StaffFields>>

export interface StaffFields extends Doc {
  department?: Ref<TeamDepartment>
}

export type DepartmentSource = Pick<
  TeamDepartment,
  '_id' | 'name' | 'teamLead' | 'managers' | 'members' | 'createdOn'
>

export function staffDepartmentOf (hierarchy: Hierarchy, person: Doc): Ref<TeamDepartment> | undefined {
  return hierarchy.asIf(person, staffMixin)?.department
}

function isIn (dept: DepartmentSource, person: Ref<Doc>): boolean {
  return dept.teamLead === person || dept.managers.includes(person) || dept.members.includes(person)
}

export function profileDepartment<D extends DepartmentSource> (
  person: Ref<Doc>,
  staffDepartment: Ref<TeamDepartment> | undefined,
  departments: D[]
): D | undefined {
  const named = departments.filter((dept) => dept._id !== headDepartment)
  const assigned = named.find((dept) => dept._id === staffDepartment)
  if (assigned !== undefined) return assigned
  return named
    .filter((dept) => isIn(dept, person))
    .sort((a, b) => (a.createdOn ?? 0) - (b.createdOn ?? 0) || a._id.localeCompare(b._id))[0]
}
