import config from '../config'
import { createWorkspaceClients } from '../mail/clients'
import type { RequestHandler } from '../router'
import { authenticate } from '../webhooks/auth'
import { TokenBuckets } from '../webhooks/rate'
import { ensureFormAttributes } from '@servone/forms'
import type { WorkspaceUuid } from '@hcengineering/core'
import { createWorkflow } from './create'
import { moveFirstStatusesToNotStarted } from './first-status'
import { createWorkflowsHandler } from './http'
import { ensureWorkflowSetup } from './setup'

// The client posts setup once per session; a few retries cover reloads, a loop does not get through.
const SETUP_BURST = 5
const SETUP_REFILL_PER_SECOND = 1 / 60

export function createWorkflows (): RequestHandler {
  const clients = createWorkspaceClients(config.ServiceId)
  // Once per workspace per process; a failed run is dropped so the next setup call retries it.
  const firstStatusFixes = new Map<WorkspaceUuid, Promise<void>>()
  const fixFirstStatuses = async (workspace: WorkspaceUuid): Promise<void> => {
    let fix = firstStatusFixes.get(workspace)
    if (fix === undefined) {
      fix = clients(workspace).then(moveFirstStatusesToNotStarted)
      firstStatusFixes.set(workspace, fix)
    }
    try {
      await fix
    } catch (error) {
      firstStatusFixes.delete(workspace)
      throw error
    }
  }
  return createWorkflowsHandler({
    frontUrl: config.FrontUrl,
    buckets: new TokenBuckets(SETUP_BURST, SETUP_REFILL_PER_SECOND),
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    setup: async (caller) => {
      await ensureWorkflowSetup(await clients(caller.workspace))
      await fixFirstStatuses(caller.workspace)
    },
    create: async (caller, body) => {
      const client = await clients(caller.workspace)
      await ensureFormAttributes(client)
      return await createWorkflow(client, caller.account, body)
    }
  })
}
