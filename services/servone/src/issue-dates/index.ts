// Keeps the hidden servoneStartedOn / servoneCompletedOn / servoneRespondedOn dates that Insights and the helpdesk SLA read.
// Reads the transactor's `tx` topic because the stock transactor cannot load a Servone trigger.
import { createRestClient, type RestClient } from '@hcengineering/api-client'
import core, {
  type Doc,
  type MeasureContext,
  type Ref,
  type Status,
  systemAccountUuid,
  type Tx,
  type TxCUD,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import tracker from '@hcengineering/tracker'

import config from '../config'
import { backfillIssueDates } from './backfill'
import { datesUpdate, planDates, type DatesUpdate, type StatusKind } from './dates'
import { readStatusTx, type StatusTx } from './history'
import {
  datedIssueClass,
  ensureDateAttributes,
  loadSettledDates,
  loadStatusKinds,
  storedDates,
  writeDates,
  type StatusKinds
} from './store'

interface DatesWorkspace {
  client: RestClient
  kinds: StatusKinds
}

// Promises, so the backfill and the consumer share one client and declare the attributes once.
const workspaces = new Map<WorkspaceUuid, Promise<DatesWorkspace>>()
const backfills = new Set<WorkspaceUuid>()

async function connect (workspace: WorkspaceUuid): Promise<DatesWorkspace> {
  const token = generateToken(systemAccountUuid, workspace, { service: config.issueDates.ServiceId })
  const endpoint = await getTransactorEndpoint(token)
  const client = createRestClient(endpoint, workspace, token)
  await ensureDateAttributes(client)
  return { client, kinds: await loadStatusKinds(client) }
}

async function openWorkspace (workspace: WorkspaceUuid): Promise<DatesWorkspace> {
  const cached = workspaces.get(workspace)
  if (cached !== undefined) return await cached
  const opening = connect(workspace)
  workspaces.set(workspace, opening)
  try {
    return await opening
  } catch (error) {
    workspaces.delete(workspace)
    throw error
  }
}

// A status created after the cache was filled may reach us before its own tx does.
async function kindOf (opened: DatesWorkspace, status: Ref<Status>): Promise<StatusKind> {
  if (!opened.kinds.has(status)) opened.kinds = await loadStatusKinds(opened.client)
  return opened.kinds.get(status) ?? 'todo'
}

function isStatusDocTx (tx: Tx): boolean {
  const { objectClass } = tx as TxCUD<Doc>
  return objectClass === tracker.class.IssueStatus || objectClass === core.class.Status
}

async function applyStatusTx (opened: DatesWorkspace, statusTx: StatusTx): Promise<void> {
  const issue = await opened.client.findOne(datedIssueClass, { _id: statusTx.issue })
  if (issue === undefined) return
  const stored = storedDates(issue)
  const current = await kindOf(opened, issue.status)
  const plan = planDates(stored, current, { kind: await kindOf(opened, statusTx.status), at: statusTx.at })
  let update: DatesUpdate | undefined
  if (plan.kind === 'write') {
    update = plan.update
  } else if (plan.kind === 'history') {
    const [{ settled }] = await loadSettledDates(opened.client, opened.kinds, [issue])
    update = datesUpdate(stored, settled.dates)
  }
  if (update !== undefined) await writeDates(opened.client, issue, update)
}

// Once per workspace per process, beside the consumer, so live dates never wait on history reads.
function startBackfill (ctx: MeasureContext, workspace: WorkspaceUuid): void {
  if (backfills.has(workspace)) return
  backfills.add(workspace)
  openWorkspace(workspace)
    .then(async (opened) => {
      await backfillIssueDates(ctx, opened.client, opened.kinds)
    })
    .catch((error) => {
      // The workspace's next message tries again.
      backfills.delete(workspace)
      ctx.error('issue-dates: backfill failed', { workspace, error })
    })
}

export function startIssueDates (ctx: MeasureContext): () => Promise<void> {
  const queue = getPlatformQueue(config.issueDates.ServiceId, config.issueDates.QueueRegion)

  // A throw makes the queue retry the same message with backoff, so a transactor restart loses nothing.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (ctx, message) => {
    startBackfill(ctx, message.workspace)
    const tx = message.value
    if (isStatusDocTx(tx)) {
      const opened = await openWorkspace(message.workspace)
      opened.kinds = await loadStatusKinds(opened.client)
      return
    }
    const statusTx = readStatusTx(tx)
    if (statusTx === undefined) return
    await applyStatusTx(await openWorkspace(message.workspace), statusTx)
  })
  return async () => {
    await consumer.close()
  }
}
