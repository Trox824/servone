import type { ActivityMessage } from '@hcengineering/activity'
import { Analytics } from '@hcengineering/analytics'
import type { Channel, ChatMessage } from '@hcengineering/chunter'
import type { AccountUuid, Ref } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'

export const WEBHOOK_NAME_ATTR = 'servoneWebhookName' satisfies keyof WebhookMessage
export const WEBHOOK_COLOR_ATTR = 'servoneWebhookColor' satisfies keyof WebhookMessage
export const WEBHOOK_THREAD_ATTR = 'servoneWebhookThread' satisfies keyof WebhookMessage

export interface WebhookMessage extends ActivityMessage {
  servoneWebhookName?: string
  servoneWebhookColor?: string
  servoneWebhookThread?: Ref<ChatMessage>
}

const NAMED_COLOR_VARS = {
  danger: 'var(--theme-state-negative-color)',
  warning: 'var(--theme-warning-color)',
  good: 'var(--theme-state-positive-color)',
  info: 'var(--theme-state-primary-color)'
} as const
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/

function isNamedColor (raw: string): raw is keyof typeof NAMED_COLOR_VARS {
  return Object.hasOwn(NAMED_COLOR_VARS, raw)
}

export interface WebhookCall {
  at: number
  status: number
  count: number | undefined
}

export interface WebhookSummary {
  id: string
  name: string
  createdBy: AccountUuid
  createdOn: number
  revokedOn: number | undefined
  lastCall: WebhookCall | undefined
  allowMentions: boolean
  rateLimitedOn: number | undefined
}

export interface CreatedWebhook {
  id: string
  url: string
  slackUrl: string
}

