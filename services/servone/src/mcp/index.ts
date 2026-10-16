// Remote MCP server: lets LLM clients use a Servone workspace as the user who owns the API token.
import { type MeasureContext, systemAccountUuid } from '@hcengineering/core'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import type { RequestHandler } from '../router'
import { authenticate } from './auth'
import { createStudioChat } from './chat'
import { fetchClientMetadata } from './oauth/clients'
import { randomId } from './oauth/pkce'
import { createOAuthRoutes } from './oauth/routes'
import { OAUTH_KVS_NAMESPACE, OAuthStore } from './oauth/store'
import { createRequestHandler } from './server'
import { createSessionCache, openSession } from './session'
import { ALL_TOOLS } from './tools'
import type { Caller } from './types'

export function createMcp (ctx: MeasureContext): RequestHandler {
  // The system token only reaches hulykvs for OAuth state; workspace data is always read with the caller's token.
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: config.mcp.ServiceId })
  const store = new OAuthStore(getKvsClient(OAUTH_KVS_NAMESPACE, config.KvsUrl, kvsToken))

  const authenticateNow = async (authorization: string | undefined): Promise<Caller | undefined> =>
    await authenticate(authorization, Date.now())
  const report = (event: string, fields: Record<string, string | number>): void => {
    ctx.info(event, fields)
  }

  const oauthRoutes = createOAuthRoutes({
    publicUrl: config.PublicUrl,
    frontUrl: config.FrontUrl,
    store,
    authenticate: authenticateNow,
    fetchClientMetadata,
    now: Date.now,
    randomId
  })
  const studioChat = createStudioChat(report)

  return createRequestHandler({
    publicUrl: config.PublicUrl,
    tools: ALL_TOOLS,
    authenticate: authenticateNow,
    session: createSessionCache<Caller>(openSession, (caller) => caller.apiTokenId, Date.now),
    extraRoutes: async (req, res, path) => (await oauthRoutes(req, res, path)) || (await studioChat(req, res, path)),
    report
  })
}
