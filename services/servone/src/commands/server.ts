import type { Channel } from '@hcengineering/chunter'
import type { Ref, WorkspaceUuid } from '@hcengineering/core'
import type { IncomingMessage, ServerResponse } from 'http'
import { HostRefusedError } from '../host-guard'
import { readBody } from '../http-body'
import { corsHeaders, type Json, jsonReply, type JsonReply, pathSegments, sendJson } from '../http-json'
import type { SealedSecret } from '../seal'
import { canManageHooks, type Caller } from '../webhooks/auth'
import { isHookId, isSecret, newHookId, newSecret } from '../webhooks/secret'
import { checkCommandName, isCommandName, MAX_COMMAND_NAME_LENGTH } from './names'
import { respondToCommand, type RespondOutcome, type RunDeps, runCommand, type RunOutcome, type RunRequest } from './run'
import { MAX_COMMANDS_PER_WORKSPACE, type StoredCommand } from './store'

export const MAX_BODY_BYTES = 8 * 1024
// Slack allows large block payloads on response_url; rendering clips the text afterwards.
export const MAX_RESPOND_BYTES = 64 * 1024
export const MAX_URL_LENGTH = 2048
// One row of the / menu.
export const MAX_DESCRIPTION_LENGTH = 100
export const MAX_USAGE_LENGTH = 100
// Same cap as webhook message text (webhooks/payload.ts MAX_TEXT_LENGTH).
export const MAX_RUN_TEXT_LENGTH = 4000
const HTTPS_PORT = 443
const CHANNEL_ID_PATTERN = /^[\w:.-]{1,100}$/
const PREFLIGHT_MAX_AGE_SECONDS = 600
const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE'

export interface ServerDeps extends RunDeps {
  frontUrl: string
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  // Throws HostRefusedError for a private or unknown host.
  resolveHost: (host: string, port: number) => Promise<string>
  sealSecret: (workspace: WorkspaceUuid, commandId: string, secret: string) => SealedSecret
  // Fields must never carry a secret or a response token.
  report: (event: string, fields: Record<string, string | number>) => void
}

const NOT_FOUND = jsonReply(404, { error: 'not_found' })
const UNAUTHORIZED = jsonReply(401, { error: 'unauthorized' })
const FORBIDDEN = jsonReply(403, { error: 'forbidden' })
const TOO_LARGE = jsonReply(400, { error: 'too_large', field: 'body' }, { Connection: 'close' })
const INTERNAL = jsonReply(500, { error: 'internal' })

export interface CommandDraft {
  name: string
  description: string
  usage: string
  url: string
}

const DRAFT_KEYS = ['name', 'description', 'usage', 'url'] as const
type DraftKey = (typeof DRAFT_KEYS)[number]
const DRAFT_LIMITS: { [key in DraftKey]: number } = {
  name: MAX_COMMAND_NAME_LENGTH,
  description: MAX_DESCRIPTION_LENGTH,
  usage: MAX_USAGE_LENGTH,
  url: MAX_URL_LENGTH
}
const RUN_KEYS: readonly string[] = ['command', 'text', 'channel']

type JsonFields = { [key: string]: Json }
type Parsed<T> = { isValid: true, parsed: T } | { isValid: false, reply: JsonReply }

const invalid = (error: string, field: string): { isValid: false, reply: JsonReply } => ({
  isValid: false,
  reply: jsonReply(400, { error, field })
})

