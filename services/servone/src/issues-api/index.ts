// JSON REST API for tracker issues, authorised by the same workspace API tokens as MCP and signed as their owner.
import { type MeasureContext, systemAccountUuid } from '@hcengineering/core'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import { authenticate } from '../mcp/auth'
import { createSessionCache, openSession } from '../mcp/session'
import type { Caller } from '../mcp/types'
import type { RequestHandler } from '../router'
import { TokenBuckets } from '../webhooks/rate'
import { Idempotency, KVS_NAMESPACE } from './idempotency'
import { createRequestHandler } from './server'

// One token is one integration; Zapier bulk steps burst, then 60 calls a minute sustained.
const API_BURST = 30
const API_REFILL_PER_SECOND = 1

export function createIssuesApi (ctx: MeasureContext): RequestHandler {
  // The system token only reaches hulykvs for idempotency records; workspace data is read with the caller's token.
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: config.issuesApi.ServiceId })
  return createRequestHandler({
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    session: createSessionCache<Caller>(openSession, (caller) => caller.apiTokenId, Date.now),
    buckets: new TokenBuckets(API_BURST, API_REFILL_PER_SECOND),
    idempotency: new Idempotency(getKvsClient(KVS_NAMESPACE, config.KvsUrl, kvsToken), Date.now),
    now: Date.now,
    report: (event, fields) => {
      ctx.info(event, fields)
    }
  })
}
