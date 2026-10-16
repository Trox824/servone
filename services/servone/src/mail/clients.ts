import { createRestTxOperations } from '@hcengineering/api-client'
import core, { systemAccountUuid, TxOperations, type WorkspaceUuid } from '@hcengineering/core'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'

export type WorkspaceClients = (workspace: WorkspaceUuid) => Promise<TxOperations>

// One REST client per workspace, shared by the IMAP sessions and the purge worker; a failed open is retried on the next call.
export function createWorkspaceClients (serviceId: string): WorkspaceClients {
  const clients = new Map<WorkspaceUuid, Promise<TxOperations>>()
  return async (workspace) => {
    let pending = clients.get(workspace)
    if (pending === undefined) {
      pending = (async () => {
        const token = generateToken(systemAccountUuid, workspace, { service: serviceId })
        const base = await createRestTxOperations(await getTransactorEndpoint(token, 'internal'), workspace, token, true)
        return new TxOperations(base.client, core.account.System)
      })()
      clients.set(workspace, pending)
    }
    try {
      return await pending
    } catch (error) {
      clients.delete(workspace)
      throw error
    }
  }
}