function parseObject (body: string): Parsed<JsonFields> {
  let json: Json
  try {
    // JSON.parse only ever yields values of the Json union.
    json = JSON.parse(body) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return invalid('invalid_json', 'body')
    throw error
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return invalid('invalid_type', 'body')
  return { isValid: true, parsed: json }
}

const isHttpsUrl = (raw: string): boolean => URL.canParse(raw) && new URL(raw).protocol === 'https:'

export function parseDraftChanges (body: string): Parsed<Partial<CommandDraft>> {
  const object = parseObject(body)
  if (!object.isValid) return object
  const changes: Partial<CommandDraft> = {}
  for (const [key, raw] of Object.entries(object.parsed)) {
    const draftKey = DRAFT_KEYS.find((candidate) => candidate === key)
    if (draftKey === undefined) return invalid('unknown_field', key)
    if (typeof raw !== 'string') return invalid('invalid_type', key)
    const text = raw.trim()
    if (text.length > DRAFT_LIMITS[draftKey]) return invalid('too_long', key)
    if (draftKey === 'url' && !isHttpsUrl(text)) return invalid('invalid_url', key)
    changes[draftKey] = draftKey === 'url' ? new URL(text).toString() : text
  }
  if (Object.keys(changes).length === 0) return invalid('empty', 'body')
  return { isValid: true, parsed: changes }
}

export function parseNewDraft (body: string): Parsed<CommandDraft> {
  const changes = parseDraftChanges(body)
  if (!changes.isValid) return changes
  const { name, url, description, usage } = changes.parsed
  if (name === undefined) return invalid('missing_field', 'name')
  if (url === undefined) return invalid('missing_field', 'url')
  return { isValid: true, parsed: { name, url, description: description ?? '', usage: usage ?? '' } }
}

export function parseRunRequest (body: string): Parsed<RunRequest> {
  const object = parseObject(body)
  if (!object.isValid) return object
  const extra = Object.keys(object.parsed).find((key) => !RUN_KEYS.includes(key))
  if (extra !== undefined) return invalid('unknown_field', extra)
  const { command, text, channel } = object.parsed
  if (typeof command !== 'string') return invalid('invalid_type', 'command')
  // Slack ignores case in command names; stored names are lowercase.
  const name = command.toLowerCase()
  if (!isCommandName(name)) return invalid('invalid_name', 'command')
  if (typeof text !== 'string') return invalid('invalid_type', 'text')
  if (text.length > MAX_RUN_TEXT_LENGTH) return invalid('too_long', 'text')
  if (typeof channel !== 'string' || !CHANNEL_ID_PATTERN.test(channel)) return invalid('invalid_type', 'channel')
  // Ids are opaque strings; the workspace lookup decides whether this one exists.
  return { isValid: true, parsed: { command: name, text, channel: channel as Ref<Channel> } }
}

function commandSummary (command: StoredCommand, canManage: boolean): Json {
  const summary: JsonFields = { id: command.id, name: command.name, description: command.description, usage: command.usage }
  if (canManage) summary.url = command.url
  return summary
}

function runReply (outcome: RunOutcome): JsonReply {
  switch (outcome.shown) {
    case 'posted':
    case 'sent':
      return jsonReply(200, { shown: outcome.shown })
    case 'private':
      return jsonReply(200, { shown: 'private', markup: outcome.markup })
    case 'failed':
      return jsonReply(200, 'status' in outcome ? { shown: 'failed', status: outcome.status } : { shown: 'failed', error: outcome.error })
    case 'unknown_command':
      return jsonReply(404, { error: 'unknown_command' })
    case 'channel_denied':
      return jsonReply(403, { error: 'channel_denied' })
    case 'rate_limited':
      return jsonReply(
        429,
        { error: 'rate_limited', retryAfterSeconds: outcome.retryAfterSeconds },
        { 'Retry-After': String(outcome.retryAfterSeconds) }
      )
  }
}

function respondReply (outcome: RespondOutcome): JsonReply {
  switch (outcome.kind) {
    case 'posted':
      return jsonReply(200, { ok: true })
    case 'not_found':
      return NOT_FOUND
    case 'invalid':
      return jsonReply(400, { error: 'invalid_payload' })
    case 'empty':
      return jsonReply(400, { error: 'no_text' })
    case 'channel_closed':
      return jsonReply(403, { error: 'channel_closed' })
  }
}

function preflight (req: IncomingMessage, res: ServerResponse, frontUrl: string): void {
  res.writeHead(204, {
    ...corsHeaders(req, frontUrl),
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
  })
  res.end()
}

// Keeps the routes answering while TRACKER_HOOKS_KEYS is unset, so the UI can say why.
export function createNotConfiguredHandler (frontUrl: string): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      preflight(req, res, frontUrl)
      return
    }
    sendJson(res, jsonReply(503, { error: 'not_configured' }), corsHeaders(req, frontUrl))
  }
}

