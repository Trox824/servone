import { z } from 'zod'

import type { Json } from '../../http-json'
import { type Fetch, VENDOR_TIMEOUT_MS } from './providers'
import type { Connection } from './store'

export const MAX_VENDOR_RESPONSE_BYTES = 20 * 1024 * 1024
const MAX_PATH_LENGTH = 2048
const REFRESH_MARGIN_MS = 60_000
const SAFE_PATH = /^\/[A-Za-z0-9._~\-/{}:@%]*$/
const ENCODED_SEPARATOR = /%(2e|2f|5c)/i
const RATE_LIMITED = 429
const SERVER_ERROR = 500

export const apiRequest = z.object({
  method: z.enum(['GET', 'POST', 'DELETE']),
  path: z.string().min(1).max(MAX_PATH_LENGTH),
  query: z.array(z.tuple([z.string(), z.string()])).optional(),
  body: z.json().optional()
})
export type ApiRequest = z.infer<typeof apiRequest>

export interface ApiResponse {
  status: number
  body: Json
  retryAfterSeconds?: number
}

export type CallOutcome = { response: ApiResponse } | { error: 'forbidden_request' | 'upstream_timeout' | 'upstream_failed' | 'upstream_too_large' }

const discordChannel = z.object({ guild_id: z.string() })

function isSafePath (path: string): boolean {
  return SAFE_PATH.test(path) && !path.includes('..') && !path.includes('//') && !ENCODED_SEPARATOR.test(path)
}

async function readCapped (response: Response): Promise<string | undefined> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_VENDOR_RESPONSE_BYTES) {
    await response.body?.cancel()
    return undefined
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > MAX_VENDOR_RESPONSE_BYTES) {
      await reader.cancel()
      return undefined
    }
    chunks.push(chunk.value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function bodyOf (contentType: string, text: string): Json {
  if (!/json/i.test(contentType)) return text
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return text
    throw error
  }
}

async function send (fetch: Fetch, url: string, init: RequestInit): Promise<CallOutcome> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS) })
    const text = await readCapped(response)
    if (text === undefined) return { error: 'upstream_too_large' }
    const apiResponse: ApiResponse = { status: response.status, body: bodyOf(response.headers.get('content-type') ?? '', text) }
    const retryAfter = response.headers.get('retry-after')
    const seconds = Number(retryAfter)
    if (retryAfter !== null && retryAfter !== '' && Number.isFinite(seconds) && seconds >= 0) apiResponse.retryAfterSeconds = Math.ceil(seconds)
    return { response: apiResponse }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') return { error: 'upstream_timeout' }
    if (error instanceof TypeError) return { error: 'upstream_failed' }
    throw error
  }
}

async function refreshIfExpiring (fetch: Fetch, connection: Connection, now: number): Promise<void> {
  if (connection.refreshToken === undefined || connection.tokenExpiresAt === undefined || connection.tokenExpiresAt - now > REFRESH_MARGIN_MS) return
  const grant = await connection.provider.redeem(fetch, { kind: 'refresh', refreshToken: connection.refreshToken }, now)
  connection.token = grant.token
  if (grant.refreshToken !== undefined) connection.refreshToken = grant.refreshToken
  connection.tokenExpiresAt = grant.expiresAt
}

async function checkGuildChannel (fetch: Fetch, connection: Connection, channel: string): Promise<CallOutcome | undefined> {
  if (connection.channels.has(channel)) return undefined
  const lookup = await send(fetch, `${connection.provider.apiBase}/api/v10/channels/${channel}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...connection.provider.credentials(connection.token).headers }
  })
  if ('error' in lookup || lookup.response.status === RATE_LIMITED || lookup.response.status >= SERVER_ERROR) return lookup
  const parsed = discordChannel.safeParse(lookup.response.body)
  if (lookup.response.status !== 200 || !parsed.success || parsed.data.guild_id !== connection.guildId) return { error: 'forbidden_request' }
  connection.channels.add(channel)
  return undefined
}

export async function callVendor (fetch: Fetch, connection: Connection, request: ApiRequest, now: number): Promise<CallOutcome> {
  const { provider } = connection
  if (!isSafePath(request.path)) return { error: 'forbidden_request' }
  const match = provider.rules.map((rule) => (rule.method === request.method ? rule.path.exec(request.path) : null)).find((found) => found !== null)
  if (match === undefined || match === null) return { error: 'forbidden_request' }
  const path = request.path.replace('{guild}', connection.guildId ?? '')
  const url = new URL(provider.apiBase + path)
  if (url.origin !== provider.apiBase || url.pathname !== path) return { error: 'forbidden_request' }

  await refreshIfExpiring(fetch, connection, now)
  const channel = match.groups?.channel
  if (channel !== undefined) {
    const refused = await checkGuildChannel(fetch, connection, channel)
    if (refused !== undefined) return refused
  }

  const credentials = provider.credentials(connection.token)
  const reserved = new Set(credentials.query.map(([name]) => name))
  for (const [name, param] of request.query ?? []) if (!reserved.has(name)) url.searchParams.append(name, param)
  for (const [name, param] of credentials.query) url.searchParams.append(name, param)
  const headers: Record<string, string> = { Accept: 'application/json', ...credentials.headers }
  const init: RequestInit = { method: request.method, headers }
  if (request.method === 'POST' && request.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(request.body)
  }
  return await send(fetch, url.toString(), init)
}
