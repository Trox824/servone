import { generateId, type Ref } from '@hcengineering/core'
import type { ChatMessage } from '@hcengineering/chunter'
import { PlatformError } from '@hcengineering/platform'
import tracker, { type Issue } from '@hcengineering/tracker'
import { WAITING_APPROVAL } from '@servone/approvals'
import type { Json } from '@servone/config'
import type { IncomingMessage, ServerResponse } from 'http'

import { readBody } from '../http-body'
import { CollabTimeoutError } from '../mcp/collab'
import { type Report, WAITING_APPROVAL_TEXT } from '../mcp/mcp'
import type { Caller, WorkspaceSession } from '../mcp/types'
import { commentOnIssue, createIssue, resolveIssue, TrackerInputError, updateIssue } from '../tracker/issues'
import { readComment, readIssue, type CommentView, type IssueView } from '../tracker/view'
import type { TokenBuckets } from '../webhooks/rate'
import { fingerprintOf, type Idempotency, type KeyedSteps } from './idempotency'
import {
  MAX_BODY_BYTES,
  parseCommentBody,
  parseCreateBody,
  parseIdempotencyKey,
  parsePatchBody,
  type Rejection
} from './request'
import { commentJson, issueJson } from './response'

const ISSUES_PATH = '/v1/tracker/issues'
const COLLAB_RETRY_SECONDS = 5
const IN_PROGRESS_RETRY_SECONDS = 1
const FAILED_TEXT = 'Servone could not complete this request. Try again later.'

export interface ServerDeps {
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  session: (caller: Caller) => Promise<WorkspaceSession>
  buckets: TokenBuckets
  idempotency: Idempotency
  now: () => number
  report: Report
}

interface Reply {
  status: number
  body: Json
  headers?: Record<string, string>
}

type Route = { name: 'issues' } | { name: 'issue', identifier: string } | { name: 'comments', identifier: string }

const ALLOWED_METHODS: Record<Route['name'], string[]> = {
  issues: ['POST'],
  issue: ['GET', 'PATCH'],
  comments: ['POST']
}

const reply = (status: number, body: Json, headers?: Record<string, string>): Reply =>
  headers === undefined ? { status, body } : { status, body, headers }

