import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'
import { ConnectorError, type ApiCall, type ApiResponse, type ScopeOption, type Source, type SourceId } from '@servone/import'
import { isObject, malformed, ServiceApiError, serviceError, type Json } from '../../chunter-resources/webhooks/api'

export const CONNECT_MESSAGE_TYPE = 'servone-import-connect'
const POPUP_POLL_MS = 500
const CLOSED_GRACE_MS = 300

export type ConnectFailureReason = 'blocked' | 'closed' | 'denied' | 'expired' | 'failed' | 'not_configured'

export class ConnectFailure extends Error {
  constructor (readonly reason: ConnectFailureReason) {
    super(`Connect ${reason}`)
  }
}

export type ConnectReply = { connection: string } | { failure: ConnectFailure }

export interface ScopeGroup {
  parentName: string | undefined
  scopes: ScopeOption[]
}

export async function postService<Body> (base: string, path: string, body: Body): Promise<Json> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getMetadata(presentation.metadata.Token) ?? ''}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const isJson = response.headers.get('content-type')?.includes('json') ?? false
  const json = isJson ? ((await response.json()) as Json) : null
  if (!response.ok) throw serviceError(response.status, json)
  return json
}

export function parseConnectable (json: Json, known: Source[]): Set<SourceId> {
  const listed = isObject(json) ? json.sources : undefined
  if (!Array.isArray(listed)) throw malformed('connect sources')
  return new Set(known.filter((source) => listed.includes(source.id)).map((source) => source.id))
}

export async function listConnectable (base: string, known: Source[]): Promise<Set<SourceId>> {
  return parseConnectable(await postService(base, '/v1/import/connect/sources', {}), known)
}

export async function startConnect (base: string, source: SourceId): Promise<string> {
  try {
    const json = await postService(base, '/v1/import/connect/start', { source })
    if (!isObject(json) || typeof json.url !== 'string') throw malformed('connect start')
    return json.url
  } catch (error) {
    if (error instanceof ServiceApiError && error.code === 'not_configured') throw new ConnectFailure('not_configured')
    throw error
  }
}

export function parseApiResponse (json: Json): ApiResponse {
  if (!isObject(json) || typeof json.status !== 'number' || !('body' in json)) throw malformed('connect call')
  const retryAfterSeconds = json.retryAfterSeconds
  if (retryAfterSeconds !== undefined && typeof retryAfterSeconds !== 'number') throw malformed('connect call')
  return { status: json.status, body: json.body, retryAfterSeconds }
}

export function connectionApi (base: string, connection: string): ApiCall {
  return async (request) => parseApiResponse(await postService(base, '/v1/import/connect/call', { connection, request }))
}

export async function endConnection (base: string, connection: string): Promise<void> {
  await postService(base, '/v1/import/connect/end', { connection })
}

export function readConnectReply (
  event: MessageEvent,
  serviceOrigin: string,
  popup: MessageEventSource,
  source: SourceId
): ConnectReply | undefined {
  if (event.origin !== serviceOrigin || event.source !== popup) return undefined
  const message: Json = event.data
  if (!isObject(message) || message.type !== CONNECT_MESSAGE_TYPE || message.source !== source) return undefined
  if (typeof message.connection === 'string' && message.connection !== '') return { connection: message.connection }
  const reason = message.error === 'denied' || message.error === 'expired' ? message.error : 'failed'
  return { failure: new ConnectFailure(reason) }
}

export async function awaitConnection (
  popup: Window,
  serviceOrigin: string,
  source: SourceId,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted()
  return await new Promise<string>((resolve, reject) => {
    const finish = (): void => {
      clearInterval(poll)
      window.removeEventListener('message', onMessage)
      signal.removeEventListener('abort', onAbort)
    }
    const onMessage = (event: MessageEvent): void => {
      const reply = readConnectReply(event, serviceOrigin, popup, source)
      if (reply === undefined) return
      finish()
      if ('connection' in reply) resolve(reply.connection)
      else reject(reply.failure)
    }
    const onAbort = (): void => {
      finish()
      popup.close()
      reject(new ConnectFailure('closed'))
    }
    const poll = setInterval(() => {
      if (!popup.closed) return
      clearInterval(poll)
      setTimeout(() => {
        finish()
        reject(new ConnectFailure('closed'))
      }, CLOSED_GRACE_MS)
    }, POPUP_POLL_MS)
    window.addEventListener('message', onMessage)
    signal.addEventListener('abort', onAbort)
  })
}

export function isAccessLost (error: Error): boolean {
  if (error instanceof ServiceApiError) return error.code === 'not_connected'
  return error instanceof ConnectorError && (error.status === 401 || error.status === 403)
}

export function groupScopes (scopes: ScopeOption[]): ScopeGroup[] {
  const groups = new Map<string | undefined, ScopeOption[]>()
  for (const scope of scopes) {
    const group = groups.get(scope.parentName)
    if (group === undefined) groups.set(scope.parentName, [scope])
    else group.push(scope)
  }
  return [...groups].map(([parentName, grouped]) => ({ parentName, scopes: grouped }))
}
