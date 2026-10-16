import type { IncomingMessage, ServerResponse } from 'http'
import { z } from 'zod'

import { readBody } from '../../http-body'
import type { Json } from '../../http-json'
import type { RouteHandler } from '../server'
import type { Caller } from '../types'
import { type ClientMetadata, ClientMetadataError, isAllowedRedirectUri, matchesRedirectUri } from './clients'
import { isCodeVerifier, s256 } from './pkce'
import type { AuthRequest, OAuthStore } from './store'

export const REQUEST_TTL_MS = 10 * 60_000
export const CODE_TTL_MS = 60_000 // RFC 6749 recommends <= 10 min; short since the client redeems immediately
export const MAX_BODY_BYTES = 16 * 1024
// Shown on the consent page and folded into the API token name.
const MAX_CLIENT_NAME_LENGTH = 100
// state is stored and echoed back verbatim, so an unbounded one would bloat hulykvs.
const MAX_STATE_LENGTH = 1024
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/ // base64url of a SHA-256 digest
const PREFLIGHT_MAX_AGE_SECONDS = 600
const MS_PER_SECOND = 1000

export interface OAuthDeps {
  publicUrl: string
  frontUrl: string
  store: OAuthStore
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  fetchClientMetadata: (url: string) => Promise<ClientMetadata>
  now: () => number
  randomId: () => string
}

interface Reply {
  status: number
  body: Json
  headers?: Record<string, string>
}

const reply = (status: number, body: Json, headers?: Record<string, string>): Reply =>
  headers === undefined ? { status, body } : { status, body, headers }

const oauthError = (status: number, error: string, description: string): Reply =>
  reply(status, { error, error_description: description })

const redirect = (location: string): Reply => reply(302, null, { Location: location })

const NOT_FOUND = reply(404, { error: 'not_found' })
const METHOD_NOT_ALLOWED = reply(405, { error: 'method_not_allowed' })
const PUBLIC_CORS = { 'Access-Control-Allow-Origin': '*' }

const optionalParam = z.string().optional()
const authorizeQuerySchema = z.object({
  client_id: optionalParam,
  redirect_uri: optionalParam,
  response_type: optionalParam,
  code_challenge: optionalParam,
  code_challenge_method: optionalParam,
  state: optionalParam,
  resource: optionalParam
})
const tokenFormSchema = z.object({
  grant_type: optionalParam,
  code: optionalParam,
  redirect_uri: optionalParam,
  client_id: optionalParam,
  code_verifier: optionalParam
})
const registrationSchema = z.object({
  redirect_uris: z.array(z.string()).min(1),
  client_name: optionalParam,
  token_endpoint_auth_method: optionalParam
})

function hasContentType (req: IncomingMessage, expected: string): boolean {
  return (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === expected
}

function send (res: ServerResponse, outcome: Reply, extraHeaders: Record<string, string>): void {
  if (outcome.body === null) {
    res.writeHead(outcome.status, { 'Cache-Control': 'no-store', ...extraHeaders, ...outcome.headers })
    res.end()
    return
  }
  res.writeHead(outcome.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
    ...outcome.headers
  })
  res.end(JSON.stringify(outcome.body))
}

function preflight (res: ServerResponse, cors: Record<string, string>, methods: string, headers: string): void {
  res.writeHead(204, {
    ...cors,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': headers,
    'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
  })
  res.end()
}

function displayName (name: string | undefined, fallbackUrl: string): string {
  const trimmed = name?.trim().slice(0, MAX_CLIENT_NAME_LENGTH) ?? ''
  return trimmed !== '' ? trimmed : new URL(fallbackUrl).host
}

interface ResolvedClient {
  clientName: string
  redirectUris: string[]
}

