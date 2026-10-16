import type { Channel } from '@hcengineering/chunter'
import type { Ref, WorkspaceUuid } from '@hcengineering/core'
import type { IncomingMessage, ServerResponse } from 'http'
import { readBody } from '../http-body'
import { corsHeaders, type Json, jsonReply, type JsonReply, pathSegments, sendJson } from '../http-json'
import type { Dispatcher } from '../outgoing/dispatcher'
import { hostRefusal, invalid, type JsonFields, type Parsed, parseObject, parseUrl, preflight } from '../outgoing/request'
import type { AttemptOutcome } from '../outgoing/send'
import type { SealedSecret } from '../seal'
import { canManageHooks, type Caller } from '../webhooks/auth'
import type { TokenBuckets } from '../webhooks/rate'
import { isHookId, newHookId, newSecret } from '../webhooks/secret'
import { CHAT_EVENTS, type ChatEventName } from './events'
import type { ChatHookStore, StoredChatHook } from './store'

export const MAX_BODY_BYTES = 8 * 1024
export const MAX_HOOKS_PER_CHANNEL = 10
const CHANNEL_ID_PATTERN = /^[\w:.-]{1,100}$/
const FILTERS = ['mentionsOnly', 'peopleOnly', 'includeIntegrations'] as const
type Filters = Record<(typeof FILTERS)[number], boolean>

export type ChannelAccess = Pick<Channel, 'owners' | 'archived'>

export interface ServerDeps {
  store: ChatHookStore
  hooks: Pick<Dispatcher<StoredChatHook>, 'add' | 'edit' | 'remove' | 'turnOn' | 'turnOff'>
  buckets: TokenBuckets
  frontUrl: string
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  // Undefined for a direct message or a channel of another workspace.
  findChannel: (workspace: WorkspaceUuid, channel: Ref<Channel>) => Promise<ChannelAccess | undefined>
  resolveHost: (host: string, port: number) => Promise<string>
  sealSecret: (workspace: WorkspaceUuid, hookId: string, secret: string) => SealedSecret
  sendTest: (hook: StoredChatHook, caller: Caller) => Promise<AttemptOutcome>
  // Fields must never carry a secret.
  report: (event: string, fields: Record<string, string | number>) => void
}

export interface NewChatHook extends Filters {
  channel: Ref<Channel>
  url: URL
  events: ChatEventName[]
}

export interface ChatHookEdit {
  url?: URL
  events?: ChatEventName[]
  filters: Partial<Filters>
  isEnabled?: boolean
}

const NOT_FOUND = jsonReply(404, { error: 'not_found' })
const UNAUTHORIZED = jsonReply(401, { error: 'unauthorized' })
const FORBIDDEN = jsonReply(403, { error: 'forbidden' })
const CHANNEL_CLOSED = jsonReply(403, { error: 'channel_closed' })
const TOO_LARGE = jsonReply(400, { error: 'too_large', field: 'body' }, { Connection: 'close' })

const isChatEvent = (name: Json): name is ChatEventName => CHAT_EVENTS.some((event) => event === name)

function parseEvents (field: Json): Parsed<ChatEventName[]> {
  if (!Array.isArray(field)) return invalid('invalid_type', 'events')
  if (field.length === 0) return invalid('empty', 'events')
  const events: ChatEventName[] = []
  for (const name of field) {
    if (!isChatEvent(name)) return invalid('unknown_event', 'events')
    if (!events.includes(name)) events.push(name)
  }
  return { isValid: true, parsed: events }
}

function parseFilters (fields: JsonFields): Parsed<Partial<Filters>> {
  const filters: Partial<Filters> = {}
  for (const key of FILTERS) {
    const raw = fields[key]
    if (raw === undefined) continue
    if (typeof raw !== 'boolean') return invalid('invalid_type', key)
    filters[key] = raw
  }
  return { isValid: true, parsed: filters }
}

export function parseNewHook (body: string): Parsed<NewChatHook> {
  const object = parseObject(body, ['channel', 'url', 'events', ...FILTERS])
  if (!object.isValid) return object
  const { channel, url: rawUrl, events: rawEvents } = object.parsed
  if (channel === undefined) return invalid('missing_field', 'channel')
  if (typeof channel !== 'string' || !CHANNEL_ID_PATTERN.test(channel)) return invalid('invalid_type', 'channel')
  if (rawUrl === undefined) return invalid('missing_field', 'url')
  if (rawEvents === undefined) return invalid('missing_field', 'events')
  const url = parseUrl(rawUrl)
  if (!url.isValid) return url
  const events = parseEvents(rawEvents)
  if (!events.isValid) return events
  const filters = parseFilters(object.parsed)
  if (!filters.isValid) return filters
  return {
    isValid: true,
    parsed: {
      // Ids are opaque strings; the workspace lookup decides whether this one exists.
      channel: channel as Ref<Channel>,
      url: url.parsed,
      events: events.parsed,
      mentionsOnly: filters.parsed.mentionsOnly ?? false,
      peopleOnly: filters.parsed.peopleOnly ?? false,
      includeIntegrations: filters.parsed.includeIntegrations ?? false
    }
  }
}

