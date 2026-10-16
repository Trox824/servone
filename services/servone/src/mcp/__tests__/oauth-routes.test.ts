import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

import { ClientMetadataError, type ClientMetadata } from '../oauth/clients'
import { randomId, s256 } from '../oauth/pkce'
import { CODE_TTL_MS, createOAuthRoutes, MAX_BODY_BYTES, REQUEST_TTL_MS } from '../oauth/routes'
import { OAuthStore } from '../oauth/store'
import type { Caller } from '../types'

const PUBLIC_URL = 'https://mcp.servone.vn'
const FRONT_URL = 'https://app.servone.vn'
const RESOURCE = `${PUBLIC_URL}/mcp`
const API_TOKEN = 'api-token-good'
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'
const CIMD_URL = 'https://client.example/meta.json'
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CHALLENGE = s256(VERIFIER)
const TOKEN_LIFETIME_MS = 90 * 24 * 3_600_000

class MemoryKv implements KeyValueClient {
  readonly entries = new Map<string, string>()

  async setValue<T>(key: string, stored: T): Promise<void> {
    this.entries.set(key, JSON.stringify(stored))
  }

  async getValue<T>(key: string): Promise<T | null> {
    const raw = this.entries.get(key)
    return raw === undefined ? null : JSON.parse(raw)
  }

  async deleteKey (key: string): Promise<void> {
    this.entries.delete(key)
  }

  async listKeys (prefix?: string): Promise<ListResult | null> {
    const keys = [...this.entries.keys()].filter((key) => key.startsWith(prefix ?? ''))
    return { keys, count: keys.length, namespace: 'test' }
  }
}

const KV_LATENCY_MS = 20 // longer than it takes the second HTTP request to reach the handler
// A real hulykvs call yields to the event loop, which is what lets two requests interleave.
class LaggyKv extends MemoryKv {
  async getValue<T>(key: string): Promise<T | null> {
    await new Promise((resolve) => setTimeout(resolve, KV_LATENCY_MS))
    return await super.getValue<T>(key)
  }

  async deleteKey (key: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, KV_LATENCY_MS))
    await super.deleteKey(key)
  }
}

interface Harness {
  base: string
  clock: { now: number }
  kv: MemoryKv
  metadataFetches: string[]
  close: () => Promise<void>
}

