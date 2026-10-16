import { type MeasureContext, systemAccountUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'
import { randomBytes } from 'crypto'

import config from '../config'
import { pathSegments } from '../http-json'
import { createWorkspaceClients } from '../mail/clients'
import { parseGoogleClient } from '../mail/oauth'
import { createCollabText } from '../mcp/collab'
import type { RequestHandler } from '../router'
import { authenticate, type Caller } from '../webhooks/auth'
import { funnelEvent, trackFunnel } from '../funnel'
import { createConnectHandler } from './connect/http'
import { buildProviders } from './connect/providers'
import { Connections, Consents } from './connect/store'
import { createImportHandler } from './http'
import { loadPeople } from './people'
import { type ImportSession, runImport } from './write'

const SWEEP_INTERVAL_MS = 5 * 60_000

export function createImport (ctx: MeasureContext): RequestHandler {
  const clients = createWorkspaceClients(config.ServiceId)

  async function openSession (caller: Caller): Promise<ImportSession> {
    const client = await clients(caller.workspace)
    const people = await loadPeople(client)
    const me = people.byAccount(caller.account)
    if (me?.socialId === undefined) throw new Error(`No person with a social id for account ${caller.account}`)
    const token = generateToken(systemAccountUuid, caller.workspace, { service: config.ServiceId })
    return {
      client,
      collab: createCollabText(caller.workspace, token, config.mcp.CollaboratorUrl),
      caller: { account: caller.account, person: me.person, socialId: me.socialId },
      people,
      now: Date.now
    }
  }

  const report = (event: string, fields: Record<string, string>): void => {
    ctx.error(event, fields)
  }
  const random = (bytes: number): string => randomBytes(bytes).toString('base64url')
  const consents = new Consents(Date.now, random)
  const connections = new Connections(Date.now, random)
  setInterval(() => {
    consents.sweep()
    connections.sweep()
  }, SWEEP_INTERVAL_MS).unref()

  const handleImport = createImportHandler({
    frontUrl: config.FrontUrl,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    run: async (caller, request) => {
      const reply = await runImport(await openSession(caller), request)
      if (request.op === 'project' || request.op === 'channel' || request.op === 'teamspace') {
        trackFunnel(ctx, { event: funnelEvent.ImportStarted, workspace: caller.workspace, account: caller.account, properties: { op: request.op } })
      }
      return reply
    },
    report
  })
  const handleConnect = createConnectHandler({
    frontUrl: config.FrontUrl,
    publicUrl: config.PublicUrl,
    providers: buildProviders({
      ...config.importConnect,
      Google: config.mail.GoogleCredentials === undefined ? undefined : parseGoogleClient(config.mail.GoogleCredentials)
    }),
    consents,
    connections,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    fetch,
    now: Date.now,
    random,
    report
  })
  return async (req, res) => {
    if (pathSegments(req.url)?.[2] === 'connect') {
      await handleConnect(req, res)
      return
    }
    await handleImport(req, res)
  }
}