export function parseHookEdit (body: string): Parsed<ChatHookEdit> {
  const object = parseObject(body, ['url', 'events', ...FILTERS, 'isEnabled'])
  if (!object.isValid) return object
  const { url: rawUrl, events: rawEvents, isEnabled } = object.parsed
  const filters = parseFilters(object.parsed)
  if (!filters.isValid) return filters
  const edit: ChatHookEdit = { filters: filters.parsed }
  if (rawUrl !== undefined) {
    const url = parseUrl(rawUrl)
    if (!url.isValid) return url
    edit.url = url.parsed
  }
  if (rawEvents !== undefined) {
    const events = parseEvents(rawEvents)
    if (!events.isValid) return events
    edit.events = events.parsed
  }
  if (isEnabled !== undefined) {
    if (typeof isEnabled !== 'boolean') return invalid('invalid_type', 'isEnabled')
    edit.isEnabled = isEnabled
  }
  return { isValid: true, parsed: edit }
}

export function applyEdit (hook: StoredChatHook, edit: ChatHookEdit): StoredChatHook {
  const edited: StoredChatHook = { ...hook, ...edit.filters }
  if (edit.url !== undefined) edited.url = edit.url.href
  if (edit.events !== undefined) edited.events = edit.events
  return edited
}

const changesSettings = (edit: ChatHookEdit): boolean =>
  edit.url !== undefined || edit.events !== undefined || Object.keys(edit.filters).length > 0

function hookSummary (hook: StoredChatHook, lastAttempt: Json): Json {
  return {
    id: hook.id,
    channel: hook.channel,
    url: hook.url,
    events: hook.events,
    mentionsOnly: hook.mentionsOnly,
    peopleOnly: hook.peopleOnly,
    includeIntegrations: hook.includeIntegrations,
    createdBy: hook.createdBy,
    createdOn: hook.createdOn,
    disabledOn: hook.disabledOn ?? null,
    disabledReason: hook.disabledReason ?? null,
    consecutiveFailures: hook.consecutiveFailures,
    lastAttempt
  }
}

