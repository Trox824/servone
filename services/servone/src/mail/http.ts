import type { IncomingMessage, ServerResponse } from 'http'
import { types } from 'util'
import { readBody } from '../http-body'
import type { Json } from '../http-json'
import type { RequestHandler } from '../router'
import { TrackerInputError } from '../tracker/issues'
import type { Caller } from '../webhooks/auth'
import { TokenBuckets } from '../webhooks/rate'
import { type ConnectRequest, parseConnectRequest } from './requests'
import type { LoginOutcome } from './supervisor'
import { parseTaskRequest, type TaskRequest } from './task'

// Connect bodies are a few fields; anything larger is not ours.
const MAX_BODY_BYTES = 8 * 1024
const PREFLIGHT_MAX_AGE_SECONDS = 600
// A person sends a few mails a minute; a loop probing draft ids, or spamming through the user's SMTP, is not.
const SEND_BURST = 10
const SEND_REFILL_PER_SECOND = 1 / 10
// j/k prefetch asks for about one body per keypress; a burst covers holding j down through a page.
const BODY_BURST = 30
const BODY_REFILL_PER_SECOND = 1
// The composer autosaves on every 5 s pause; this must never compete with /mail/send for the same bucket.
const DRAFT_BURST = 12
const DRAFT_REFILL_PER_SECOND = 1 / 5
// Triaging a morning inbox into several tasks in a minute is normal use, not abuse.
const TASK_BURST = 15
const TASK_REFILL_PER_SECOND = 1 / 10

export interface MailHttpDeps {
  frontUrl: string
  buckets: TokenBuckets
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  checkLogin: (request: ConnectRequest) => Promise<LoginOutcome>
  connect: (caller: Caller, request: ConnectRequest) => Promise<{ account: string } | { error: 'already_connected' | 'removing' }>
  reconnect: (caller: Caller, request: ConnectRequest) => Promise<{ account: string } | { error: 'not_found' | 'mailbox_mismatch' | 'removing' } | LoginOutcome>
  disconnect: (caller: Caller, shouldDeleteMail: boolean) => Promise<void>
  send: (caller: Caller, draft: string) => Promise<{ messageId: string } | { error: 'not_connected' | 'not_found' }>
  saveDraft: (caller: Caller, draft: string) => Promise<{ isOk: true } | { error: 'not_connected' | 'not_found' }>
  fetchBody: (caller: Caller, message: string) => Promise<{ isOk: true } | { error: 'not_connected' | 'not_found' }>
  startOAuth: (caller: Caller) => { url: string } | { error: 'oauth_unavailable' }
  completeOAuth: (state: string, code: string) => Promise<{ isOk: true } | { isOk: false, reason: 'expired' | 'already_connected' | 'removing' }>
  setup: (caller: Caller) => Promise<void>
  createTask: (caller: Caller, authorization: string, request: TaskRequest) => Promise<{ issue: string, identifier: string } | { error: 'not_found' | 'invalid_message' }>
  // Fields must never carry the password or the request body.
  report: (event: string, fields: Record<string, string | number>) => void
}

function write (res: ServerResponse, frontUrl: string, status: number, body: Json, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': frontUrl,
    Vary: 'Origin',
    ...headers
  })
  res.end(JSON.stringify(body))
}

