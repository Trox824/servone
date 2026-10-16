import { AccountRole, roleOrder } from '@hcengineering/core'
import { readBody } from '../http-body'
import { corsHeaders, type Json, jsonReply, sendJson } from '../http-json'
import type { RequestHandler } from '../router'
import type { Caller } from '../webhooks/auth'
import type { TokenBuckets } from '../webhooks/rate'
import type { CreateOutcome } from './create'

const PREFLIGHT_MAX_AGE_SECONDS = 600
// A create body is four short fields; the name alone is capped at 100 chars.
const MAX_CREATE_BODY_BYTES = 4096

export interface WorkflowsHttpDeps {
  frontUrl: string
  buckets: TokenBuckets
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  setup: (caller: Caller) => Promise<void>
  create: (caller: Caller, body: Json) => Promise<CreateOutcome>
}

// A body that is missing, too large or not JSON reads as null, which create refuses as invalid_name.
function parseBody (text: string | undefined): Json {
  if (text === undefined) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export function createWorkflowsHandler (deps: WorkflowsHttpDeps): RequestHandler {
  return async (req, res) => {
    const cors = corsHeaders(req, deps.frontUrl)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
      })
      res.end()
      return
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (req.method !== 'POST' || (path !== '/workflows/setup' && path !== '/workflows')) {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) {
      sendJson(res, jsonReply(401, { error: 'unauthorized' }), cors)
      return
    }
    const decision = deps.buckets.take(caller.account, deps.now())
    if (!decision.isAllowed) {
      sendJson(res, jsonReply(429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) }), cors)
      return
    }
    if (path === '/workflows/setup') {
      await deps.setup(caller)
      sendJson(res, jsonReply(200, { isOk: true }), cors)
      return
    }
    if (roleOrder[caller.role] < roleOrder[AccountRole.User]) {
      sendJson(res, jsonReply(403, { error: 'forbidden' }), cors)
      return
    }
    const outcome = await deps.create(caller, parseBody(await readBody(req, MAX_CREATE_BODY_BYTES)))
    sendJson(res, jsonReply('error' in outcome ? 400 : 200, outcome), cors)
  }
}
