import type { Person } from '@hcengineering/contact'
import type { Ref, WorkspaceUuid } from '@hcengineering/core'
import { readBody } from '../http-body'
import { corsHeaders, jsonReply, pathSegments, sendJson } from '../http-json'
import type { RequestHandler } from '../router'
import type { Caller } from '../webhooks/auth'
import { type ApprovalClient, type ApprovalRequest, decide, type Decision, type DecisionRefusal } from './engine'

const PREFLIGHT_MAX_AGE_SECONDS = 600
// A reject body is one reason; a few paragraphs fit.
const MAX_BODY_BYTES = 8192
const DECISIONS: readonly Decision[] = ['approve', 'reject', 'withdraw']

const REFUSAL_STATUS: Record<DecisionRefusal, number> = {
  not_found: 404,
  not_active: 409,
  not_approver: 403,
  not_submitter: 403,
  reason_too_short: 400,
  bad_next: 400
}

export interface ApprovalsHttpDeps {
  frontUrl: string
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  client: (workspace: WorkspaceUuid) => Promise<ApprovalClient>
}

interface DecisionBody {
  reason: string
  next?: Ref<Person>
}

// Anything but a JSON object with a string reason reads as no reason, which only reject refuses.
function readDecisionBody (text: string | undefined): DecisionBody {
  if (text === undefined) return { reason: '' }
  try {
    const body = JSON.parse(text)
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    return typeof body?.next === 'string' ? { reason, next: body.next } : { reason }
  } catch (error) {
    if (error instanceof SyntaxError) return { reason: '' }
    throw error
  }
}

function isDecision (segment: string | undefined): segment is Decision {
  return DECISIONS.some((decision) => decision === segment)
}

export function createApprovalsHandler (deps: ApprovalsHttpDeps): RequestHandler {
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
    const [root, area, id, decision, ...rest] = pathSegments(req.url) ?? []
    if (req.method !== 'POST' || root !== 'v1' || area !== 'approvals' || id === undefined || !isDecision(decision) || rest.length > 0) {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) {
      sendJson(res, jsonReply(401, { error: 'unauthorized' }), cors)
      return
    }
    const { reason, next } = readDecisionBody(await readBody(req, MAX_BODY_BYTES))
    const client = await deps.client(caller.workspace)
    const refusal = await decide(client, caller.account, id as Ref<ApprovalRequest>, decision, reason, next)
    if (refusal !== undefined) {
      sendJson(res, jsonReply(REFUSAL_STATUS[refusal], { error: refusal }), cors)
      return
    }
    sendJson(res, jsonReply(200, { isOk: true }), cors)
  }
}
