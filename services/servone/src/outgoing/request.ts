import type { IncomingMessage, ServerResponse } from 'http'
import { HostRefusedError } from '../host-guard'
import { corsHeaders, type Json, jsonReply, type JsonReply, sendJson } from '../http-json'

export const MAX_URL_LENGTH = 2048
const HTTPS_PORT = 443
const PREFLIGHT_MAX_AGE_SECONDS = 600
const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE'

export type Parsed<T> = { isValid: true, parsed: T } | { isValid: false, reply: JsonReply }

export const invalid = (error: string, field: string): { isValid: false, reply: JsonReply } => ({
  isValid: false,
  reply: jsonReply(400, { error, field })
})

export type JsonFields = { [key: string]: Json }

export function parseObject (body: string, allowedKeys: readonly string[]): Parsed<JsonFields> {
  let json: Json
  try {
    json = JSON.parse(body) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return invalid('invalid_json', 'body')
    throw error
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return invalid('invalid_type', 'body')
  const extra = Object.keys(json).find((key) => !allowedKeys.includes(key))
  if (extra !== undefined) return invalid('unknown_field', extra)
  return { isValid: true, parsed: json }
}

export function parseUrl (field: Json): Parsed<URL> {
  if (typeof field !== 'string') return invalid('invalid_type', 'url')
  if (field.length > MAX_URL_LENGTH) return invalid('too_long', 'url')
  if (!URL.canParse(field)) return invalid('invalid_url', 'url')
  const url = new URL(field)
  if (url.protocol !== 'https:') return invalid('not_https', 'url')
  if (url.username !== '' || url.password !== '') return invalid('has_credentials', 'url')
  return { isValid: true, parsed: url }
}

// resolveHost throws HostRefusedError for a private or unknown host.
export async function hostRefusal (
  url: URL,
  resolveHost: (host: string, port: number) => Promise<string>
): Promise<JsonReply | undefined> {
  const port = url.port === '' ? HTTPS_PORT : Number(url.port)
  try {
    await resolveHost(url.hostname.replace(/^\[|\]$/g, ''), port)
    return undefined
  } catch (error) {
    if (error instanceof HostRefusedError) return jsonReply(400, { error: error.reason, field: 'url' })
    throw error
  }
}

export function preflight (req: IncomingMessage, res: ServerResponse, frontUrl: string): void {
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
