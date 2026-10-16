// Shared by the @team mention popup and webhook mentions; both must compute the same handles.
export const HEAD_DEPARTMENT = 'hr:ids:Head'
// Marks the hidden person mentions a team mention expands to; renderers skip nodes carrying it.
export const TEAM_MENTION_ATTR = 'servoneTeam'

export interface TeamSource<Id extends string = string, Person extends string = string> {
  _id: Id
  name: string
  parent?: Id
  teamLead: Person | null
  managers: readonly Person[]
  members: readonly Person[]
  createdOn?: number
}

export function teamHandle (name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
    .join('-')
}

// Older department keeps the bare handle, so a new namesake never steals an existing @handle.
export function teamHandles<Id extends string> (departments: ReadonlyArray<TeamSource<Id, string>>): Map<Id, string> {
  const byAge = departments
    .filter((dept) => dept._id !== HEAD_DEPARTMENT)
    .sort((a, b) => (a.createdOn ?? 0) - (b.createdOn ?? 0) || a._id.localeCompare(b._id))
  const taken = new Set<string>()
  const handles = new Map<Id, string>()
  for (const dept of byAge) {
    const base = teamHandle(dept.name)
    if (base === '') continue
    let handle = base
    for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`
    taken.add(handle)
    handles.set(dept._id, handle)
  }
  return handles
}

export interface TeamMemberFilter<Person extends string = string> {
  active: ReadonlySet<Person>
  sender?: Person
}

export function resolveTeamMembers<Id extends string, Person extends string> (
  team: Id,
  departments: ReadonlyArray<TeamSource<Id, Person>>,
  filter: TeamMemberFilter<Person>
): Person[] {
  const children = new Map<Id, Array<TeamSource<Id, Person>>>()
  for (const dept of departments) {
    if (dept.parent === undefined) continue
    children.set(dept.parent, [...(children.get(dept.parent) ?? []), dept])
  }
  const members = new Set<Person>()
  const visited = new Set<Id>()
  const queue = departments.filter((dept) => dept._id === team)
  for (let dept = queue.shift(); dept !== undefined; dept = queue.shift()) {
    if (visited.has(dept._id)) continue
    visited.add(dept._id)
    if (dept.teamLead !== null) members.add(dept.teamLead)
    for (const person of [...dept.managers, ...dept.members]) members.add(person)
    queue.push(...(children.get(dept._id) ?? []))
  }
  return [...members].filter((person) => filter.active.has(person) && person !== filter.sender)
}

export function resolveManager<Id extends string, Person extends string> (
  submitter: Person,
  department: Id,
  departments: ReadonlyArray<TeamSource<Id, Person>>,
  active: ReadonlySet<Person>
): Person | undefined {
  const byId = new Map(departments.map((dept) => [dept._id, dept]))
  const root = departments.find((dept) => dept._id === HEAD_DEPARTMENT)
  const parentOf = (dept: TeamSource<Id, Person>): TeamSource<Id, Person> | undefined =>
    dept === root ? undefined : (dept.parent === undefined ? undefined : byId.get(dept.parent)) ?? root
  const visited = new Set<TeamSource<Id, Person>>()
  for (let dept = byId.get(department); dept !== undefined && !visited.has(dept); dept = parentOf(dept)) {
    visited.add(dept)
    if (dept.teamLead !== null && active.has(dept.teamLead) && dept.teamLead !== submitter) return dept.teamLead
  }
  return undefined
}

// resolveManager finds nobody for this person by design, unlike a chart with a gap; leave auto-approval keys on it.
export function isTopOfChart (person: string, departments: readonly TeamSource[], active: ReadonlySet<string>): boolean {
  return active.has(person) && departments.some((dept) => dept._id === HEAD_DEPARTMENT && dept.teamLead === person)
}
