import type { Channel } from '@hcengineering/chunter'
import type { Employee } from '@hcengineering/contact'
import core, { type AccountUuid, type Position, type Ref, type Space, type Tx, type TxCreateDoc, type TxUpdateDoc } from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import tracker, { type Project } from '@hcengineering/tracker'

// Must match DEFAULT_CHANNELS_ATTR in packages/servone-ui/src/plugins/hr-resources/departmentChannels/setup.ts.
export const DEFAULT_CHANNELS_ATTR = 'servoneDefaultChannels' satisfies keyof DepartmentWithChannels

export interface DepartmentWithChannels extends Department {
  servoneDefaultChannels?: Array<Ref<Channel>>
}

export const SYNC_DEPARTMENT_ATTR = 'servoneSyncDepartment' satisfies keyof ProjectWithSync

// The attribute editor clears a RefTo field to null.
export interface ProjectWithSync extends Project {
  servoneSyncDepartment?: Ref<Department> | null
}

export type DepartmentEvent =
  | { kind: 'membersAdded', department: Ref<Department>, employees: Array<Ref<Employee>> }
  | { kind: 'channelsChanged', department: Ref<Department> }
  | { kind: 'projectSynced', project: Ref<Project>, department: Ref<Department> }

export type SpaceMembers = Pick<Space, '_id' | 'members' | 'archived'>

export interface SpaceJoin<S extends SpaceMembers> {
  space: S
  accounts: AccountUuid[]
}

function pushed<T extends string> (value: T | Position<T> | undefined): T[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : value.$each
}

function readProjectEvent (tx: TxCreateDoc<ProjectWithSync> | TxUpdateDoc<ProjectWithSync>): DepartmentEvent | undefined {
  const department =
    tx._class === core.class.TxCreateDoc
      ? (tx as TxCreateDoc<ProjectWithSync>).attributes.servoneSyncDepartment
      : (tx as TxUpdateDoc<ProjectWithSync>).operations.servoneSyncDepartment
  return department != null ? { kind: 'projectSynced', project: tx.objectId, department } : undefined
}

// Stock OnDepartmentStaff adds a person to a department and all its parents with one `$push: { members }`
// per department, so parent-department channels reach sub-department members without walking the tree.
export function readDepartmentEvent (tx: Tx): DepartmentEvent | undefined {
  if (tx._class !== core.class.TxCreateDoc && tx._class !== core.class.TxUpdateDoc) return undefined
  const cud = tx as TxCreateDoc<ProjectWithSync> | TxUpdateDoc<ProjectWithSync>
  if (cud.objectClass === tracker.class.Project) return readProjectEvent(cud)
  if (tx._class === core.class.TxCreateDoc) {
    const create = tx as TxCreateDoc<DepartmentWithChannels>
    if (create.objectClass !== hr.class.Department) return undefined
    const channels = create.attributes.servoneDefaultChannels ?? []
    return channels.length > 0 ? { kind: 'channelsChanged', department: create.objectId } : undefined
  }
  const update = tx as TxUpdateDoc<DepartmentWithChannels>
  if (update.objectClass !== hr.class.Department) return undefined
  const { operations } = update
  if (operations.servoneDefaultChannels !== undefined || operations.$push?.servoneDefaultChannels !== undefined) {
    return { kind: 'channelsChanged', department: update.objectId }
  }
  const employees = pushed(operations.$push?.members)
  return employees.length > 0 ? { kind: 'membersAdded', department: update.objectId, employees } : undefined
}

// Leaving a department never removes anyone: people who move keep the channels and projects they already had.
export function planJoins<S extends SpaceMembers> (accounts: AccountUuid[], spaces: S[]): Array<SpaceJoin<S>> {
  const unique = Array.from(new Set(accounts))
  const joins: Array<SpaceJoin<S>> = []
  for (const space of spaces) {
    if (space.archived) continue
    const current = new Set(space.members)
    const missing = unique.filter((account) => !current.has(account))
    if (missing.length > 0) joins.push({ space, accounts: missing })
  }
  return joins
}