export function createRequestHandler (deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  async function summary (hook: StoredChatHook): Promise<Json> {
    const [last] = await deps.store.readLog(hook.id)
    return hookSummary(hook, last === undefined ? null : { at: last.at, status: last.status, error: last.error ?? null })
  }

  async function managedChannel (caller: Caller, channel: Ref<Channel>): Promise<{ access: ChannelAccess } | { denied: JsonReply }> {
    const access = await deps.findChannel(caller.workspace, channel)
    if (access === undefined) return { denied: NOT_FOUND }
    if (!canManageHooks(caller, access.owners ?? [])) return { denied: FORBIDDEN }
    return { access }
  }

  async function managedHook (caller: Caller, id: string): Promise<{ hook: StoredChatHook } | { denied: JsonReply }> {
    const hook = isHookId(id) ? await deps.store.getHook(id) : undefined
    if (hook === undefined || hook.workspace !== caller.workspace) return { denied: NOT_FOUND }
    // A deleted channel has no owners left, so only Maintainers can still remove its hooks.
    const access = await deps.findChannel(caller.workspace, hook.channel)
    if (!canManageHooks(caller, access?.owners ?? [])) return { denied: FORBIDDEN }
    return { hook }
  }

  async function listHooks (caller: Caller, channel: string | null): Promise<JsonReply> {
    if (channel === null) return jsonReply(400, { error: 'missing_field', field: 'channel' })
    if (!CHANNEL_ID_PATTERN.test(channel)) return jsonReply(400, { error: 'invalid_type', field: 'channel' })
    const channelId = channel as Ref<Channel>
    const managed = await managedChannel(caller, channelId)
    if ('denied' in managed) return managed.denied
    const hooks = await deps.store.listOwnerHooks(caller.workspace, channelId)
    return jsonReply(200, { hooks: await Promise.all(hooks.map(async (hook) => await summary(hook))) })
  }

  async function createHook (req: IncomingMessage, caller: Caller): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const parsed = parseNewHook(body)
    if (!parsed.isValid) return parsed.reply
    const settings = parsed.parsed
    const managed = await managedChannel(caller, settings.channel)
    if ('denied' in managed) return managed.denied
    if (managed.access.archived) return CHANNEL_CLOSED
    const refusal = await hostRefusal(settings.url, deps.resolveHost)
    if (refusal !== undefined) return refusal
    const existing = await deps.store.listOwnerHooks(caller.workspace, settings.channel)
    if (existing.length >= MAX_HOOKS_PER_CHANNEL) return jsonReply(409, { error: 'too_many_hooks' })

    const id = newHookId()
    const secret = newSecret()
    const hook: StoredChatHook = {
      id,
      workspace: caller.workspace,
      channel: settings.channel,
      url: settings.url.href,
      events: settings.events,
      mentionsOnly: settings.mentionsOnly,
      peopleOnly: settings.peopleOnly,
      includeIntegrations: settings.includeIntegrations,
      sealedSecret: deps.sealSecret(caller.workspace, id, secret),
      createdBy: caller.account,
      createdOn: deps.now(),
      consecutiveFailures: 0
    }
    await deps.hooks.add(hook)
    deps.report('chat hook created', { hook: id, workspace: caller.workspace })
    return jsonReply(201, { hook: await summary(hook), secret })
  }

  async function editHook (req: IncomingMessage, caller: Caller, id: string): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const managed = await managedHook(caller, id)
    if ('denied' in managed) return managed.denied
    const parsed = parseHookEdit(body)
    if (!parsed.isValid) return parsed.reply
    const edit = parsed.parsed
    if (edit.url !== undefined) {
      const refusal = await hostRefusal(edit.url, deps.resolveHost)
      if (refusal !== undefined) return refusal
    }
    let hook = managed.hook
    if (changesSettings(edit)) hook = await deps.hooks.edit(hook, (current) => applyEdit(current, edit))
    if (edit.isEnabled === true) hook = await deps.hooks.turnOn(hook)
    if (edit.isEnabled === false && hook.disabledOn === undefined) hook = await deps.hooks.turnOff(hook)
    return jsonReply(200, { hook: await summary(hook) })
  }

  async function deleteHook (caller: Caller, id: string): Promise<JsonReply> {
    const managed = await managedHook(caller, id)
    if ('denied' in managed) return managed.denied
    await deps.hooks.remove(managed.hook)
    deps.report('chat hook deleted', { hook: id, workspace: caller.workspace })
    return jsonReply(204, null)
  }

  async function readLog (caller: Caller, id: string): Promise<JsonReply> {
    const managed = await managedHook(caller, id)
    if ('denied' in managed) return managed.denied
    const attempts = await deps.store.readLog(id)
    return jsonReply(200, {
      attempts: attempts.map((attempt) => ({ ...attempt, error: attempt.error ?? null, dropped: attempt.dropped ?? null }))
    })
  }

  async function sendTest (caller: Caller, id: string): Promise<JsonReply> {
    const managed = await managedHook(caller, id)
    if ('denied' in managed) return managed.denied
    const decision = deps.buckets.take(id, deps.now())
    if (!decision.isAllowed) {
      return jsonReply(429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
    }
    const outcome = await deps.sendTest(managed.hook, caller)
    return jsonReply(200, {
      status: outcome.status,
      error: outcome.error ?? null,
      durationMs: outcome.durationMs,
      responseStart: outcome.responseStart
    })
  }

  async function route (req: IncomingMessage, segments: string[]): Promise<JsonReply> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return UNAUTHORIZED
    const [, , , id, sub] = segments
    if (segments.length === 3) {
      if (req.method === 'GET') return await listHooks(caller, new URL(req.url ?? '/', 'http://localhost').searchParams.get('channel'))
      if (req.method === 'POST') return await createHook(req, caller)
    }
    if (segments.length === 4) {
      if (req.method === 'PATCH') return await editHook(req, caller, id)
      if (req.method === 'DELETE') return await deleteHook(caller, id)
    }
    if (segments.length === 5) {
      if (sub === 'log' && req.method === 'GET') return await readLog(caller, id)
      if (sub === 'test' && req.method === 'POST') return await sendTest(caller, id)
    }
    return NOT_FOUND
  }

  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      preflight(req, res, deps.frontUrl)
      return
    }
    const cors = corsHeaders(req, deps.frontUrl)
    const segments = pathSegments(req.url)
    if (segments?.[0] !== 'v1' || segments[1] !== 'chat' || segments[2] !== 'hooks') {
      sendJson(res, NOT_FOUND, cors)
      return
    }
    try {
      sendJson(res, await route(req, segments), cors)
    } catch (error) {
      deps.report('chat hooks request failed', { error: error instanceof Error ? error.message : String(error) })
      sendJson(res, jsonReply(500, { error: 'internal' }), cors)
    }
  }
}