export function createRequestHandler (deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  // Workspace Owners rank above Maintainers, so both pass.
  const isManager = (caller: Caller): boolean => canManageHooks(caller, [])

  async function hostRefusal (raw: string): Promise<JsonReply | undefined> {
    const url = new URL(raw)
    const port = url.port === '' ? HTTPS_PORT : Number(url.port)
    try {
      await deps.resolveHost(url.hostname.replace(/^\[|\]$/g, ''), port)
      return undefined
    } catch (error) {
      if (error instanceof HostRefusedError) return jsonReply(400, { error: error.reason, field: 'url' })
      throw error
    }
  }

  async function listCommands (caller: Caller): Promise<JsonReply> {
    const commands = await deps.store.listCommands(caller.workspace)
    const canManage = isManager(caller)
    return jsonReply(200, { commands: commands.map((command) => commandSummary(command, canManage)) })
  }

  async function createCommand (req: IncomingMessage, caller: Caller): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    if (!isManager(caller)) return FORBIDDEN
    const parsed = parseNewDraft(body)
    if (!parsed.isValid) return parsed.reply
    const existing = await deps.store.listCommands(caller.workspace)
    const nameError = checkCommandName(parsed.parsed.name, existing.map((command) => command.name))
    if (nameError !== undefined) return jsonReply(400, { error: nameError, field: 'name' })
    if (existing.length >= MAX_COMMANDS_PER_WORKSPACE) return jsonReply(409, { error: 'too_many_commands' })
    const refusal = await hostRefusal(parsed.parsed.url)
    if (refusal !== undefined) return refusal

    const id = newHookId()
    const secret = newSecret()
    const command: StoredCommand = {
      id,
      workspace: caller.workspace,
      name: parsed.parsed.name,
      description: parsed.parsed.description,
      usage: parsed.parsed.usage,
      url: parsed.parsed.url,
      sealedSecret: deps.sealSecret(caller.workspace, id, secret),
      createdBy: caller.account,
      createdOn: deps.now()
    }
    await deps.store.saveCommand(command)
    deps.report('command created', { command: id, workspace: caller.workspace })
    return jsonReply(201, { command: commandSummary(command, true), secret })
  }

  async function managedCommand (caller: Caller, id: string): Promise<{ command: StoredCommand } | { denied: JsonReply }> {
    if (!isManager(caller)) return { denied: FORBIDDEN }
    const command = isHookId(id) ? await deps.store.getCommand(caller.workspace, id) : undefined
    return command === undefined ? { denied: NOT_FOUND } : { command }
  }

  async function updateCommand (req: IncomingMessage, caller: Caller, id: string): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const access = await managedCommand(caller, id)
    if ('denied' in access) return access.denied
    const parsed = parseDraftChanges(body)
    if (!parsed.isValid) return parsed.reply
    const updated: StoredCommand = { ...access.command, ...parsed.parsed }
    if (parsed.parsed.name !== undefined) {
      const others = (await deps.store.listCommands(caller.workspace)).filter((command) => command.id !== id)
      const nameError = checkCommandName(updated.name, others.map((command) => command.name))
      if (nameError !== undefined) return jsonReply(400, { error: nameError, field: 'name' })
    }
    if (parsed.parsed.url !== undefined) {
      const refusal = await hostRefusal(updated.url)
      if (refusal !== undefined) return refusal
    }
    await deps.store.saveCommand(updated)
    deps.report('command updated', { command: id, workspace: caller.workspace })
    return jsonReply(200, { command: commandSummary(updated, true) })
  }

  async function deleteCommand (caller: Caller, id: string): Promise<JsonReply> {
    const access = await managedCommand(caller, id)
    if ('denied' in access) return access.denied
    await deps.store.deleteCommand(caller.workspace, id)
    deps.report('command deleted', { command: id, workspace: caller.workspace })
    return jsonReply(200, { ok: true })
  }

  async function run (req: IncomingMessage, caller: Caller): Promise<JsonReply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) return TOO_LARGE
    const parsed = parseRunRequest(body)
    if (!parsed.isValid) return parsed.reply
    const outcome = await runCommand(deps, caller, parsed.parsed)
    deps.report('command run', { workspace: caller.workspace, command: parsed.parsed.command, shown: outcome.shown })
    return runReply(outcome)
  }

  async function respond (req: IncomingMessage, token: string): Promise<JsonReply> {
    if (!isSecret(token)) return NOT_FOUND
    const body = await readBody(req, MAX_RESPOND_BYTES)
    if (body === undefined) return TOO_LARGE
    return respondReply(await respondToCommand(deps, token, body))
  }

  async function management (req: IncomingMessage, segments: string[]): Promise<JsonReply> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return UNAUTHORIZED
    if (segments.length === 3 && req.method === 'GET') return await listCommands(caller)
    if (segments.length === 3 && req.method === 'POST') return await createCommand(req, caller)
    if (segments.length !== 4) return NOT_FOUND
    const id = segments[3]
    if (id === 'run' && req.method === 'POST') return await run(req, caller)
    if (req.method === 'PATCH') return await updateCommand(req, caller, id)
    if (req.method === 'DELETE') return await deleteCommand(caller, id)
    return NOT_FOUND
  }

  return async (req, res) => {
    const segments = pathSegments(req.url)
    if (segments === undefined || segments[0] !== 'v1' || segments[1] !== 'chat' || segments[2] !== 'commands') {
      sendJson(res, NOT_FOUND, {})
      return
    }
    // Apps call the response URL server to server: no session, no CORS.
    if (req.method === 'POST' && segments.length === 5 && segments[3] === 'respond') {
      try {
        sendJson(res, await respond(req, segments[4]), {})
      } catch (error) {
        deps.report('command respond failed', { error: error instanceof Error ? error.message : String(error) })
        sendJson(res, INTERNAL, {})
      }
      return
    }
    if (req.method === 'OPTIONS') {
      preflight(req, res, deps.frontUrl)
      return
    }
    const cors = corsHeaders(req, deps.frontUrl)
    try {
      sendJson(res, await management(req, segments), cors)
    } catch (error) {
      deps.report('command route failed', { error: error instanceof Error ? error.message : String(error) })
      sendJson(res, INTERNAL, cors)
    }
  }
}
