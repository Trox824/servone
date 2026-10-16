import type { IncomingMessage, ServerResponse } from 'http'
import { clientIpOf } from './ip-limit'
import { jsonReply, sendJson } from './http-json'
import { TokenBuckets } from './webhooks/rate'

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

export interface ModuleHandlers {
  mcp: RequestHandler
  webhooks: RequestHandler
  issuesApi: RequestHandler
  trackerHooks: RequestHandler
  chatHooks: RequestHandler
  chatCommands: RequestHandler
  forms: RequestHandler
  unsubscribe: RequestHandler
  webPush: RequestHandler
  mail: RequestHandler
  workflows: RequestHandler
  approvals: RequestHandler
  import: RequestHandler
  bugReport: RequestHandler
  lifecycle: RequestHandler
}

// Generous enough for an office behind one NAT; the strict set is for unauthenticated endpoints worth abusing.
const GENERAL_BURST = 120
const GENERAL_REFILL_PER_SECOND = 20
const STRICT_BURST = 20
const STRICT_REFILL_PER_SECOND = 0.5

// /health is polled by Railway and /web-push has one caller (the transactor) behind its own bearer gate.
const UNLIMITED_ROOTS = new Set(['health', 'web-push'])

function isStrict (method: string | undefined, root: string, area: string): boolean {
  return root === 'oauth' || root === 'unsubscribe' || (root === 'forms' && method === 'POST' && area !== 'templates')
}

// Every module keeps the root paths it had as its own service: hook URLs, unsubscribe links, the transactor's
// WEB_PUSH_URL and OAuth clients all hold them. MCP owns the rest (/mcp, /health, /.well-known, /oauth).
export function createRouter (handlers: ModuleHandlers, now: () => number = Date.now): RequestHandler {
  const generalBuckets = new TokenBuckets(GENERAL_BURST, GENERAL_REFILL_PER_SECOND)
  const strictBuckets = new TokenBuckets(STRICT_BURST, STRICT_REFILL_PER_SECOND)
  return async (req, res) => {
    const [, root, area, resource] = new URL(req.url ?? '/', 'http://localhost').pathname.split('/')
    if (!UNLIMITED_ROOTS.has(root)) {
      const buckets = isStrict(req.method, root, area) ? strictBuckets : generalBuckets
      const decision = buckets.take(clientIpOf(req), now())
      if (!decision.isAllowed) {
        sendJson(res, jsonReply(429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) }), {})
        return
      }
    }
    if (root === 'v1' && area === 'tracker' && resource === 'issues') {
      await handlers.issuesApi(req, res)
      return
    }
    if (root === 'v1' && area === 'tracker') {
      await handlers.trackerHooks(req, res)
      return
    }
    if (root === 'v1' && area === 'chat' && resource === 'hooks') {
      await handlers.chatHooks(req, res)
      return
    }
    if (root === 'v1' && area === 'chat' && resource === 'commands') {
      await handlers.chatCommands(req, res)
      return
    }
    if (root === 'v1' && area === 'approvals') {
      await handlers.approvals(req, res)
      return
    }
    if (root === 'v1' && area === 'bug-report') {
      await handlers.bugReport(req, res)
      return
    }
    if (root === 'v1' && area === 'lifecycle') {
      await handlers.lifecycle(req, res)
      return
    }
    if (root === 'v1' && area === 'import') {
      await handlers.import(req, res)
      return
    }
    if (root === 'v1') {
      await handlers.webhooks(req, res)
      return
    }
    if (root === 'forms') {
      await handlers.forms(req, res)
      return
    }
    if (root === 'unsubscribe') {
      await handlers.unsubscribe(req, res)
      return
    }
    if (root === 'web-push') {
      await handlers.webPush(req, res)
      return
    }
    if (root === 'mail') {
      await handlers.mail(req, res)
      return
    }
    if (root === 'workflows') {
      await handlers.workflows(req, res)
      return
    }
    await handlers.mcp(req, res)
  }
}