async function readJson (req: IncomingMessage): Promise<Json | undefined> {
  const text = await readBody(req, MAX_BODY_BYTES)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function stringField (body: Json | undefined, name: string): string | undefined {
  const field = typeof body === 'object' && body !== null && !Array.isArray(body) ? body[name] : undefined
  return typeof field === 'string' && field !== '' ? field : undefined
}

export function createMailHandler (deps: MailHttpDeps): RequestHandler {
  const sendBuckets = new TokenBuckets(SEND_BURST, SEND_REFILL_PER_SECOND)
  const bodyBuckets = new TokenBuckets(BODY_BURST, BODY_REFILL_PER_SECOND)
  const draftBuckets = new TokenBuckets(DRAFT_BURST, DRAFT_REFILL_PER_SECOND)
  const taskBuckets = new TokenBuckets(TASK_BURST, TASK_REFILL_PER_SECOND)
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    // Google sends the browser here, so the answer is a redirect back to the app, never JSON.
    if (req.method === 'GET' && path === '/mail/oauth/callback') {
      const state = url.searchParams.get('state') ?? ''
      const code = url.searchParams.get('code') ?? ''
      const outcome = state === '' || code === '' ? { isOk: false, reason: 'denied' } : await deps.completeOAuth(state, code)
      deps.report('mail oauth callback', { outcome: outcome.isOk ? 'ok' : outcome.reason })
      const back = new URL(deps.frontUrl)
      back.searchParams.set('mail', outcome.isOk ? 'connected' : outcome.reason)
      res.writeHead(302, { Location: back.toString() })
      res.end()
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': deps.frontUrl,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS),
        Vary: 'Origin'
      })
      res.end()
      return
    }
    if (req.method !== 'POST') { write(res, deps.frontUrl, 404, { error: 'not_found' }); return }
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) { write(res, deps.frontUrl, 401, { error: 'unauthorized' }); return }
    const body = await readJson(req)
    if (body === undefined) { write(res, deps.frontUrl, 400, { error: 'invalid_body' }); return }

    if (path === '/mail/test' || path === '/mail/connect') {
      const decision = deps.buckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const parsed = parseConnectRequest(body)
      if ('error' in parsed) { write(res, deps.frontUrl, 400, { error: parsed.error }); return }
      const check = await deps.checkLogin(parsed)
      deps.report('mail login check', { account: caller.account, provider: parsed.provider, outcome: check.isOk ? 'ok' : check.reason })
      if (!check.isOk || path === '/mail/test') { write(res, deps.frontUrl, 200, check); return }
      const connected = await deps.connect(caller, parsed)
      if ('error' in connected) { write(res, deps.frontUrl, 409, connected); return }
      write(res, deps.frontUrl, 200, connected)
      return
    }
    if (path === '/mail/reconnect') {
      // Shares /mail/connect's bucket: a reconnect attempt is a login attempt like any other.
      const decision = deps.buckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const parsed = parseConnectRequest(body)
      if ('error' in parsed) { write(res, deps.frontUrl, 400, { error: parsed.error }); return }
      const reconnected = await deps.reconnect(caller, parsed)
      if ('error' in reconnected) {
        deps.report('mail reconnect', { account: caller.account, outcome: reconnected.error })
        write(res, deps.frontUrl, reconnected.error === 'not_found' ? 404 : reconnected.error === 'removing' ? 409 : 400, reconnected)
        return
      }
      deps.report('mail reconnect', { account: caller.account, outcome: 'account' in reconnected ? 'ok' : reconnected.reason })
      write(res, deps.frontUrl, 200, reconnected)
      return
    }
    if (path === '/mail/oauth/start') {
      const decision = deps.buckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const started = deps.startOAuth(caller)
      write(res, deps.frontUrl, 'error' in started ? 404 : 200, started)
      return
    }
    if (path === '/mail/setup') {
      const decision = deps.buckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      await deps.setup(caller)
      write(res, deps.frontUrl, 200, { isOk: true })
      return
    }
    if (path === '/mail/disconnect') {
      const shouldDeleteMail = typeof body === 'object' && body !== null && !Array.isArray(body) ? body.deleteMail !== false : true
      await deps.disconnect(caller, shouldDeleteMail)
      deps.report('mail disconnected', { account: caller.account })
      write(res, deps.frontUrl, 200, { isOk: true })
      return
    }
    if (path === '/mail/send') {
      const decision = sendBuckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const draft = stringField(body, 'draft')
      if (draft === undefined) { write(res, deps.frontUrl, 400, { error: 'invalid_draft' }); return }
      const sent = await deps.send(caller, draft)
      write(res, deps.frontUrl, 'error' in sent ? 404 : 200, sent)
      return
    }
    if (path === '/mail/draft') {
      const decision = draftBuckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const draft = stringField(body, 'draft')
      if (draft === undefined) { write(res, deps.frontUrl, 400, { error: 'invalid_draft' }); return }
      const saved = await deps.saveDraft(caller, draft)
      write(res, deps.frontUrl, 'error' in saved ? 404 : 200, saved)
      return
    }
    if (path === '/mail/body') {
      const decision = bodyBuckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const message = stringField(body, 'message')
      if (message === undefined) { write(res, deps.frontUrl, 400, { error: 'invalid_message' }); return }
      const fetched = await deps.fetchBody(caller, message)
      write(res, deps.frontUrl, 'error' in fetched ? 404 : 200, fetched)
      return
    }
    if (path === '/mail/task') {
      const decision = taskBuckets.take(caller.account, deps.now())
      if (!decision.isAllowed) {
        write(res, deps.frontUrl, 429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
        return
      }
      const parsed = parseTaskRequest(body)
      if ('error' in parsed) { write(res, deps.frontUrl, 400, { error: parsed.error }); return }
      try {
        const created = await deps.createTask(caller, req.headers.authorization ?? '', parsed)
        const status = !('error' in created) ? 200 : created.error === 'not_found' ? 404 : 400
        write(res, deps.frontUrl, status, created)
      } catch (error) {
        // An unresolvable project or the like is the caller's mistake, not a server failure.
        if (!(error instanceof TrackerInputError)) throw error
        write(res, deps.frontUrl, 400, { error: error.reason, field: error.field, message: error.message })
      }
      return
    }
    write(res, deps.frontUrl, 404, { error: 'not_found' })
  }
  return async (req, res) => {
    try {
      await handle(req, res)
    } catch (error) {
      // Only the error class and code leave here: messages from IMAP/SMTP libraries can quote the login exchange.
      const code = types.isNativeError(error) ? Reflect.get(error, 'code') : undefined
      deps.report('mail request failed', {
        path: new URL(req.url ?? '/', 'http://localhost').pathname,
        error: types.isNativeError(error) ? error.name : 'unknown',
        code: typeof code === 'string' ? code : ''
      })
      if (res.headersSent) { res.end(); return }
      write(res, deps.frontUrl, 500, { error: 'internal_error' })
    }
  }
}
