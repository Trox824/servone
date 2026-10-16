import { createRestClient, createRestTxOperations } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import { TxOperations } from '@hcengineering/core'
import { getTransactorEndpoint } from '@hcengineering/server-client'

import { createCollabText } from './collab'
import config from '../config'
import type { Caller, WorkspaceSession } from './types'

// Model load is the expensive part of a session; cache per credential briefly.
export const SESSION_TTL_MS = 10 * 60_000
export const SESSION_CACHE_LIMIT = 200

export type SessionOpening = Pick<Caller, 'token' | 'workspace'>

interface CachedSession {
  session: Promise<WorkspaceSession>
  openedAt: number
}

// Callers must authenticate before every lookup: the cache never re-checks revocation.
export function createSessionCache<C> (
  open: (caller: C) => Promise<WorkspaceSession>,
  keyOf: (caller: C) => string,
  now: () => number
): (caller: C) => Promise<WorkspaceSession> {
  const sessions = new Map<string, CachedSession>()
  return async (caller) => {
    const key = keyOf(caller)
    const cached = sessions.get(key)
    if (cached !== undefined && now() - cached.openedAt < SESSION_TTL_MS) return await cached.session
    sessions.delete(key)

    const entry: CachedSession = { session: open(caller), openedAt: now() }
    sessions.set(key, entry)
    if (sessions.size > SESSION_CACHE_LIMIT) {
      const oldest = sessions.keys().next()
      if (oldest.done !== true) sessions.delete(oldest.value)
    }
    try {
      return await entry.session
    } catch (error) {
      if (sessions.get(key) === entry) sessions.delete(key)
      throw error
    }
  }
}

export async function openSession (caller: SessionOpening): Promise<WorkspaceSession> {
  const endpoint = await getTransactorEndpoint(caller.token, 'internal')
  const rest = createRestClient(endpoint, caller.workspace, caller.token)
  const base = await createRestTxOperations(endpoint, caller.workspace, caller.token, true)
  const account = await rest.getAccount()
  // createRestTxOperations signs with socialIds[0]; the app attributes writes to the primary social id.
  const client = new TxOperations(base.client, account.primarySocialId)
  const person = await rest.findOne(contact.class.Person, { personUuid: account.uuid })
  if (person === undefined) throw new Error(`No person for account ${account.uuid}`)
  return {
    workspace: caller.workspace,
    account,
    person: person._id,
    client,
    rest,
    collab: createCollabText(caller.workspace, caller.token, config.mcp.CollaboratorUrl)
  }
}
