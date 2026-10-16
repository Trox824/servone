import Anthropic from '@anthropic-ai/sdk'
import { AccountRole, type AccountUuid, roleOrder, type WorkspaceUuid } from '@hcengineering/core'
import type { Json } from '@servone/config'
import type { IncomingMessage, ServerResponse } from 'http'

import { readBody } from '../../http-body'
import type { Report } from '../mcp'
import type { RouteHandler } from '../server'
import type { WorkspaceSession } from '../types'
import type { ChatLimiter } from './limiter'
import type { ChatReply, ChatRequest } from './loop'
import { MAX_BODY_BYTES, parseChatRequest } from './request'

// Must match CHAT_PATH in packages/servone-ui/src/plugins/card-resources/studio/assistant-client.ts.
export const CHAT_PATH = ['studio', 'chat'] as const
const PREFLIGHT_MAX_AGE_SECONDS = 600

export interface ChatCaller {
  token: string
  account: AccountUuid
  workspace: WorkspaceUuid
  role: AccountRole
}

export type RunChat = (session: WorkspaceSession, request: ChatRequest, signal: AbortSignal) => Promise<ChatReply>

export interface ChatRouteDeps {
  frontUrl: string
  authenticate: (authorization: string | undefined) => Promise<ChatCaller | undefined>
  session: (caller: ChatCaller) => Promise<WorkspaceSession>
  // Undefined when ANTHROPIC_API_KEY is unset.
  runChat: RunChat | undefined
  limiter: ChatLimiter
  now: () => number
  report: Report
}

interface Reply {
  status: number
  body: Json
  headers?: Record<string, string>
}

const reply = (status: number, body: Json): Reply => ({ status, body })
const TOO_LARGE: Reply = { status: 400, body: { error: 'too_large' }, headers: { Connection: 'close' } }
const RATE_LIMITED: Reply = { status: 429, body: { error: 'rate_limited' } }

function replyBody (chat: ChatReply): Json {
  return {
    reply: chat.reply,
    stop: chat.stop,
    drafts: chat.drafts.map((change) => ({
      id: change.id,
      summary: change.summary,
      risk: change.risk,
      diff: change.diff.map((line) => ({ text: line.text, risk: line.risk, affected: line.affected ?? null }))
    }))
  }
}

function isChatPath (path: string[]): boolean {
  return path.length === CHAT_PATH.length && CHAT_PATH.every((part, index) => path[index] === part)
}

export function createChatRoute (deps: ChatRouteDeps): RouteHandler {
  function corsHeaders (req: IncomingMessage): Record<string, string> {
    if (req.headers.origin !== deps.frontUrl) return { Vary: 'Origin' }
    return { 'Access-Control-Allow-Origin': deps.frontUrl, Vary: 'Origin' }
  }

  function send (res: ServerResponse, answer: Reply, cors: Record<string, string>): void {
    res.writeHead(answer.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors,
      ...answer.headers
    })
    res.end(JSON.stringify(answer.body))
  }

  async function chat (session: WorkspaceSession, run: RunChat, request: ChatRequest, signal: AbortSignal): Promise<Reply> {
    try {
      return reply(200, replyBody(await run(session, request, signal)))
    } catch (error) {
      // APIUserAbortError extends APIError too; the handler drops it because the client is gone.
      if (error instanceof Anthropic.APIUserAbortError) throw error
      if (error instanceof Anthropic.RateLimitError) return reply(429, { error: 'rate_limited' })
      // APIConnectionError extends APIError in the TypeScript SDK, so it is checked first.
      if (error instanceof Anthropic.APIConnectionError) {
        deps.report('model unreachable', { error: error.message })
        return reply(502, { error: 'model_unavailable' })
      }
      if (error instanceof Anthropic.APIError) {
        deps.report('model error', { status: error.status ?? 0, error: error.message })
        return reply(502, { error: 'model_unavailable' })
      }
      throw error
    }
  }

  async function answer (req: IncomingMessage, signal: AbortSignal): Promise<Reply> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return reply(401, { error: 'unauthorized' })
    // Core refuses non-maintainers too; this stops them before any model spend.
    if (roleOrder[caller.role] < roleOrder[AccountRole.Maintainer]) return reply(403, { error: 'forbidden' })
    const run = deps.runChat
    if (run === undefined) return reply(503, { error: 'not_configured' })
    // Reserved before the body is even read, so a busy or scripted account never reaches the model.
    if (!deps.limiter.reserve(caller.account, deps.now())) return RATE_LIMITED
    try {
      const body = await readBody(req, MAX_BODY_BYTES)
      if (body === undefined) return TOO_LARGE
      const parsed = parseChatRequest(body)
      if (!parsed.isValid) return reply(400, { error: parsed.error })
      return await chat(await deps.session(caller), run, parsed.request, signal)
    } finally {
      deps.limiter.release(caller.account)
    }
  }

  return async (req, res, path) => {
    if (!isChatPath(path)) return false
    const cors = corsHeaders(req)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
      })
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      send(res, { status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: 'POST, OPTIONS' } }, cors)
      return true
    }
    const client = new AbortController()
    // res, not req: on Node 22 req emits 'close' as soon as the body is read.
    res.on('close', () => {
      if (!res.writableFinished) client.abort()
    })
    try {
      const answered = await answer(req, client.signal)
      if (!client.signal.aborted) send(res, answered, cors)
    } catch (error) {
      if (client.signal.aborted && (error === client.signal.reason || error instanceof Anthropic.APIUserAbortError)) return true
      // Answered here, not by server.ts, so the front can still read the status through CORS.
      deps.report('studio chat failed', { error: error instanceof Error ? error.message : String(error) })
      send(res, reply(500, { error: 'internal' }), cors)
    }
    return true
  }
}
