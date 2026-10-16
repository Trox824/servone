// Joins department members to the department's default channels and synced projects. Reads the transactor's
// `tx` topic because the stock s0.7.437 transactor cannot load a Servone trigger.
import { createRestClient, type RestClient } from '@hcengineering/api-client'
import chunter, { type Channel } from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, {
  type ArrOf,
  type Class,
  type MeasureContext,
  notEmpty,
  type Ref,
  type RefTo,
  type Space,
  systemAccountUuid,
  type Tx,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getEmbeddedLabel } from '@hcengineering/platform'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import tracker from '@hcengineering/tracker'

import config from '../config'
import {
  DEFAULT_CHANNELS_ATTR,
  planJoins,
  readDepartmentEvent,
  SYNC_DEPARTMENT_ATTR,
  type DepartmentEvent,
  type DepartmentWithChannels,
  type ProjectWithSync
} from './join'

const txFactory = new TxFactory(core.account.System)
const syncedProjectClass: Ref<Class<ProjectWithSync>> = tracker.class.Project
const clients = new Map<WorkspaceUuid, RestClient>()

async function getWorkspaceClient (workspace: WorkspaceUuid): Promise<RestClient> {
  const cached = clients.get(workspace)
  if (cached !== undefined) return cached
  const token = generateToken(systemAccountUuid, workspace, { service: config.deptChannels.ServiceId })
  const endpoint = await getTransactorEndpoint(token)
  const client = createRestClient(endpoint, workspace, token)
  await ensureDepartmentAttribute(client)
  await ensureProjectAttribute(client)
  clients.set(workspace, client)
  return client
}

// Same attribute the front creates (servone-ui hr-resources/departmentChannels/setup.ts); either may run first.
async function ensureDepartmentAttribute (client: RestClient): Promise<void> {
  const existing = await client.findOne(core.class.Attribute, {
    attributeOf: hr.class.Department,
    name: DEFAULT_CHANNELS_ATTR
  })
  if (existing !== undefined) return
  const channelRef: RefTo<Channel> = { _class: core.class.RefTo, label: core.string.Ref, to: chunter.class.Channel }
  const channelRefs: ArrOf<Ref<Channel>> = { _class: core.class.ArrOf, label: core.string.Array, of: channelRef }
  await client.tx(
    txFactory.createTxCreateDoc(core.class.Attribute, core.space.Model, {
      attributeOf: hr.class.Department,
      name: DEFAULT_CHANNELS_ATTR,
      label: getEmbeddedLabel('Default channels'),
      type: channelRefs,
      isCustom: true,
      hidden: true
    })
  )
}

// A custom field is only queryable once its attribute is in the model; the Members tab may create it first.
async function ensureProjectAttribute (client: RestClient): Promise<void> {
  const existing = await client.findOne(core.class.Attribute, {
    attributeOf: tracker.class.Project,
    name: SYNC_DEPARTMENT_ATTR
  })
  if (existing !== undefined) return
  const departmentRef: RefTo<Department> = { _class: core.class.RefTo, label: core.string.Ref, to: hr.class.Department }
  await client.tx(
    txFactory.createTxCreateDoc(core.class.Attribute, core.space.Model, {
      attributeOf: tracker.class.Project,
      name: SYNC_DEPARTMENT_ATTR,
      label: getEmbeddedLabel('Sync with department'),
      type: departmentRef,
      isCustom: true,
      hidden: true
    })
  )
}

async function spacesToJoin (
  client: RestClient,
  event: DepartmentEvent,
  department: DepartmentWithChannels
): Promise<Space[]> {
  if (event.kind === 'projectSynced') return await client.findAll(tracker.class.Project, { _id: event.project })
  const channelIds = department.servoneDefaultChannels ?? []
  const channels = channelIds.length > 0 ? await client.findAll(chunter.class.Channel, { _id: { $in: channelIds } }) : []
  if (event.kind === 'channelsChanged') return channels
  const projects = await client.findAll(syncedProjectClass, { servoneSyncDepartment: department._id })
  return [...channels, ...projects]
}

async function applyEvent (ctx: MeasureContext, workspace: WorkspaceUuid, event: DepartmentEvent): Promise<void> {
  const client = await getWorkspaceClient(workspace)
  const department: DepartmentWithChannels | undefined = await client.findOne(hr.class.Department, {
    _id: event.department
  })
  if (department === undefined) return
  const spaces = await spacesToJoin(client, event, department)
  if (spaces.length === 0) return

  const employeeIds = event.kind === 'membersAdded' ? event.employees : department.members
  if (employeeIds.length === 0) return
  const employees = await client.findAll(contact.mixin.Employee, { _id: { $in: employeeIds }, active: true })
  const accounts = employees.map((employee) => employee.personUuid).filter(notEmpty)

  for (const { space, accounts: joining } of planJoins(accounts, spaces)) {
    ctx.info('join department space', { workspace, department: department._id, space: space._id, count: joining.length })
    await client.tx(
      txFactory.createTxUpdateDoc(space._class, space.space, space._id, {
        $push: { members: { $each: joining, $position: 0 } }
      })
    )
  }
}

export function startDeptChannels (ctx: MeasureContext): () => Promise<void> {
  const queue = getPlatformQueue(config.deptChannels.ServiceId, config.deptChannels.QueueRegion)

  // A throw makes the queue retry the same message with backoff, so a transactor restart loses nothing.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (ctx, message) => {
    const event = readDepartmentEvent(message.value)
    if (event === undefined) return
    await applyEvent(ctx, message.workspace, event)
  })
  return async () => {
    await consumer.close()
  }
}