export function createOAuthRoutes (deps: OAuthDeps): RouteHandler {
  const resource = `${deps.publicUrl}/mcp`
  const protectedResource = {
    resource,
    authorization_servers: [deps.publicUrl],
    bearer_methods_supported: ['header']
  } satisfies Json
  const authorizationServer = {
    issuer: deps.publicUrl,
    authorization_endpoint: `${deps.publicUrl}/oauth/authorize`,
    token_endpoint: `${deps.publicUrl}/oauth/token`,
    registration_endpoint: `${deps.publicUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true
  } satisfies Json

  function metadataFor (path: string[]): Json | undefined {
    const [, name, suffix] = path
    if (name === 'oauth-authorization-server' && path.length === 2) return authorizationServer
    if (name === 'oauth-protected-resource' && (path.length === 2 || (path.length === 3 && suffix === 'mcp'))) {
      return protectedResource
    }
    return undefined
  }

  // RFC 9207: iss lets the client reject a response minted by another authorization server.
  function clientRedirect (redirectUri: string, state: string | undefined, params: Array<[string, string]>): string {
    const url = new URL(redirectUri)
    for (const [key, param] of params) url.searchParams.set(key, param)
    if (state !== undefined) url.searchParams.set('state', state)
    url.searchParams.set('iss', deps.publicUrl)
    return url.toString()
  }

  // An https client_id is a Client ID Metadata Document url; anything else was issued by /oauth/register.
  async function resolveClient (clientId: string): Promise<ResolvedClient | undefined> {
    if (clientId.startsWith('https://')) {
      const document = await deps.fetchClientMetadata(clientId)
      return {
        clientName: displayName(document.client_name, clientId),
        redirectUris: document.redirect_uris.filter(isAllowedRedirectUri)
      }
    }
    return await deps.store.getClient(clientId)
  }

  async function register (req: IncomingMessage): Promise<Reply> {
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) {
      return reply(400, { error: 'invalid_client_metadata', error_description: 'body is too large' }, { Connection: 'close' })
    }
    let parsed
    try {
      parsed = registrationSchema.safeParse(JSON.parse(body))
    } catch (error) {
      if (error instanceof SyntaxError) return oauthError(400, 'invalid_client_metadata', 'body is not JSON')
      throw error
    }
    if (!parsed.success) return oauthError(400, 'invalid_client_metadata', 'redirect_uris is required')
    const registration = parsed.data
    const authMethod = registration.token_endpoint_auth_method
    if (authMethod !== undefined && authMethod !== 'none') {
      return oauthError(400, 'invalid_client_metadata', 'only public clients are supported')
    }
    const badUri = registration.redirect_uris.find((uri) => !isAllowedRedirectUri(uri))
    if (badUri !== undefined) {
      return oauthError(400, 'invalid_redirect_uri', `${badUri} must be https or an http loopback address`)
    }
    const now = deps.now()
    const client = {
      clientId: deps.randomId(),
      clientName: displayName(registration.client_name, registration.redirect_uris[0]),
      redirectUris: registration.redirect_uris,
      createdOn: now
    }
    await deps.store.saveClient(client)
    return reply(201, {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(now / MS_PER_SECOND),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code']
    })
  }

  async function authorize (req: IncomingMessage): Promise<Reply> {
    const query = authorizeQuerySchema.parse(Object.fromEntries(new URL(req.url ?? '/', deps.publicUrl).searchParams))
    if (query.client_id === undefined) return oauthError(400, 'invalid_request', 'client_id is required')
    let client
    try {
      client = await resolveClient(query.client_id)
    } catch (error) {
      if (error instanceof ClientMetadataError) return oauthError(400, 'invalid_client', error.message)
      throw error
    }
    if (client === undefined) return oauthError(400, 'invalid_client', 'unknown client_id')
    const redirectUri = query.redirect_uri
    if (redirectUri === undefined || !matchesRedirectUri(client.redirectUris, redirectUri)) {
      return oauthError(400, 'invalid_request', 'redirect_uri is not registered for this client')
    }
    const state = query.state
    if (state !== undefined && state.length > MAX_STATE_LENGTH) {
      return oauthError(400, 'invalid_request', 'state is too long')
    }

    const fail = (error: string, description: string): Reply =>
      redirect(clientRedirect(redirectUri, state, [['error', error], ['error_description', description]]))
    if (query.response_type !== 'code') return fail('unsupported_response_type', 'response_type must be code')
    if (query.code_challenge_method !== 'S256') return fail('invalid_request', 'code_challenge_method must be S256')
    const codeChallenge = query.code_challenge
    if (codeChallenge === undefined || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
      return fail('invalid_request', 'code_challenge is missing or malformed')
    }
    if (query.resource !== undefined && query.resource !== resource) {
      return fail('invalid_target', `resource must be ${resource}`)
    }

    const request: AuthRequest = {
      id: deps.randomId(),
      clientId: query.client_id,
      clientName: client.clientName,
      redirectUri,
      codeChallenge,
      state,
      expiresAt: deps.now() + REQUEST_TTL_MS
    }
    await deps.store.saveRequest(request)
    return redirect(`${deps.frontUrl}/login/mcpAuthorize?request=${encodeURIComponent(request.id)}`)
  }

  async function token (req: IncomingMessage): Promise<Reply> {
    if (!hasContentType(req, 'application/x-www-form-urlencoded')) {
      return oauthError(400, 'invalid_request', 'body must be application/x-www-form-urlencoded')
    }
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body === undefined) {
      return reply(400, { error: 'invalid_request', error_description: 'body is too large' }, { Connection: 'close' })
    }
    const form = tokenFormSchema.parse(Object.fromEntries(new URLSearchParams(body)))
    if (form.grant_type === undefined) return oauthError(400, 'invalid_request', 'grant_type is required')
    if (form.grant_type !== 'authorization_code') {
      return oauthError(400, 'unsupported_grant_type', 'only authorization_code is supported')
    }
    const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier } = form
    if (code === undefined || redirectUri === undefined || clientId === undefined || verifier === undefined) {
      return oauthError(400, 'invalid_request', 'code, redirect_uri, client_id and code_verifier are required')
    }
    const now = deps.now()
    const grant = await deps.store.takeCode(code, now)
    if (grant === undefined) return oauthError(400, 'invalid_grant', 'code is invalid, expired or already used')
    if (grant.clientId !== clientId) return oauthError(400, 'invalid_grant', 'code was issued to another client')
    if (grant.redirectUri !== redirectUri) return oauthError(400, 'invalid_grant', 'redirect_uri does not match')
    if (!isCodeVerifier(verifier) || s256(verifier) !== grant.codeChallenge) {
      return oauthError(400, 'invalid_grant', 'code_verifier does not match')
    }
    return reply(
      200,
      {
        access_token: grant.apiToken,
        token_type: 'Bearer',
        expires_in: Math.max(0, Math.floor((grant.apiTokenExpiresAt - now) / MS_PER_SECOND))
      },
      { Pragma: 'no-cache' }
    )
  }

  async function consent (req: IncomingMessage, requestId: string, action: string | undefined): Promise<Reply> {
    const now = deps.now()
    if (action === undefined) {
      if (req.method !== 'GET') return METHOD_NOT_ALLOWED
      const request = await deps.store.getRequest(requestId, now)
      if (request === undefined) return NOT_FOUND
      return reply(200, { clientName: request.clientName, redirectHost: new URL(request.redirectUri).host })
    }
    if (req.method !== 'POST') return METHOD_NOT_ALLOWED
    if (action === 'deny') {
      const request = await deps.store.takeRequest(requestId, now)
      if (request === undefined) return NOT_FOUND
      return reply(200, {
        redirectTo: clientRedirect(request.redirectUri, request.state, [['error', 'access_denied']])
      })
    }
    // Checked before the token so a rejected token leaves the request for a retry.
    if ((await deps.store.getRequest(requestId, now)) === undefined) return NOT_FOUND
    // The consent page mints a fresh API token; authenticating it proves it is real, unrevoked and workspace-bound.
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return reply(400, { error: 'invalid_token' })
    const request = await deps.store.takeRequest(requestId, now)
    if (request === undefined) return NOT_FOUND
    const code = deps.randomId()
    await deps.store.saveCode({
      code,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      apiToken: caller.token,
      apiTokenExpiresAt: caller.expiresAt,
      expiresAt: now + CODE_TTL_MS
    })
    return reply(200, { redirectTo: clientRedirect(request.redirectUri, request.state, [['code', code]]) })
  }

  function frontCors (req: IncomingMessage): Record<string, string> {
    if (req.headers.origin !== deps.frontUrl) return { Vary: 'Origin' }
    return { 'Access-Control-Allow-Origin': deps.frontUrl, Vary: 'Origin' }
  }

  return async (req, res, path) => {
    const [root, name, requestId, action] = path
    if (root === '.well-known') {
      const metadata = metadataFor(path)
      if (metadata === undefined) return false
      if (req.method === 'OPTIONS') preflight(res, PUBLIC_CORS, 'GET', '*')
      else send(res, req.method === 'GET' ? reply(200, metadata) : METHOD_NOT_ALLOWED, PUBLIC_CORS)
      return true
    }
    if (root !== 'oauth') return false

    if (path.length === 2 && name === 'authorize') {
      send(res, req.method === 'GET' ? await authorize(req) : METHOD_NOT_ALLOWED, {})
      return true
    }
    if (path.length === 2 && name === 'token') {
      send(res, req.method === 'POST' ? await token(req) : METHOD_NOT_ALLOWED, {})
      return true
    }
    if (path.length === 2 && name === 'register') {
      send(res, req.method === 'POST' ? await register(req) : METHOD_NOT_ALLOWED, {})
      return true
    }
    const isConsentPath =
      name === 'requests' && (path.length === 3 || (path.length === 4 && (action === 'approve' || action === 'deny')))
    if (!isConsentPath) return false
    const cors = frontCors(req)
    if (req.method === 'OPTIONS') preflight(res, cors, 'GET, POST', 'Authorization, Content-Type')
    else send(res, await consent(req, requestId, action), cors)
    return true
  }
}
