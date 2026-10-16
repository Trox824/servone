import { HEAD_DEPARTMENT, resolveManager } from '@servone/notify-rules'
import { fold } from '../../../../lib/fold'
import type { ParseProblem, RowError, StaffRow } from './csv'

export interface ParsedRows {
  rows: StaffRow[]
  errors: Array<RowError<ParseProblem>>
}

export interface ExistingPerson<Id extends string = string> {
  _id: Id
  email: string
  isStaff: boolean
  title: string
  department: string
}

export interface ExistingDepartment {
  _id: string
  name: string
  parent?: string
  teamLead: string | null
}

export type PlanProblem =
  | ParseProblem
  | 'DuplicateEmail'
  | 'NotStaff'
  | 'MissingName'
  | 'SelfManager'
  | 'UnknownManager'
  | 'ManagerSkipped'
  | 'HeadConflict'
  | 'ParentConflict'
  | 'ReportingLoop'
  | 'TopHasManager'

export type Change = 'title' | 'department' | 'manager'

interface PlannedBase {
  row: StaffRow
  department: string
}

export type PlannedRow<Id extends string = string> =
  | (PlannedBase & { action: 'create' })
  | (PlannedBase & { action: 'update' | 'unchanged', changes: Change[], personId: Id })

export interface ImportPlan<Id extends string = string> {
  rows: Array<PlannedRow<Id>>
  errors: Array<RowError<PlanProblem>>
  newDepartments: Array<{ key: string, name: string }>
  heads: Map<string, string>
  parents: Map<string, string>
}

export function planImport<Id extends string> (
  parsed: ParsedRows,
  people: ReadonlyArray<ExistingPerson<Id>>,
  departments: readonly ExistingDepartment[]
): ImportPlan<Id> {
  const personByEmail = new Map(people.map((person) => [person.email, person]))
  const emailById = new Map<string, string>(people.map((person) => [person._id, person.email]))
  const departmentByName = new Map<string, ExistingDepartment>()
  for (const dept of departments) if (!departmentByName.has(fold(dept.name))) departmentByName.set(fold(dept.name), dept)
  const keyOf = (name: string): string => departmentByName.get(fold(name))?._id ?? fold(name)
  const personToken = (id: string): string => emailById.get(id) ?? id
  const existingHeads = new Map(departments.map((dept) => [dept._id, dept.teamLead === null ? undefined : personToken(dept.teamLead)]))
  const existingParents = new Map(
    departments.filter((dept) => dept._id !== HEAD_DEPARTMENT).map((dept) => [dept._id, dept.parent ?? HEAD_DEPARTMENT])
  )

  const { rows } = parsed
  const parseSkipped = new Set(parsed.errors.map((error) => error.row.email))
  const errors = new Map<StaffRow, PlanProblem>()
  const seen = new Set<string>()
  for (const row of rows) {
    const existing = personByEmail.get(row.email)
    if (seen.has(row.email)) errors.set(row, 'DuplicateEmail')
    else if (existing !== undefined && !existing.isStaff) errors.set(row, 'NotStaff')
    else if (existing === undefined && row.name === '') errors.set(row, 'MissingName')
    else if (row.managerEmail === row.email) errors.set(row, 'SelfManager')
    seen.add(row.email)
  }

  let heads = new Map<string, string>()
  let parents = new Map<string, string>()
  for (let hasNewErrors = true; hasNewErrors;) {
    hasNewErrors = false
    heads = new Map()
    parents = new Map()
    const fileRows = new Map(rows.filter((row) => !errors.has(row)).map((row) => [row.email, row]))
    const departmentOf = (email: string): string => {
      const fileRow = fileRows.get(email)
      if (fileRow !== undefined && fileRow.department !== '') return keyOf(fileRow.department)
      return personByEmail.get(email)?.department ?? HEAD_DEPARTMENT
    }
    const parentOf = (key: string): string | undefined =>
      key === HEAD_DEPARTMENT ? undefined : parents.get(key) ?? existingParents.get(key) ?? HEAD_DEPARTMENT
    for (const row of fileRows.values()) {
      if (row.managerEmail === '') continue
      const manager = personByEmail.get(row.managerEmail)
      const problem = claim(row, manager)
      if (problem !== undefined) {
        errors.set(row, problem)
        hasNewErrors = true
        break
      }
    }

    function claim (row: StaffRow, manager: ExistingPerson<Id> | undefined): PlanProblem | undefined {
      if (!fileRows.has(row.managerEmail) && manager?.isStaff !== true) {
        const isSkipped = parseSkipped.has(row.managerEmail) || rows.some((other) => other.email === row.managerEmail)
        return isSkipped ? 'ManagerSkipped' : 'UnknownManager'
      }
      const own = departmentOf(row.email)
      const above = departmentOf(row.managerEmail)
      if (own === above) return claimHead(own, row.managerEmail)
      if (own === HEAD_DEPARTMENT) return 'TopHasManager'
      const visited = new Set<string>()
      for (let key: string | undefined = above; key !== undefined && !visited.has(key); key = parentOf(key)) {
        if (key === own) return 'ReportingLoop'
        visited.add(key)
      }
      const claimedParent = parents.get(own)
      if (claimedParent !== undefined && claimedParent !== above) return 'ParentConflict'
      const conflict = claimHead(own, row.email) ?? claimHead(above, row.managerEmail)
      if (conflict !== undefined) return conflict
      parents.set(own, above)
      return undefined
    }

    function claimHead (key: string, email: string): PlanProblem | undefined {
      const claimed = heads.get(key)
      if (claimed !== undefined && claimed !== email) return 'HeadConflict'
      heads.set(key, email)
      return undefined
    }
  }

  const valid = rows.filter((row) => !errors.has(row))
  const newDepartments: Array<{ key: string, name: string }> = []
  for (const row of valid) {
    const key = keyOf(row.department)
    if (row.department !== '' && !existingHeads.has(key) && !newDepartments.some((dept) => dept.key === key)) {
      newDepartments.push({ key, name: row.department })
    }
  }

  const activeStaff = new Set<string>(people.filter((person) => person.isStaff).map((person) => person._id))
  const teams = departments.map((dept) => ({ ...dept, managers: [], members: [] }))
  const plannedRows = valid.map((row): PlannedRow<Id> => {
    const existing = personByEmail.get(row.email)
    const department = row.department === '' ? existing?.department ?? HEAD_DEPARTMENT : keyOf(row.department)
    if (existing === undefined) return { row, action: 'create', department }
    const currentManager = resolveManager(existing._id, existing.department, teams, activeStaff)
    const changes: Change[] = []
    if (row.title !== '' && row.title !== existing.title) changes.push('title')
    if (department !== existing.department) changes.push('department')
    if (row.managerEmail !== '' && row.managerEmail !== (currentManager === undefined ? undefined : personToken(currentManager))) {
      changes.push('manager')
    }
    return { row, action: changes.length === 0 ? 'unchanged' : 'update', changes, department, personId: existing._id }
  })

  return {
    rows: plannedRows,
    errors: [...parsed.errors, ...[...errors].map(([row, problem]) => ({ row, problem }))].sort((a, b) => a.row.line - b.row.line),
    newDepartments,
    heads: new Map([...heads].filter(([key, email]) => existingHeads.get(key) !== email)),
    parents: new Map([...parents].filter(([key, parent]) => existingParents.get(key) !== parent))
  }
}

export function splitFullName (fullName: string): { firstName: string, lastName: string } {
  const [lastName, ...given] = fullName.split(' ')
  return given.length === 0 ? { firstName: lastName, lastName: '' } : { firstName: given.join(' '), lastName }
}
