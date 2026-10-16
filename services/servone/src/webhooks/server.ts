import type { Channel, ChatMessage } from '@hcengineering/chunter'
import type { Markup, Ref, WorkspaceUuid } from '@hcengineering/core'
import type { IncomingMessage, ServerResponse } from 'http'
import { readBody } from '../http-body'
import {
  corsHeaders,
  type Json,
  jsonReply,
  type JsonReply,
  pathSegments,
  sendJson,
  sendText,
  type TextReply
} from '../http-json'
import { canManageHooks, type Caller } from './auth'
import { renderPayload } from './markup'
import { type MentionLookup, mentionTokens, NO_MENTIONS } from './mentions'
import { parsePayload, type WebhookPayload } from './payload'
import type { Delivery, OutgoingPost } from './post'
import { RATE_LIMITED_WINDOW_MS, type RejectedCalls, type TokenBuckets } from './rate'
import { hashSecret, isHookId, isSecret, newHookId, newSecret, secretMatches } from './secret'
import { parseSlackBody } from './slack'
import type { HookStore, StoredHook } from './store'

export const MAX_BODY_BYTES = 16 * 1024
export const MAX_NAME_LENGTH = 80
const CHANNEL_ID_PATTERN = /^[\w:.-]{1,100}$/
const PREFLIGHT_MAX_AGE_SECONDS = 600

export type ChannelAccess = Pick<Channel, 'owners' | 'archived'>

export interface ServerDeps {
  store: HookStore
  buckets: TokenBuckets
  rejected: RejectedCalls
  publicUrl: string
  frontUrl: string
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  findChannel: (workspace: WorkspaceUuid, channel: Ref<Channel>) => Promise<ChannelAccess | undefined>
  deliver: (hook: StoredHook, post: OutgoingPost) => Promise<Delivery>
  resolveMentions: (hook: StoredHook, tokens: string[]) => Promise<MentionLookup>
  // Fields must never carry the secret or the request path.
  report: (event: string, fields: Record<string, string | number>) => void
}

const NOT_FOUND = jsonReply(404, { error: 'not_found' })
const UNAUTHORIZED = jsonReply(401, { error: 'unauthorized' })
const FORBIDDEN = jsonReply(403, { error: 'forbidden' })
const TOO_LARGE = jsonReply(400, { error: 'too_large', field: 'body' }, { Connection: 'close' })

type Endpoint = 'native' | 'slack'

export type CallOutcome =
  | { kind: 'posted', messageId: Ref<ChatMessage> }
  | { kind: 'not_found' }
  | { kind: 'revoked' }
  | { kind: 'too_large' }
  | { kind: 'rate_limited', retryAfterSeconds: number }
  | { kind: 'invalid', error: string, field: string }
  | { kind: 'channel_closed' }
  | { kind: 'delivery_failed' }

type ParsedCall = { isValid: true, payload: WebhookPayload } | { isValid: false, error: string, field: string }

export function nativeReply (outcome: CallOutcome): JsonReply {
  switch (outcome.kind) {
    case 'posted':
      return jsonReply(200, { ok: true, messageId: outcome.messageId })
    case 'not_found':
      return NOT_FOUND
    case 'revoked':
      return jsonReply(403, { error: 'revoked' })
    case 'too_large':
      return TOO_LARGE
    case 'rate_limited':
      return jsonReply(429, { error: 'rate_limited' }, { 'Retry-After': String(outcome.retryAfterSeconds) })
    case 'invalid':
      return jsonReply(400, { error: outcome.error, field: outcome.field })
    case 'channel_closed':
      return jsonReply(403, { error: 'channel_closed' })
    case 'delivery_failed':
      return jsonReply(502, { error: 'delivery_failed' })
  }
}

// Bodies match Slack's own answers, which some senders compare as strings.
export function slackReply (outcome: CallOutcome): TextReply {
  switch (outcome.kind) {
    case 'posted':
      return { status: 200, body: 'ok' }
    case 'not_found':
      return { status: 404, body: 'no_service' }
    case 'revoked':
      return { status: 410, body: 'no_service' }
    case 'too_large':
      return { status: 413, body: 'request_too_large', headers: { Connection: 'close' } }
    case 'rate_limited':
      return { status: 429, body: 'rate_limited', headers: { 'Retry-After': String(outcome.retryAfterSeconds) } }
    case 'invalid':
      return { status: 400, body: outcome.error }
    case 'channel_closed':
      return { status: 403, body: 'channel_is_archived' }
    case 'delivery_failed':
      return { status: 502, body: 'delivery_failed' }
  }
}

