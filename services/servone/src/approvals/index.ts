// Approval engine: submits and closes requests from the transactor's `tx` topic, decides them over HTTP.
// Writes carry the servone-approvals service id, the only session the transactor's approval guard lets through.
import core, {
  AccountRole,
  type AccountUuid,
  type Class,
  type Doc,
  type MeasureContext,
  type Ref,
  systemAccountUuid,
  type Tx,
  TxFactory,
  type Type,
  type WorkspaceUuid
} from '@hcengineering/core'
import hr from '@hcengineering/hr'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getEmbeddedLabel } from '@hcengineering/platform'
import request from '@hcengineering/request'
import { getAccountClient } from '@hcengineering/server-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { LEAVE_APPROVAL_ATTR, RESOURCE_CLASS } from '@servone/approvals'

import config from '../config'
import type { RequestHandler } from '../router'
import { authenticate } from '../webhooks/auth'
import { getWorkspaceClient, listActiveWorkspaces } from '../workspaces'
import { type ApprovalClient, expireBookings, onTx } from './engine'
import { createApprovalsHandler } from './http'

const txFactory = new TxFactory(core.account.System)
// Bookings expire at their start; a minute late is within what a booker notices.
const EXPIRY_TICK_MS = 60_000
const stringType: Type<string> = { _class: core.class.TypeString, label: core.string.String }

const ATTRIBUTES: Array<{ attributeOf: Ref<Class<Doc>>, name: string, label: string, hidden: boolean }> = [
  { attributeOf: request.class.Request, name: 'servoneAction', label: 'Action', hidden: true },
  { attributeOf: request.class.Request, name: 'servoneGate', label: 'Gate', hidden: true },
  { attributeOf: request.class.Request, name: 'servoneReturnTo', label: 'Return to', hidden: true },
  { attributeOf: request.class.Request, name: 'servoneReason', label: 'Lý do', hidden: false },
  { attributeOf: request.class.Request, name: 'servoneRoute', label: 'Route', hidden: true },
  { attributeOf: request.class.Request, name: 'servoneRouteFor', label: 'Route for', hidden: true },
  { attributeOf: request.class.Request, name: 'servoneResource', label: 'Resource', hidden: true },
  { attributeOf: hr.class.Request, name: LEAVE_APPROVAL_ATTR, label: 'Approval', hidden: true }
]

interface DocUpdateViewlet extends Doc {
  objectClass: Ref<Class<Doc>>
  action: 'create' | 'update'
  component: string
}

// Ids spelled out: @hcengineering/activity is not a dependency of this service.
const docUpdateViewletClass = 'activity:class:DocUpdateMessageViewlet' as Ref<Class<DocUpdateViewlet>>
// Registered client-side by installApprovals in packages/servone-ui/src/plugins/request-resources.
const APPROVAL_ACTIVITY = 'servone-approval:component:ApprovalActivity'
const VIEWLETS = (['create', 'update'] as const).map((action) => ({
  _id: `servone-approval:viewlet:${action}` as Ref<DocUpdateViewlet>,
  action
}))

// Without it the item's activity shows a request step as raw fields, e.g. "Status: Completed".
async function ensureActivityViewlets (client: ApprovalClient): Promise<void> {
  const existing = await client.findAll(docUpdateViewletClass, { _id: { $in: VIEWLETS.map(({ _id }) => _id) } })
  for (const { _id, action } of VIEWLETS) {
    if (existing.some((it) => it._id === _id)) continue
    await client.tx(
      txFactory.createTxCreateDoc(docUpdateViewletClass, core.space.Model, { objectClass: request.class.Request, action, component: APPROVAL_ACTIVITY }, _id)
    )
  }
}

async function ensureApprovalAttributes (client: ApprovalClient): Promise<void> {
  const existing = await client.findAll(core.class.Attribute, {
    attributeOf: { $in: [request.class.Request, hr.class.Request] },
    name: { $in: ATTRIBUTES.map(({ name }) => name) }
  })
  for (const attribute of ATTRIBUTES) {
    if (existing.some((it) => it.attributeOf === attribute.attributeOf && it.name === attribute.name)) continue
    await client.tx(
      txFactory.createTxCreateDoc(core.class.Attribute, core.space.Model, {
        attributeOf: attribute.attributeOf,
        name: attribute.name,
        label: getEmbeddedLabel(attribute.label),
        type: stringType,
        isCustom: true,
        hidden: attribute.hidden
      })
    )
  }
}

async function workspaceAdmins (workspace: WorkspaceUuid): Promise<AccountUuid[]> {
  const members = await getAccountClient(generateToken(systemAccountUuid, workspace, { service: config.approvals.ServiceId })).getWorkspaceMembers()
  const activeMembers = members.filter((member) => !member.disabled)
  const owners = activeMembers.filter((member) => member.role === AccountRole.Owner)
  const maintainers = activeMembers.filter((member) => member.role === AccountRole.Maintainer)
  return [...owners, ...maintainers].map((member) => member.person)
}

// Promises, so the consumer and the HTTP handler share one client and declare the attributes once.
const workspaces = new Map<WorkspaceUuid, Promise<ApprovalClient>>()

async function openWorkspace (workspace: WorkspaceUuid): Promise<ApprovalClient> {
  const cached = workspaces.get(workspace)
  if (cached !== undefined) return await cached
  const opening = (async () => {
    const rest = await getWorkspaceClient(config.approvals.ServiceId, workspace)
    const client: ApprovalClient = {
      findAll: rest.findAll.bind(rest),
      findOne: rest.findOne.bind(rest),
      tx: rest.tx.bind(rest),
      workspaceAdmins: async () => await workspaceAdmins(workspace)
    }
    await ensureApprovalAttributes(client)
    await ensureActivityViewlets(client)
    return client
  })()
  workspaces.set(workspace, opening)
  try {
    return await opening
  } catch (error) {
    workspaces.delete(workspace)
    throw error
  }
}

// Lịch creates the resource class on first use; a workspace without it has no bookings and no booking attributes to query.
async function expireAll (ctx: MeasureContext, now: number): Promise<void> {
  for (const workspace of await listActiveWorkspaces(config.approvals.ServiceId, now)) {
    try {
      const client = await openWorkspace(workspace.uuid)
      if ((await client.findOne(core.class.Class, { _id: RESOURCE_CLASS })) === undefined) continue
      await expireBookings(client, now)
    } catch (error) {
      // One broken workspace must not stop expiry for the rest; the next tick retries it.
      ctx.error('booking expiry failed', { workspace: workspace.uuid, error })
    }
  }
}

export function startApprovals (ctx: MeasureContext): () => Promise<void> {
  const queue = getPlatformQueue(config.approvals.ServiceId, config.approvals.QueueRegion)
  // A throw makes the queue retry the same message with backoff; onTx is safe to repeat.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (_ctx, message) => {
    await onTx(await openWorkspace(message.workspace), message.value)
  })
  // A slow pass is skipped over, never run twice at once.
  let isExpiring = false
  const timer = setInterval(() => {
    if (isExpiring) return
    isExpiring = true
    expireAll(ctx, Date.now())
      .catch((error) => {
        ctx.error('booking expiry failed', { error })
      })
      .finally(() => {
        isExpiring = false
      })
  }, EXPIRY_TICK_MS)
  return async () => {
    clearInterval(timer)
    await consumer.close()
  }
}

export function createApprovals (): RequestHandler {
  return createApprovalsHandler({
    frontUrl: config.FrontUrl,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    client: openWorkspace
  })
}