const NOT_FOUND = reply(404, { error: 'not_found' })
const UNAUTHORIZED = reply(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' })
const TOO_LARGE = reply(400, { error: 'too_large', field: 'body' }, { Connection: 'close' })
const REPLAYED = { 'Idempotent-Replayed': 'true' }

function rejected (rejection: Rejection): Reply {
  if (rejection.error === 'invalid_json') return reply(400, { error: rejection.error, message: rejection.message })
  return reply(400, { error: rejection.error, field: rejection.field, message: rejection.message })
}

function routeOf (url: string | undefined): Route | undefined {
  const parts = new URL(url ?? '/', 'http://localhost').pathname.split('/').filter((part) => part !== '')
  let segments: string[]
  try {
    segments = parts.map(decodeURIComponent)
  } catch (error) {
    if (error instanceof URIError) return undefined
    throw error
  }
  if (segments[0] !== 'v1' || segments[1] !== 'tracker' || segments[2] !== 'issues') return undefined
  if (segments.length === 3) return { name: 'issues' }
  if (segments.length === 4) return { name: 'issue', identifier: segments[3] }
  if (segments.length === 5 && segments[4] === 'comments') return { name: 'comments', identifier: segments[3] }
  return undefined
}

export function createRequestHandler (deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  async function keyed<T> (
    caller: Caller,
    key: string | undefined,
    fingerprint: string,
    steps: KeyedSteps<T>,
    created: (doc: T) => Reply
  ): Promise<Reply> {
    if (key === undefined) return created(await steps.create(generateId()))
    const outcome = await deps.idempotency.run(caller.apiTokenId, key, fingerprint, steps)
    switch (outcome.kind) {
      case 'created':
        return created(outcome.doc)
      case 'replayed': {
        const replayed = created(outcome.doc)
        return { ...replayed, headers: { ...replayed.headers, ...REPLAYED } }
      }
      case 'in_progress':
        return reply(409, { error: 'idempotency_in_progress' }, { 'Retry-After': String(IN_PROGRESS_RETRY_SECONDS) })
      case 'key_reused':
        return reply(422, {
          error: 'idempotency_key_reused',
          message: 'This Idempotency-Key was already used with a different request'
        })
    }
  }

  // Doc ids come from generateId, directly or through the stored idempotency record.
  async function issueById (session: WorkspaceSession, docId: string): Promise<IssueView | undefined> {
    const issue = await session.client.findOne(tracker.class.Issue, { _id: docId as Ref<Issue> })
    return issue === undefined ? undefined : await readIssue(session, issue)
  }

  async function postIssue (req: IncomingMessage, caller: Caller, key: string | undefined): Promise<Reply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const parsed = parseCreateBody(body)
    if (!parsed.isValid) return rejected(parsed)
    const session = await deps.session(caller)
    return await keyed(
      caller,
      key,
      fingerprintOf('POST', ISSUES_PATH, parsed.draft),
      {
        find: async (docId) => await issueById(session, docId),
        create: async (docId) => {
          const created = await createIssue(session, parsed.draft, docId as Ref<Issue>)
          const view = await issueById(session, created._id)
          if (view === undefined) throw new Error(`Created issue ${created.identifier} not found`)
          return view
        }
      },
      (view) => reply(201, issueJson(view), { Location: `${ISSUES_PATH}/${view.identifier}` })
    )
  }

  async function patchIssue (req: IncomingMessage, caller: Caller, identifier: string): Promise<Reply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const parsed = parsePatchBody(body)
    if (!parsed.isValid) return rejected(parsed)
    const session = await deps.session(caller)
    const issue = await resolveIssue(session, identifier)
    await updateIssue(session, issue, parsed.patch)
    const view = await issueById(session, issue._id)
    if (view === undefined) throw new Error(`Updated issue ${issue.identifier} not found`)
    return reply(200, issueJson(view))
  }

  async function postComment (req: IncomingMessage, caller: Caller, identifier: string, key: string | undefined): Promise<Reply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const parsed = parseCommentBody(body)
    if (!parsed.isValid) return rejected(parsed)
    const session = await deps.session(caller)
    const issue = await resolveIssue(session, identifier)
    return await keyed<CommentView>(
      caller,
      key,
      fingerprintOf('POST', `${ISSUES_PATH}/${issue.identifier}/comments`, { text: parsed.text }),
      {
        find: async (docId) => await readComment(session, docId as Ref<ChatMessage>),
        create: async (docId) => {
          const id = await commentOnIssue(session, issue, parsed.text, docId as Ref<ChatMessage>)
          const view = await readComment(session, id)
          if (view === undefined) throw new Error(`Comment ${id} on ${issue.identifier} not found`)
          return view
        }
      },
      (view) => reply(201, commentJson(view, issue.identifier))
    )
  }

  async function handle (req: IncomingMessage, route: Route): Promise<Reply> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return UNAUTHORIZED
    const decision = deps.buckets.take(caller.apiTokenId, deps.now())
    if (!decision.isAllowed) {
      return reply(429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
    }
    if (route.name === 'issue' && req.method === 'GET') {
      const session = await deps.session(caller)
      return reply(200, issueJson(await readIssue(session, await resolveIssue(session, route.identifier))))
    }
    if (route.name === 'issue') return await patchIssue(req, caller, route.identifier)

    const key = parseIdempotencyKey(req.headers['idempotency-key'])
    if (!key.isValid) return rejected(key)
    if (route.name === 'issues') return await postIssue(req, caller, key.key)
    return await postComment(req, caller, route.identifier, key.key)
  }

  function send (res: ServerResponse, answer: Reply): void {
    res.writeHead(answer.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...answer.headers
    })
    res.end(JSON.stringify(answer.body))
  }

  return async (req, res) => {
    const route = routeOf(req.url)
    if (route === undefined) {
      send(res, NOT_FOUND)
      return
    }
    const allowed = ALLOWED_METHODS[route.name]
    if (!allowed.includes(req.method ?? '')) {
      send(res, reply(405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') }))
      return
    }
    try {
      send(res, await handle(req, route))
    } catch (error) {
      if (error instanceof TrackerInputError) {
        const status = error.reason === 'not_found' ? 404 : 400
        send(res, reply(status, { error: error.reason, field: error.field, message: error.message }))
        return
      }
      if (error instanceof PlatformError && error.status.code === WAITING_APPROVAL) {
        send(res, reply(409, { error: 'waiting_approval', message: WAITING_APPROVAL_TEXT }))
        return
      }
      if (error instanceof CollabTimeoutError) {
        send(res, reply(503, { error: 'unavailable', message: error.message }, { 'Retry-After': String(COLLAB_RETRY_SECONDS) }))
        return
      }
      deps.report('issues api failed', { route: route.name, error: String(error) })
      send(res, reply(500, { error: 'internal', message: FAILED_TEXT }))
    }
  }
}