async function start (kv = new MemoryKv()): Promise<Harness> {
  const clock = { now: 1_800_000_000_000 }
  const metadataFetches: string[] = []
  const routes = createOAuthRoutes({
    publicUrl: PUBLIC_URL,
    frontUrl: FRONT_URL,
    store: new OAuthStore(kv),
    authenticate: async (authorization): Promise<Caller | undefined> =>
      authorization === `Bearer ${API_TOKEN}`
        ? {
            token: API_TOKEN,
            apiTokenId: 'api-1',
            account: 'acc-me' as AccountUuid,
            workspace: 'ws-1' as WorkspaceUuid,
            expiresAt: clock.now + TOKEN_LIFETIME_MS
          }
        : undefined,
    fetchClientMetadata: async (url): Promise<ClientMetadata> => {
      metadataFetches.push(url)
      if (url !== CIMD_URL) throw new ClientMetadataError('unreachable')
      return { client_id: CIMD_URL, client_name: 'Example CIMD', redirect_uris: [REDIRECT_URI] }
    },
    now: () => clock.now,
    randomId
  })
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter((part) => part !== '')
    void routes(req, res, path).then((handled) => {
      if (!handled) {
        res.writeHead(404)
        res.end('unrouted')
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    clock,
    kv,
    metadataFetches,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

let h: Harness
beforeEach(async () => {
  h = await start()
})
afterEach(async () => {
  await h.close()
})

async function register (redirectUris: string[] = [REDIRECT_URI]): Promise<string> {
  const response = await fetch(`${h.base}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: redirectUris })
  })
  expect(response.status).toBe(201)
  const body = await response.json()
  return body.client_id
}

function authorizeUrl (params: Record<string, string>): string {
  const query = new URLSearchParams({
    response_type: 'code',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    redirect_uri: REDIRECT_URI,
    state: 'st-1',
    resource: RESOURCE,
    ...params
  })
  return `${h.base}/oauth/authorize?${query.toString()}`
}

async function authorize (params: Record<string, string>): Promise<string> {
  const response = await fetch(authorizeUrl(params), { redirect: 'manual' })
  expect(response.status).toBe(302)
  const location = new URL(response.headers.get('location') ?? '')
  expect(`${location.origin}${location.pathname}`).toBe(`${FRONT_URL}/login/mcpAuthorize`)
  return location.searchParams.get('request') ?? ''
}

async function approve (requestId: string, token = API_TOKEN): Promise<Response> {
  return await fetch(`${h.base}/oauth/requests/${requestId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Origin: FRONT_URL }
  })
}

async function approvedCode (clientId: string, redirectUri = REDIRECT_URI): Promise<string> {
  const requestId = await authorize({ client_id: clientId, redirect_uri: redirectUri })
  const response = await approve(requestId)
  expect(response.status).toBe(200)
  const { redirectTo } = await response.json()
  return new URL(redirectTo).searchParams.get('code') ?? ''
}

async function token (fields: Record<string, string>): Promise<Response> {
  return await fetch(`${h.base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString()
  })
}

function tokenFields (clientId: string, code: string): Record<string, string> {
  return { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: VERIFIER }
}

describe('metadata', () => {
  it('serves authorization server metadata with exact fields', async () => {
    const response = await fetch(`${h.base}/.well-known/oauth-authorization-server`)
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toEqual({
      issuer: PUBLIC_URL,
      authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
      token_endpoint: `${PUBLIC_URL}/oauth/token`,
      registration_endpoint: `${PUBLIC_URL}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true
    })
  })

  it.each(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])(
    'serves protected resource metadata at %s',
    async (path) => {
      const response = await fetch(`${h.base}${path}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(await response.json()).toEqual({
        resource: RESOURCE,
        authorization_servers: [PUBLIC_URL],
        bearer_methods_supported: ['header']
      })
    }
  )

  it('answers a metadata preflight', async () => {
    const response = await fetch(`${h.base}/.well-known/oauth-authorization-server`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://anywhere.example' }
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('leaves other paths to the next route', async () => {
    const response = await fetch(`${h.base}/.well-known/oauth-authorization-server/mcp`)
    expect(await response.text()).toBe('unrouted')
  })
})

describe('register', () => {
  it('stores a public client and answers RFC 7591 fields', async () => {
    const response = await fetch(`${h.base}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT_URI] })
    })
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      client_name: 'Claude',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code']
    })
    expect(typeof body.client_id).toBe('string')
    expect(h.kv.entries.has(`client:${body.client_id}`)).toBe(true)
  })

  it('rejects a non-loopback http redirect uri', async () => {
    const response = await fetch(`${h.base}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] })
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_redirect_uri' })
  })

  it('rejects missing redirect uris and confidential clients', async () => {
    for (const body of [{ client_name: 'x' }, { redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'client_secret_basic' }]) {
      const response = await fetch(`${h.base}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'invalid_client_metadata' })
    }
  })
})

