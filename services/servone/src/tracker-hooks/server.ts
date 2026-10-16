import type { Ref, WorkspaceUuid } from '@hcengineering/core'
import type { Project } from '@hcengineering/tracker'
import type { IncomingMessage, ServerResponse } from 'http'
import { readBody } from '../http-body'
import { corsHeaders, type Json, jsonReply, type JsonReply, pathSegments, sendJson } from '../http-json'
import { hostRefusal, invalid, type Parsed, parseObject, parseUrl, preflight } from '../outgoing/request'
import type { AttemptOutcome } from '../outgoing/send'
import type { SealedSecret } from '../seal'
import { canManageHooks, type Caller } from '../webhooks/auth'
import type { TokenBuckets } from '../webhooks/rate'
import { isHookId, newHookId, newSecret } from '../webhooks/secret'
import type { Dispatcher } from './dispatcher'
import { TRACKER_EVENTS, type TrackerEvent } from './events'
import type { StoredTrackerHook, TrackerHookStore } from './store'

export { createNotConfiguredHandler } from '../outgoing/request'

export const MAX_BODY_BYTES = 8 * 1024
export const MAX_HOOKS_PER_PROJECT = 10
const PROJECT_ID_PATTERN = /^[\w:.-]{1,100}$/

export type ProjectAccess = Pick<Project, 'owners'>

export interface ServerDeps {
  store: TrackerHookStore
  hooks: Pick<Dispatcher, 'add' | 'setEvents' | 'remove' | 'turnOn' | 'turnOff'>
  buckets: TokenBuckets
  frontUrl: string
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  findProject: (workspace: WorkspaceUuid, project: Ref<Project>) => Promise<ProjectAccess | undefined>
  // Throws HostRefusedError for a private or unknown host.
  resolveHost: (host: string, port: number) => Promise<string>
  sealSecret: (workspace: WorkspaceUuid, hookId: string, secret: string) => SealedSecret
  sendTest: (hook: StoredTrackerHook, caller: Caller) => Promise<AttemptOutcome>
  // Fields must never carry a secret.
  report: (event: string, fields: Record<string, string | number>) => void
}

const NOT_FOUND = jsonReply(404, { error: 'not_found' })
const UNAUTHORIZED = jsonReply(401, { error: 'unauthorized' })
const FORBIDDEN = jsonReply(403, { error: 'forbidden' })
const TOO_LARGE = jsonReply(400, { error: 'too_large', field: 'body' }, { Connection: 'close' })

const isTrackerEvent = (name: Json): name is TrackerEvent => TRACKER_EVENTS.some((event) => event === name)

function parseEvents (field: Json): Parsed<TrackerEvent[]> {
  if (!Array.isArray(field)) return invalid('invalid_type', 'events')
  if (field.length === 0) return invalid('empty', 'events')
  const events: TrackerEvent[] = []
  for (const name of field) {
    if (!isTrackerEvent(name)) return invalid('unknown_event', 'events')
    if (!events.includes(name)) events.push(name)
  }
  return { isValid: true, parsed: events }
}

export function parseNewHook (body: string): Parsed<{ url: URL, events: TrackerEvent[] }> {
  const object = parseObject(body, ['url', 'events'])
  if (!object.isValid) return object
  const { url: rawUrl, events: rawEvents } = object.parsed
  if (rawUrl === undefined) return invalid('missing_field', 'url')
  if (rawEvents === undefined) return invalid('missing_field', 'events')
  const url = parseUrl(rawUrl)
  if (!url.isValid) return url
  const events = parseEvents(rawEvents)
  if (!events.isValid) return events
  return { isValid: true, parsed: { url: url.parsed, events: events.parsed } }
}