export class ServiceApiError extends Error {
  constructor (readonly status: number, readonly code: string, readonly field?: string) {
    super(`Servone service ${status}: ${code}`)
  }
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = Record<string, Json>

export function isObject (json: Json | undefined): json is JsonObject {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

export function malformed (what: string): ServiceApiError {
  return new ServiceApiError(0, `malformed ${what}`)
}

function readString (object: JsonObject, key: string, what: string): string {
  const raw = object[key]
  if (typeof raw !== 'string') throw malformed(what)
  return raw
}

function readNumber (object: JsonObject, key: string, what: string): number {
  const raw = object[key]
  if (typeof raw !== 'number') throw malformed(what)
  return raw
}

function readCall (json: Json | undefined): WebhookCall {
  if (!isObject(json)) throw malformed('call')
  const count = json.count
  return {
    at: readNumber(json, 'at', 'call'),
    status: readNumber(json, 'status', 'call'),
    count: typeof count === 'number' ? count : undefined
  }
}

export function parseWebhookSummaries (json: Json): WebhookSummary[] {
  if (!isObject(json) || !Array.isArray(json.hooks)) throw malformed('hook list')
  return json.hooks.map((entry) => {
    if (!isObject(entry)) throw malformed('hook')
    const revokedOn = entry.revokedOn
    const lastCall = entry.lastCall
    const rateLimitedOn = entry.rateLimitedOn
    return {
      id: readString(entry, 'id', 'hook'),
      name: readString(entry, 'name', 'hook'),
      createdBy: readString(entry, 'createdBy', 'hook') as AccountUuid,
      createdOn: readNumber(entry, 'createdOn', 'hook'),
      revokedOn: typeof revokedOn === 'number' ? revokedOn : undefined,
      lastCall: lastCall === null || lastCall === undefined ? undefined : readCall(lastCall),
      allowMentions: entry.allowMentions === true,
      rateLimitedOn: typeof rateLimitedOn === 'number' ? rateLimitedOn : undefined
    }
  })
}

export function parseWebhookCalls (json: Json): WebhookCall[] {
  if (!isObject(json) || !Array.isArray(json.calls)) throw malformed('call log')
  return json.calls.map(readCall)
}

export function parseCreatedWebhook (json: Json): CreatedWebhook {
  if (!isObject(json)) throw malformed('created hook')
  return {
    id: readString(json, 'id', 'created hook'),
    url: readString(json, 'url', 'created hook'),
    slackUrl: readString(json, 'slackUrl', 'created hook')
  }
}

export type ServoneServiceKey = 'SERVONE_WEBHOOKS_URL' | 'SERVONE_MCP_URL'

export function parseServiceUrl (json: Json, key: ServoneServiceKey): string | undefined {
  if (!isObject(json)) return undefined
  const url = json[key]
  return typeof url === 'string' && url !== '' ? url.replace(/\/+$/, '') : undefined
}

let servoneConfig: Promise<Json> | undefined

export async function servoneServiceUrl (key: ServoneServiceKey): Promise<string | undefined> {
  servoneConfig ??= fetch('/servone-config.json', { cache: 'no-cache' }).then(async (response) => {
    const isJson = response.headers.get('content-type')?.includes('json') ?? false
    return response.ok && isJson ? ((await response.json()) as Json) : null
  })
  return parseServiceUrl(await servoneConfig, key)
}

export async function webhooksServiceUrl (): Promise<string | undefined> {
  return await servoneServiceUrl('SERVONE_WEBHOOKS_URL')
}

type ServiceMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

const ROUTE_SEGMENT = /^(v\d+|[a-z][a-z-]*)?$/

export function endpointOf (path: string): string {
  return path
    .split('?')[0]
    .split('/')
    .map((segment) => (ROUTE_SEGMENT.test(segment) ? segment : '[id]'))
    .join('/')
}

export async function serviceCall<Body> (method: ServiceMethod, path: string, body?: Body): Promise<{ status: number, json: Json }> {
  const base = await webhooksServiceUrl()
  if (base === undefined) throw new ServiceApiError(0, 'not_configured')
  const token = getMetadata(presentation.metadata.Token) ?? ''
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (method !== 'GET') {
    Analytics.handleEvent(response.ok ? 'api_succeeded' : 'api_failed', {
      method,
      endpoint: endpointOf(path),
      http_status: response.status
    })
  }
  if (response.status === 204) return { status: 204, json: null }
  return { status: response.status, json: (await response.json()) as Json }
}

export function serviceError (status: number, json: Json): ServiceApiError {
  const code = isObject(json) && typeof json.error === 'string' ? json.error : 'unknown'
  const field = isObject(json) && typeof json.field === 'string' ? json.field : undefined
  return new ServiceApiError(status, code, field)
}

export async function serviceRequest<Body> (method: ServiceMethod, path: string, body?: Body): Promise<Json> {
  const { status, json } = await serviceCall(method, path, body)
  if (status < 200 || status >= 300) throw serviceError(status, json)
  return json
}

export async function listWebhooks (channel: Ref<Channel>): Promise<WebhookSummary[]> {
  return parseWebhookSummaries(await serviceRequest('GET', `/v1/channels/${encodeURIComponent(channel)}/hooks`))
}

export async function createWebhook (channel: Ref<Channel>, name: string): Promise<CreatedWebhook> {
  return parseCreatedWebhook(await serviceRequest('POST', `/v1/channels/${encodeURIComponent(channel)}/hooks`, { name }))
}

export async function revokeWebhook (id: string): Promise<void> {
  await serviceRequest('DELETE', `/v1/hooks/${encodeURIComponent(id)}`)
}

export async function setAllowMentions (id: string, isAllowed: boolean): Promise<void> {
  await serviceRequest('PATCH', `/v1/hooks/${encodeURIComponent(id)}`, { allowMentions: isAllowed })
}

export async function readWebhookLog (id: string): Promise<WebhookCall[]> {
  return parseWebhookCalls(await serviceRequest('GET', `/v1/hooks/${encodeURIComponent(id)}/log`))
}

export function webhookName (message: ActivityMessage): string | undefined {
  const webhook: WebhookMessage = message
  const name = webhook[WEBHOOK_NAME_ATTR]
  return name !== undefined && name !== '' ? name : undefined
}

export function webhookColor (message: ActivityMessage): string | undefined {
  const webhook: WebhookMessage = message
  const raw = webhook[WEBHOOK_COLOR_ATTR]
  if (raw === undefined) return undefined
  if (isNamedColor(raw)) return NAMED_COLOR_VARS[raw]
  return HEX_COLOR_PATTERN.test(raw) ? raw : undefined
}

export function webhookThread (message: ActivityMessage): Ref<ChatMessage> | undefined {
  const webhook: WebhookMessage = message
  const parent = webhook[WEBHOOK_THREAD_ATTR]
  return parent !== undefined && parent !== '' ? parent : undefined
}