function parseCall (endpoint: Endpoint, body: string, contentType: string | undefined): ParsedCall {
  if (endpoint === 'native') return parsePayload(body)
  const parsed = parseSlackBody(body, contentType)
  return parsed.isValid ? parsed : { isValid: false, error: parsed.error, field: 'body' }
}

function hookSummary (hook: StoredHook, lastCall: Json, rateLimitedOn: number | null): Json {
  return {
    id: hook.id,
    name: hook.name,
    createdBy: hook.createdBy,
    createdOn: hook.createdOn,
    revokedOn: hook.revokedOn ?? null,
    allowMentions: hook.allowMentions === true,
    rateLimitedOn,
    lastCall
  }
}

type ParsedName = { isValid: true, name: string } | { isValid: false, error: string }

export function parseHookName (body: string): ParsedName {
  let json: Json
  try {
    json = JSON.parse(body) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return { isValid: false, error: 'invalid_json' }
    throw error
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { isValid: false, error: 'invalid_type' }
  const extra = Object.keys(json).find((key) => key !== 'name')
  if (extra !== undefined) return { isValid: false, error: 'unknown_field' }
  const name = typeof json.name === 'string' ? json.name.trim() : undefined
  if (name === undefined) return { isValid: false, error: 'missing_field' }
  if (name === '') return { isValid: false, error: 'empty' }
  if (name.length > MAX_NAME_LENGTH) return { isValid: false, error: 'too_long' }
  return { isValid: true, name }
}

type ParsedSettings = { isValid: true, allowMentions: boolean } | { isValid: false, error: string }

export function parseHookSettings (body: string): ParsedSettings {
  let json: Json
  try {
    json = JSON.parse(body) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return { isValid: false, error: 'invalid_json' }
    throw error
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { isValid: false, error: 'invalid_type' }
  if (Object.keys(json).some((key) => key !== 'allowMentions')) return { isValid: false, error: 'unknown_field' }
  if (typeof json.allowMentions !== 'boolean') return { isValid: false, error: 'invalid_type' }
  return { isValid: true, allowMentions: json.allowMentions }
}

export function createRequestHandler (deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  interface Call {
    outcome: CallOutcome
    hook: StoredHook | undefined
  }

  // Secret hash per hook that passed a check, so rate-limited calls are counted only when the caller holds the secret.
  const verifiedHooks = new Map<string, string>()

  async function incoming (req: IncomingMessage, id: string, secret: string, endpoint: Endpoint): Promise<Call> {
    if (!isHookId(id) || !isSecret(secret)) return { outcome: { kind: 'not_found' }, hook: undefined }
    const decision = deps.buckets.take(id, deps.now())
    if (!decision.isAllowed) {
      const knownHash = verifiedHooks.get(id)
      if (knownHash !== undefined && secretMatches(secret, knownHash)) deps.rejected.note(id)
      return { outcome: { kind: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds }, hook: undefined }
    }
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return { outcome: { kind: 'too_large' }, hook: undefined }

    const hook = await deps.store.getHook(id)
    // Unknown hook and wrong secret answer the same, so a caller cannot probe which ids exist.
    if (hook === undefined || !secretMatches(secret, hook.secretHash)) return { outcome: { kind: 'not_found' }, hook: undefined }
    verifiedHooks.set(hook.id, hook.secretHash)
    const parsed = parseCall(endpoint, body, req.headers['content-type'])
    return { outcome: await deliverToHook(hook, parsed, endpoint), hook }
  }

  async function deliverToHook (hook: StoredHook, parsed: ParsedCall, endpoint: Endpoint): Promise<CallOutcome> {
    if (hook.revokedOn !== undefined) return { kind: 'revoked' }
    if (!parsed.isValid) return { kind: 'invalid', error: parsed.error, field: parsed.field }
    try {
      const tokens = hook.allowMentions === true ? mentionTokens(parsed.payload.text) : []
      const mentions = tokens.length === 0 ? NO_MENTIONS : await deps.resolveMentions(hook, tokens)
      const message = renderPayload(parsed.payload, mentions)
      if (message === undefined) return { kind: 'invalid', error: endpoint === 'native' ? 'empty' : 'no_text', field: 'text' }
      return await postPayload(hook, parsed.payload, message)
    } catch (error) {
      deps.report('delivery failed', { hook: hook.id, error: error instanceof Error ? error.message : String(error) })
      return { kind: 'delivery_failed' }
    }
  }

  async function postPayload (hook: StoredHook, payload: WebhookPayload, message: Markup): Promise<CallOutcome> {
    const { color, threadKey } = payload
    let parent = threadKey === undefined ? undefined : await deps.store.findThread(hook.id, threadKey, deps.now())
    let delivery = await deps.deliver(hook, { message, color, replyTo: parent, broadcastOf: undefined })
    if (!delivery.isPosted && delivery.reason === 'parent_missing') {
      parent = undefined
      delivery = await deps.deliver(hook, { message, color, replyTo: undefined, broadcastOf: undefined })
    }
    if (!delivery.isPosted) return { kind: 'channel_closed' }
    if (threadKey !== undefined && parent === undefined) {
      await deps.store.saveThread(hook.id, threadKey, delivery.messageId, deps.now())
    }
    if (parent !== undefined && payload.replyBroadcast === true) {
      await deps.deliver(hook, { message, color, replyTo: undefined, broadcastOf: parent })
    }
    return { kind: 'posted', messageId: delivery.messageId }
  }

  async function answerCall (req: IncomingMessage, res: ServerResponse, segments: string[]): Promise<void> {
    const endpoint: Endpoint = segments.length === 5 ? 'slack' : 'native'
    const { outcome, hook } = await incoming(req, segments[2], segments[3], endpoint)
    const status = endpoint === 'native' ? nativeReply(outcome).status : slackReply(outcome).status
    if (hook !== undefined) {
      deps.report('call', { hook: hook.id, status })
      void logCall(hook.id, status)
    }
    if (endpoint === 'native') sendJson(res, nativeReply(outcome), {})
    else sendText(res, slackReply(outcome))
  }

  async function logCall (hookId: string, status: number): Promise<void> {
    try {
      const rejectedCount = deps.rejected.take(hookId)
      if (rejectedCount > 0) await deps.store.appendLog(hookId, { at: deps.now(), status: 429, count: rejectedCount })
      await deps.store.appendLog(hookId, { at: deps.now(), status })
    } catch (error) {
      deps.report('call log write failed', { hook: hookId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function managedChannel (
    caller: Caller,
    channelId: Ref<Channel>
  ): Promise<{ channel: ChannelAccess } | { denied: JsonReply }> {
    const channel = await deps.findChannel(caller.workspace, channelId)
    if (channel === undefined) return { denied: NOT_FOUND }
    if (!canManageHooks(caller, channel.owners ?? [])) return { denied: FORBIDDEN }
    return { channel }
  }

  async function managedHook (caller: Caller, id: string): Promise<{ hook: StoredHook } | { denied: JsonReply }> {
    const hook = isHookId(id) ? await deps.store.getHook(id) : undefined
    if (hook === undefined || hook.workspace !== caller.workspace) return { denied: NOT_FOUND }
    // A deleted channel has no owners left, so only maintainers can still revoke its hooks.
    const channel = await deps.findChannel(caller.workspace, hook.channel)
    if (!canManageHooks(caller, channel?.owners ?? [])) return { denied: FORBIDDEN }
    return { hook }
  }

  async function listHooks (caller: Caller, channelId: Ref<Channel>): Promise<JsonReply> {
    const access = await managedChannel(caller, channelId)
    if ('denied' in access) return access.denied
    const hooks = await deps.store.listChannelHooks(caller.workspace, channelId)
    const summaries = await Promise.all(
      hooks.map(async (hook) => {
        const log = await deps.store.readLog(hook.id)
        const lastCall = log.find((call) => call.count === undefined)
        const limited = log.find((call) => call.status === 429 && call.at >= deps.now() - RATE_LIMITED_WINDOW_MS)
        return hookSummary(hook, lastCall === undefined ? null : { at: lastCall.at, status: lastCall.status }, limited?.at ?? null)
      })
    )
    return jsonReply(200, { hooks: summaries })
  }

  async function createHook (req: IncomingMessage, caller: Caller, channelId: Ref<Channel>): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const access = await managedChannel(caller, channelId)
    if ('denied' in access) return access.denied
    if (access.channel.archived) return jsonReply(403, { error: 'channel_closed' })
    const parsed = parseHookName(body)
    if (!parsed.isValid) return jsonReply(400, { error: parsed.error, field: 'name' })

    const id = newHookId()
    const secret = newSecret()
    await deps.store.saveHook({
      id,
      workspace: caller.workspace,
      channel: channelId,
      name: parsed.name,
      secretHash: hashSecret(secret),
      createdBy: caller.account,
      createdOn: deps.now()
    })
    deps.report('hook created', { hook: id, workspace: caller.workspace })
    const url = `${deps.publicUrl}/v1/hooks/${id}/${secret}`
    return jsonReply(201, { id, url, slackUrl: `${url}/slack` })
  }

  async function revokeHook (caller: Caller, id: string): Promise<JsonReply> {
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    const revoked = await deps.store.revokeHook(access.hook, deps.now())
    deps.report('hook revoked', { hook: id, workspace: caller.workspace })
    return jsonReply(200, { ok: true, revokedOn: revoked.revokedOn ?? null })
  }

  async function updateHook (req: IncomingMessage, caller: Caller, id: string): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    const parsed = parseHookSettings(body)
    if (!parsed.isValid) return jsonReply(400, { error: parsed.error, field: 'allowMentions' })
    if (access.hook.revokedOn !== undefined) return jsonReply(403, { error: 'revoked' })
    const updated = await deps.store.setAllowMentions(id, parsed.allowMentions)
    if (updated === undefined) return NOT_FOUND
    if (updated.revokedOn !== undefined) return jsonReply(403, { error: 'revoked' })
    deps.report('hook updated', { hook: id, workspace: caller.workspace })
    return jsonReply(200, { ok: true, allowMentions: updated.allowMentions === true })
  }

  async function readLog (caller: Caller, id: string): Promise<JsonReply> {
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    const calls = await deps.store.readLog(id)
    return jsonReply(200, {
      calls: calls.map((call): Json =>
        call.count === undefined ? { at: call.at, status: call.status } : { at: call.at, status: call.status, count: call.count }
      )
    })
  }

  async function management (req: IncomingMessage, segments: string[]): Promise<JsonReply> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return UNAUTHORIZED
    const [, resource, id, sub] = segments
    if (resource === 'channels' && sub === 'hooks' && segments.length === 4 && CHANNEL_ID_PATTERN.test(id)) {
      // Ids are opaque strings; the workspace lookup decides whether this one exists.
      const channelId = id as Ref<Channel>
      if (req.method === 'GET') return await listHooks(caller, channelId)
      if (req.method === 'POST') return await createHook(req, caller, channelId)
    }
    if (resource === 'hooks' && segments.length === 3 && req.method === 'DELETE') return await revokeHook(caller, id)
    if (resource === 'hooks' && segments.length === 3 && req.method === 'PATCH') return await updateHook(req, caller, id)
    if (resource === 'hooks' && sub === 'log' && segments.length === 4 && req.method === 'GET') {
      return await readLog(caller, id)
    }
    return NOT_FOUND
  }

  function isIncoming (req: IncomingMessage, segments: string[]): boolean {
    if (req.method !== 'POST' || segments[0] !== 'v1' || segments[1] !== 'hooks') return false
    return segments.length === 4 || (segments.length === 5 && segments[4] === 'slack')
  }

  return async (req, res) => {
    const segments = pathSegments(req.url)
    if (segments?.[0] !== 'v1') {
      sendJson(res, NOT_FOUND, {})
      return
    }
    if (isIncoming(req, segments)) {
      try {
        await answerCall(req, res, segments)
      } catch (error) {
        deps.report('incoming failed', { error: error instanceof Error ? error.message : String(error) })
        if (segments.length === 5) sendText(res, { status: 500, body: 'internal_error' })
        else sendJson(res, jsonReply(500, { error: 'internal' }), {})
      }
      return
    }
    const cors = corsHeaders(req, deps.frontUrl)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
      })
      res.end()
      return
    }
    try {
      sendJson(res, await management(req, segments), cors)
    } catch (error) {
      deps.report('management failed', { error: error instanceof Error ? error.message : String(error) })
      sendJson(res, jsonReply(500, { error: 'internal' }), cors)
    }
  }
}