describe('authorize and token', () => {
  it('runs authorize -> approve -> token', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })

    const pending = await fetch(`${h.base}/oauth/requests/${requestId}`, { headers: { Origin: FRONT_URL } })
    expect(pending.status).toBe(200)
    expect(await pending.json()).toEqual({ clientName: 'Claude', redirectHost: 'claude.ai' })

    const approved = await approve(requestId)
    expect(approved.status).toBe(200)
    const { redirectTo } = await approved.json()
    const redirect = new URL(redirectTo)
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT_URI)
    expect(redirect.searchParams.get('state')).toBe('st-1')
    expect(redirect.searchParams.get('iss')).toBe(PUBLIC_URL)
    const code = redirect.searchParams.get('code') ?? ''
    expect(code).not.toBe('')

    const response = await token(tokenFields(clientId, code))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      access_token: API_TOKEN,
      token_type: 'Bearer',
      expires_in: TOKEN_LIFETIME_MS / 1000
    })
    expect((await fetch(`${h.base}/oauth/requests/${requestId}`)).status).toBe(404)
  })

  it('refuses a replayed code', async () => {
    const clientId = await register()
    const code = await approvedCode(clientId)
    expect((await token(tokenFields(clientId, code))).status).toBe(200)
    const replay = await token(tokenFields(clientId, code))
    expect(replay.status).toBe(400)
    expect(await replay.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses a wrong code verifier and burns the code', async () => {
    const clientId = await register()
    const code = await approvedCode(clientId)
    const wrong = await token({ ...tokenFields(clientId, code), code_verifier: 'x'.repeat(43) })
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ error: 'invalid_grant' })
    const retry = await token(tokenFields(clientId, code))
    expect(await retry.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses a different redirect uri at the token endpoint', async () => {
    const clientId = await register()
    const code = await approvedCode(clientId)
    const response = await token({ ...tokenFields(clientId, code), redirect_uri: 'https://claude.ai/other' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses a code redeemed by another client', async () => {
    const clientId = await register()
    const code = await approvedCode(clientId)
    const response = await token({ ...tokenFields(clientId, code), client_id: 'someone-else' })
    expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses an expired code', async () => {
    const clientId = await register()
    const code = await approvedCode(clientId)
    h.clock.now += CODE_TTL_MS + 1
    const response = await token(tokenFields(clientId, code))
    expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('checks grant type, content type, required fields and body size', async () => {
    const unsupported = await token({ grant_type: 'refresh_token', refresh_token: 'r' })
    expect(unsupported.status).toBe(400)
    expect(await unsupported.json()).toMatchObject({ error: 'unsupported_grant_type' })

    const json = await fetch(`${h.base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code' })
    })
    expect(json.status).toBe(400)
    expect(await json.json()).toMatchObject({ error: 'invalid_request' })

    const missing = await token({ grant_type: 'authorization_code', code: 'c' })
    expect(await missing.json()).toMatchObject({ error: 'invalid_request' })

    const huge = await token({ grant_type: 'authorization_code', code: 'c'.repeat(MAX_BODY_BYTES) })
    expect(huge.status).toBe(400)
    expect(await huge.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('answers unknown clients with 400 and no redirect', async () => {
    const response = await fetch(authorizeUrl({ client_id: 'nobody' }), { redirect: 'manual' })
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
  })

  it('answers an unregistered redirect uri with 400 and no redirect', async () => {
    const clientId = await register()
    const response = await fetch(authorizeUrl({ client_id: clientId, redirect_uri: 'https://evil.example/cb' }), {
      redirect: 'manual'
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('redirects errors found after the redirect uri is validated', async () => {
    const clientId = await register()
    const plain = await fetch(authorizeUrl({ client_id: clientId, code_challenge_method: 'plain' }), { redirect: 'manual' })
    expect(plain.status).toBe(302)
    const plainLocation = new URL(plain.headers.get('location') ?? '')
    expect(`${plainLocation.origin}${plainLocation.pathname}`).toBe(REDIRECT_URI)
    expect(plainLocation.searchParams.get('error')).toBe('invalid_request')
    expect(plainLocation.searchParams.get('state')).toBe('st-1')
    expect(plainLocation.searchParams.get('iss')).toBe(PUBLIC_URL)

    const otherResource = await fetch(authorizeUrl({ client_id: clientId, resource: 'https://other.example/mcp' }), {
      redirect: 'manual'
    })
    expect(new URL(otherResource.headers.get('location') ?? '').searchParams.get('error')).toBe('invalid_target')

    const token = await fetch(authorizeUrl({ client_id: clientId, response_type: 'token' }), { redirect: 'manual' })
    expect(new URL(token.headers.get('location') ?? '').searchParams.get('error')).toBe('unsupported_response_type')
  })

  it('accepts a loopback redirect on a different port', async () => {
    const clientId = await register(['http://127.0.0.1/callback'])
    const redirectUri = 'http://127.0.0.1:51234/callback'
    const code = await approvedCode(clientId, redirectUri)
    const response = await token({ ...tokenFields(clientId, code), redirect_uri: redirectUri })
    expect(response.status).toBe(200)
  })

  it('accepts a client id metadata document url', async () => {
    const requestId = await authorize({ client_id: CIMD_URL })
    expect(h.metadataFetches).toEqual([CIMD_URL])
    const pending = await fetch(`${h.base}/oauth/requests/${requestId}`)
    expect(await pending.json()).toEqual({ clientName: 'Example CIMD', redirectHost: 'claude.ai' })
  })

  it('answers an unreachable metadata document with 400', async () => {
    const response = await fetch(authorizeUrl({ client_id: 'https://down.example/meta.json' }), { redirect: 'manual' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
  })
})

describe('consent requests', () => {
  it('returns 404 on approve once the request expired', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })
    h.clock.now += REQUEST_TTL_MS + 1
    const response = await approve(requestId)
    expect(response.status).toBe(404)
    expect(h.kv.entries.has(`request:${requestId}`)).toBe(false)
  })

  it('refuses approval with a rejected token', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })
    const response = await approve(requestId, 'revoked')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_token' })
    expect((await fetch(`${h.base}/oauth/requests/${requestId}`)).status).toBe(200)
  })

  it('denies with access_denied, state and iss', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })
    const response = await fetch(`${h.base}/oauth/requests/${requestId}/deny`, { method: 'POST' })
    expect(response.status).toBe(200)
    const redirect = new URL((await response.json()).redirectTo)
    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('state')).toBe('st-1')
    expect(redirect.searchParams.get('iss')).toBe(PUBLIC_URL)
    expect(redirect.searchParams.get('code')).toBeNull()
    expect((await approve(requestId)).status).toBe(404)
  })

  it('sends CORS headers only to the front origin', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })
    const fromFront = await fetch(`${h.base}/oauth/requests/${requestId}`, { headers: { Origin: FRONT_URL } })
    expect(fromFront.headers.get('access-control-allow-origin')).toBe(FRONT_URL)
    const fromElsewhere = await fetch(`${h.base}/oauth/requests/${requestId}`, { headers: { Origin: 'https://evil.example' } })
    expect(fromElsewhere.headers.get('access-control-allow-origin')).toBeNull()

    const preflight = await fetch(`${h.base}/oauth/requests/${requestId}/approve`, {
      method: 'OPTIONS',
      headers: { Origin: FRONT_URL, 'Access-Control-Request-Method': 'POST' }
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(FRONT_URL)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
    const foreignPreflight = await fetch(`${h.base}/oauth/requests/${requestId}/approve`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }
    })
    expect(foreignPreflight.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('concurrent redemption', () => {
  beforeEach(async () => {
    await h.close()
    h = await start(new LaggyKv())
  })

  it('grants a code to only one of two racing token requests', async () => {
    const clientId = await register()
    const code = await approvedCode(clientId)
    const responses = await Promise.all([token(tokenFields(clientId, code)), token(tokenFields(clientId, code))])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
    const refused = responses.find((response) => response.status === 400)
    expect(await refused?.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('mints a code for only one of two racing approvals', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })
    const responses = await Promise.all([approve(requestId), approve(requestId)])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 404])
  })

  it('lets only one of a racing approve and deny through', async () => {
    const clientId = await register()
    const requestId = await authorize({ client_id: clientId })
    const deny = fetch(`${h.base}/oauth/requests/${requestId}/deny`, { method: 'POST' })
    const responses = await Promise.all([approve(requestId), deny])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 404])
  })
})
