import core, {
  AccountRole,
  getCurrentAccount,
  hasAccountRole,
  type DocumentUpdate,
  type Ref,
  type TxOperations
} from '@hcengineering/core'
import { RESOURCE_CLASS, type BookableResource } from '@servone/approvals/src/booking'
import { ensureResourceClass } from '../setup'

export type ResourceFields = Pick<BookableResource, 'name' | 'type' | 'capacity' | 'needsApproval' | 'approver'>

export const SAMPLE_ROOMS: ResourceFields[] = [
  { name: 'Phòng họp lớn', type: 'room', capacity: 12, needsApproval: false },
  { name: 'Phòng họp nhỏ', type: 'room', capacity: 4, needsApproval: false },
  { name: 'Phòng tiếp khách', type: 'room', capacity: 6, needsApproval: false }
]

export function canManageResources (): boolean {
  return hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
}

export async function createResource (client: TxOperations, fields: ResourceFields): Promise<Ref<BookableResource>> {
  await ensureResourceClass(client)
  return await client.createDoc(RESOURCE_CLASS, core.space.Model, { ...fields, archived: false })
}

export async function updateResource (client: TxOperations, resource: BookableResource, fields: ResourceFields): Promise<void> {
  const { capacity, approver, ...required } = fields
  const update: DocumentUpdate<BookableResource> = { ...required }
  const cleared: Record<string, true> = {}
  if (capacity === undefined) cleared.capacity = true
  else update.capacity = capacity
  if (approver === undefined) cleared.approver = true
  else update.approver = approver
  if (Object.keys(cleared).length > 0) update.$unset = cleared
  await client.update(resource, update)
}

export async function setResourceArchived (client: TxOperations, resource: BookableResource, isArchived: boolean): Promise<void> {
  await client.update(resource, { archived: isArchived })
}

export async function addSampleResources (client: TxOperations, existing: BookableResource[]): Promise<number> {
  const taken = new Set(existing.filter((resource) => !resource.archived).map((resource) => resource.name.trim().toLowerCase()))
  const missing = SAMPLE_ROOMS.filter((sample) => !taken.has(sample.name.toLowerCase()))
  for (const sample of missing) await createResource(client, sample)
  return missing.length
}