export function parseHookEdit (body: string): Parsed<{ events?: TrackerEvent[], isEnabled?: boolean }> {
  const object = parseObject(body, ['events', 'isEnabled'])
  if (!object.isValid) return object
  const { events: rawEvents, isEnabled } = object.parsed
  const edit: { events?: TrackerEvent[], isEnabled?: boolean } = {}
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

function hookSummary (hook: StoredTrackerHook, lastAttempt: Json): Json {
  return {
    id: hook.id,
    url: hook.url,
    events: hook.events,
    createdBy: hook.createdBy,
    createdOn: hook.createdOn,
    disabledOn: hook.disabledOn ?? null,
    disabledReason: hook.disabledReason ?? null,
    consecutiveFailures: hook.consecutiveFailures,
    lastAttempt
  }
}

export function createRequestHandler (deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  async function summary (hook: StoredTrackerHook): Promise<Json> {
    const [last] = await deps.store.readLog(hook.id)
    return hookSummary(hook, last === undefined ? null : { at: last.at, status: last.status, error: last.error ?? null })
  }

  async function managedProject (caller: Caller, project: Ref<Project>): Promise<JsonReply | undefined> {
    const access = await deps.findProject(caller.workspace, project)
    if (access === undefined) return NOT_FOUND
    if (!canManageHooks(caller, access.owners ?? [])) return FORBIDDEN
    return undefined
  }

  async function managedHook (caller: Caller, id: string): Promise<{ hook: StoredTrackerHook } | { denied: JsonReply }> {
    const hook = isHookId(id) ? await deps.store.getHook(id) : undefined
    if (hook === undefined || hook.workspace !== caller.workspace) return { denied: NOT_FOUND }
    // A deleted project has no owners left, so only Maintainers can still remove its hooks.
    const access = await deps.findProject(caller.workspace, hook.project)
    if (!canManageHooks(caller, access?.owners ?? [])) return { denied: FORBIDDEN }
    return { hook }
  }

  async function listHooks (caller: Caller, project: Ref<Project>): Promise<JsonReply> {
    const denied = await managedProject(caller, project)
    if (denied !== undefined) return denied
    const hooks = await deps.store.listProjectHooks(caller.workspace, project)
    const summaries = await Promise.all(
      hooks.map(async (hook) => {
        return await summary(hook)
      })
    )
    return jsonReply(200, { hooks: summaries })
  }

  async function createHook (req: IncomingMessage, caller: Caller, project: Ref<Project>): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const denied = await managedProject(caller, project)
    if (denied !== undefined) return denied
    const parsed = parseNewHook(body)
    if (!parsed.isValid) return parsed.reply
    const refusal = await hostRefusal(parsed.parsed.url, deps.resolveHost)
    if (refusal !== undefined) return refusal
    const existing = await deps.store.listProjectHooks(caller.workspace, project)
    if (existing.length >= MAX_HOOKS_PER_PROJECT) return jsonReply(409, { error: 'too_many_hooks' })

    const id = newHookId()
    const secret = newSecret()
    await deps.hooks.add({
      id,
      workspace: caller.workspace,
      project,
      url: parsed.parsed.url.href,
      events: parsed.parsed.events,
      sealedSecret: deps.sealSecret(caller.workspace, id, secret),
      createdBy: caller.account,
      createdOn: deps.now(),
      consecutiveFailures: 0
    })
    deps.report('tracker hook created', { hook: id, workspace: caller.workspace })
    return jsonReply(201, { id, secret })
  }

  async function editHook (req: IncomingMessage, caller: Caller, id: string): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    const parsed = parseHookEdit(body)
    if (!parsed.isValid) return parsed.reply
    const { events, isEnabled } = parsed.parsed
    let hook = access.hook
    if (events !== undefined) hook = await deps.hooks.setEvents(hook, events)
    if (isEnabled === true) hook = await deps.hooks.turnOn(hook)
    if (isEnabled === false && hook.disabledOn === undefined) hook = await deps.hooks.turnOff(hook)
    return jsonReply(200, { hook: await summary(hook) })
  }

  async function deleteHook (caller: Caller, id: string): Promise<JsonReply> {
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    await deps.hooks.remove(access.hook)
    deps.report('tracker hook deleted', { hook: id, workspace: caller.workspace })
    return jsonReply(200, { ok: true })
  }

  async function readLog (caller: Caller, id: string): Promise<JsonReply> {
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    const attempts = await deps.store.readLog(id)
    return jsonReply(200, {
      attempts: attempts.map((attempt) => ({ ...attempt, error: attempt.error ?? null }))
    })
  }

  async function sendTest (caller: Caller, id: string): Promise<JsonReply> {
    const access = await managedHook(caller, id)
    if ('denied' in access) return access.denied
    const decision = deps.buckets.take(id, deps.now())
    if (!decision.isAllowed) {
      return jsonReply(429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) })
    }
    const outcome = await deps.sendTest(access.hook, caller)
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
    const [, , resource, id, sub] = segments
    if (resource === 'projects' && sub === 'hooks' && segments.length === 5 && PROJECT_ID_PATTERN.test(id)) {
      // Ids are opaque strings; the workspace lookup decides whether this one exists.
      const project = id as Ref<Project>
      if (req.method === 'GET') return await listHooks(caller, project)
      if (req.method === 'POST') return await createHook(req, caller, project)
    }
    if (resource === 'hooks' && segments.length === 4) {
      if (req.method === 'PATCH') return await editHook(req, caller, id)
      if (req.method === 'DELETE') return await deleteHook(caller, id)
    }
    if (resource === 'hooks' && segments.length === 5) {
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
    if (segments?.[0] !== 'v1' || segments[1] !== 'tracker') {
      sendJson(res, NOT_FOUND, cors)
      return
    }
    try {
      sendJson(res, await route(req, segments), cors)
    } catch (error) {
      deps.report('tracker hooks request failed', { error: error instanceof Error ? error.message : String(error) })
      sendJson(res, jsonReply(500, { error: 'internal' }), cors)
    }
  }
}
