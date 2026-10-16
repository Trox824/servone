import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

import type { Json } from '../../http-json'
import type { Caller } from '../../webhooks/auth'
import { type ConnectHttpDeps, createConnectHandler } from '../connect/http'
import { buildProviders, type ConnectSettings, type Fetch } from '../connect/providers'
import { CONNECTION_TTL_MS, CONSENT_TTL_MS, Connections, Consents } from '../connect/store'

const FRONT = 'https://platform.servone.app'
const PUBLIC = 'https://mcp.servone.app'
const REDIRECT = `${PUBLIC}/v1/import/connect/callback`
const GUILD = '111'
const owner: Caller = { account: 'acc' as AccountUuid, workspace: 'ws-1' as WorkspaceUuid, role: AccountRole.Owner }
const client = { clientId: 'cid', clientSecret: 'secret' }
const settings: ConnectSettings = {
  Linear: client,
  ClickUp: client,
  Atlassian: undefined,
  Asana: undefined,
  Monday: undefined,
  Slack: client,
  Microsoft: undefined,
  Notion: undefined,
  TrelloApiKey: 'trello-key',
  Discord: { ...client, botToken: 'bot-token' },
  Google: undefined
}

interface VendorCall {
  url: string
  init: RequestInit | undefined
}

function json (body: Json, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

type Vendor = (url: string, init: RequestInit | undefined) => Response

let server: Server
let base: string
let clock: number
let caller: Caller
let vendor: Vendor
let vendorCalls: VendorCall[]
let report: jest.Mock

async function start (overrides: Partial<ConnectHttpDeps> = {}): Promise<void> {
  let counter = 0
  const random = (bytes: number): string => `r${bytes}x${++counter}`
  const now = (): number => clock
  const fetch: Fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    vendorCalls.push({ url, init })
    return vendor(url, init)
  }
  const handler = createConnectHandler({
    frontUrl: FRONT,
    publicUrl: PUBLIC,
    providers: buildProviders(settings),
    consents: new Consents(now, random),
    connections: new Connections(now, random),
    authenticate: async () => caller,
    fetch,
    now,
    random,
    report,
    ...overrides
  })
  server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function post (route: string, body: Json): Promise<Response> {
  return await fetch(`${base}/v1/import/connect/${route}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer t', Origin: FRONT, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function consentFor (source: string): Promise<URL> {
  const response = await post('start', { source })
  expect(response.status).toBe(200)
  const { url } = await response.json()
  return new URL(url)
}

async function callback (query: Record<string, string>): Promise<{ response: Response, html: string }> {
  const response = await fetch(`${base}/v1/import/connect/callback?${new URLSearchParams(query).toString()}`)
  return { response, html: await response.text() }
}

function messageOf (html: string): Record<string, string> {
  const match = /postMessage\((\{.*?\}), "([^"]+)"\)/.exec(html)
  expect(match?.[2]).toBe(FRONT)
  return JSON.parse(match?.[1] ?? '{}')
}

async function connect (source: string, tokenReply: Json = { access_token: 'vendor-token' }): Promise<string> {
  const consent = await consentFor(source)
  vendor = () => json(tokenReply)
  const { html } = await callback({ state: consent.searchParams.get('state') ?? '', code: 'the-code' })
  const message = messageOf(html)
  expect(message.connection).toBeDefined()
  return message.connection
}

beforeEach(async () => {
  clock = 1_000_000
  caller = owner
  vendor = () => json({})
  vendorCalls = []
  report = jest.fn()
  await start()
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('import connect', () => {
  it('answers the browser preflight', async () => {
    const response = await fetch(`${base}/v1/import/connect/call`, { method: 'OPTIONS', headers: { Origin: FRONT } })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
  })

  it('lists only configured sources', async () => {
    const response = await post('sources', {})
    expect(response.status).toBe(200)
    expect((await response.json()).sources.sort()).toEqual(['clickup', 'discord', 'linear', 'slack', 'trello'])
  })

  it('refuses a member below maintainer', async () => {
    caller = { ...owner, role: AccountRole.User }
    expect((await post('sources', {})).status).toBe(403)
    expect((await post('start', { source: 'linear' })).status).toBe(403)
  })

  it('builds the consent url with state, redirect, scope and PKCE', async () => {
    const consent = await consentFor('linear')
    expect(consent.origin + consent.pathname).toBe('https://linear.app/oauth/authorize')
    expect(consent.searchParams.get('client_id')).toBe('cid')
    expect(consent.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(consent.searchParams.get('scope')).toBe('read')
    expect(consent.searchParams.get('state')).toMatch(/^linear\./)
    expect(consent.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('asks Slack for user scopes only', async () => {
    const consent = await consentFor('slack')
    expect(consent.searchParams.get('user_scope')).toBe('channels:read,channels:history,groups:read,groups:history,users:read,users:read.email')
    expect(consent.searchParams.get('scope')).toBeNull()
  })

  it('answers not_configured for a source without credentials', async () => {
    const response = await post('start', { source: 'notion' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_configured' })
  })

  it('exchanges the code with the PKCE verifier and posts the connection to the opener', async () => {
    const consent = await consentFor('linear')
    vendor = () => json({ access_token: 'vendor-token' })
    const { response, html } = await callback({ state: consent.searchParams.get('state') ?? '', code: 'the-code' })
    expect(response.headers.get('content-type')).toContain('text/html')
    const csp = response.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeDefined()
    expect(html).toContain(`<script nonce="${nonce ?? ''}">`)
    expect(html).toContain('You can close this window.')
    expect(html).not.toContain('vendor-token')
    const message = messageOf(html)
    expect(message).toMatchObject({ type: 'servone-import-connect', source: 'linear' })
    const form = new URLSearchParams(String(vendorCalls[0].init?.body))
    expect(vendorCalls[0].url).toBe('https://api.linear.app/oauth/token')
    expect(form.get('code')).toBe('the-code')
    expect(form.get('redirect_uri')).toBe(REDIRECT)
    expect(createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url')).toBe(consent.searchParams.get('code_challenge'))
  })

  it('treats a replayed state as expired', async () => {
    const consent = await consentFor('linear')
    const state = consent.searchParams.get('state') ?? ''
    vendor = () => json({ access_token: 'vendor-token' })
    await callback({ state, code: 'the-code' })
    const { html } = await callback({ state, code: 'the-code' })
    expect(messageOf(html)).toEqual({ type: 'servone-import-connect', source: 'linear', error: 'expired' })
  })

  it('treats a consent past its TTL as expired', async () => {
    const consent = await consentFor('linear')
    clock += CONSENT_TTL_MS
    const { html } = await callback({ state: consent.searchParams.get('state') ?? '', code: 'the-code' })
    expect(messageOf(html).error).toBe('expired')
    expect(vendorCalls).toHaveLength(0)
  })

  it('reports a denied consent', async () => {
    const consent = await consentFor('linear')
    const { html } = await callback({ state: consent.searchParams.get('state') ?? '', error: 'access_denied' })
    expect(messageOf(html)).toEqual({ type: 'servone-import-connect', source: 'linear', error: 'denied' })
  })

  it('reports a failed exchange', async () => {
    const consent = await consentFor('linear')
    vendor = () => json({ error: 'invalid_grant' }, 400)
    const { html } = await callback({ state: consent.searchParams.get('state') ?? '', code: 'the-code' })
    expect(messageOf(html).error).toBe('failed')
    expect(report).toHaveBeenCalledWith('import connect failed', expect.objectContaining({ source: 'linear' }))
  })

  it('proxies an allowed request and wraps the vendor status', async () => {
    const connection = await connect('linear')
    vendor = () => json({ errors: ['busy'] }, 503)
    const response = await post('call', { connection, request: { method: 'POST', path: '/graphql', body: { query: '{ viewer { id } }' } } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 503, body: { errors: ['busy'] } })
    const last = vendorCalls[vendorCalls.length - 1]
    expect(last.url).toBe('https://api.linear.app/graphql')
    expect(last.init?.headers).toMatchObject({ Authorization: 'Bearer vendor-token', 'Content-Type': 'application/json' })
    expect(last.init?.body).toBe(JSON.stringify({ query: '{ viewer { id } }' }))
  })

  it('appends query parameters and returns non-JSON bodies as text', async () => {
    const connection = await connect('clickup')
    vendor = () => new Response('plain', { status: 200, headers: { 'content-type': 'text/plain' } })
    const response = await post('call', { connection, request: { method: 'GET', path: '/api/v2/team', query: [['page', '2']] } })
    expect(await response.json()).toEqual({ status: 200, body: 'plain' })
    expect(vendorCalls[vendorCalls.length - 1].url).toBe('https://api.clickup.com/api/v2/team?page=2')
  })

  it('passes Retry-After through in seconds', async () => {
    const connection = await connect('slack', { ok: true, authed_user: { access_token: 'xoxp' } })
    vendor = () => json({ ok: false, error: 'ratelimited' }, 429, { 'Retry-After': '30' })
    const response = await post('call', { connection, request: { method: 'GET', path: '/api/conversations.history', query: [['channel', 'C1']] } })
    expect(await response.json()).toEqual({ status: 429, body: { ok: false, error: 'ratelimited' }, retryAfterSeconds: 30 })
  })

  it.each([
    ['a method outside the list', 'GET', '/graphql'],
    ['DELETE', 'DELETE', '/graphql'],
    ['another path', 'POST', '/oauth/revoke'],
    ['a traversal', 'POST', '/graphql/../oauth/revoke'],
    ['an encoded traversal', 'POST', '/%2e%2e/graphql'],
    ['a protocol-relative path', 'POST', '//evil.example/graphql'],
    ['a scheme', 'POST', 'https://evil.example/graphql'],
    ['a query in the path', 'POST', '/graphql?x=1']
  ])('refuses %s', async (_name, method, path) => {
    const connection = await connect('linear')
    const before = vendorCalls.length
    const response = await post('call', { connection, request: { method, path } })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'forbidden_request' })
    expect(vendorCalls).toHaveLength(before)
  })

  it('refuses a traversal under an allowed prefix', async () => {
    const connection = await connect('clickup')
    const response = await post('call', { connection, request: { method: 'GET', path: '/api/v2/../../v1/x' } })
    expect(response.status).toBe(400)
  })

  it('hides a connection from another account or workspace', async () => {
    const connection = await connect('linear')
    caller = { ...owner, account: 'other' as AccountUuid }
    expect((await post('call', { connection, request: { method: 'POST', path: '/graphql' } })).status).toBe(404)
    caller = { ...owner, workspace: 'ws-2' as WorkspaceUuid }
    expect((await post('call', { connection, request: { method: 'POST', path: '/graphql' } })).status).toBe(404)
  })

  it('expires an idle connection and slides on use', async () => {
    const connection = await connect('linear')
    clock += CONNECTION_TTL_MS - 1
    expect((await post('call', { connection, request: { method: 'POST', path: '/graphql' } })).status).toBe(200)
    clock += CONNECTION_TTL_MS - 1
    expect((await post('call', { connection, request: { method: 'POST', path: '/graphql' } })).status).toBe(200)
    clock += CONNECTION_TTL_MS
    const response = await post('call', { connection, request: { method: 'POST', path: '/graphql' } })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_connected' })
  })

  it('refreshes a token that is about to expire', async () => {
    const connection = await connect('linear', { access_token: 'first', refresh_token: 'refresh', expires_in: 3600 })
    clock += 3600 * 1000
    vendor = (url) => (url.endsWith('/oauth/token') ? json({ access_token: 'second', expires_in: 3600 }) : json({ data: {} }))
    await post('call', { connection, request: { method: 'POST', path: '/graphql' } })
    const refresh = new URLSearchParams(String(vendorCalls[vendorCalls.length - 2].init?.body))
    expect(refresh.get('grant_type')).toBe('refresh_token')
    expect(refresh.get('refresh_token')).toBe('refresh')
    expect(vendorCalls[vendorCalls.length - 1].init?.headers).toMatchObject({ Authorization: 'Bearer second' })
  })

  it('drops the connection on end', async () => {
    const connection = await connect('linear')
    const response = await post('end', { connection })
    expect(await response.json()).toEqual({ ok: true })
    expect((await post('call', { connection, request: { method: 'POST', path: '/graphql' } })).status).toBe(404)
  })

  describe('discord', () => {
    async function connectDiscord (): Promise<string> {
      const consent = await consentFor('discord')
      expect(consent.searchParams.get('scope')).toBe('identify bot')
      expect(consent.searchParams.get('permissions')).toBe('66560')
      vendor = () => json({ access_token: 'user', guild: { id: GUILD } })
      const { html } = await callback({ state: consent.searchParams.get('state') ?? '', code: 'the-code', guild_id: GUILD })
      return messageOf(html).connection
    }

    it('substitutes the connected guild and calls as the bot', async () => {
      const connection = await connectDiscord()
      vendor = () => json([])
      await post('call', { connection, request: { method: 'GET', path: '/api/v10/guilds/{guild}/channels' } })
      const last = vendorCalls[vendorCalls.length - 1]
      expect(last.url).toBe(`https://discord.com/api/v10/guilds/${GUILD}/channels`)
      expect(last.init?.headers).toMatchObject({ Authorization: 'Bot bot-token' })
    })

    it('refuses a literal guild id', async () => {
      const connection = await connectDiscord()
      const response = await post('call', { connection, request: { method: 'GET', path: '/api/v10/guilds/222/channels' } })
      expect(response.status).toBe(400)
    })

    it('reads a channel of the connected guild and caches the check', async () => {
      const connection = await connectDiscord()
      vendor = (url) => (url.endsWith('/channels/5') ? json({ id: '5', guild_id: GUILD }) : json([{ id: 'm1' }]))
      const before = vendorCalls.length
      const first = await post('call', { connection, request: { method: 'GET', path: '/api/v10/channels/5/messages', query: [['limit', '100']] } })
      expect(await first.json()).toEqual({ status: 200, body: [{ id: 'm1' }] })
      await post('call', { connection, request: { method: 'GET', path: '/api/v10/channels/5/messages' } })
      expect(vendorCalls.slice(before).map((call) => call.url)).toEqual([
        'https://discord.com/api/v10/channels/5',
        'https://discord.com/api/v10/channels/5/messages?limit=100',
        'https://discord.com/api/v10/channels/5/messages'
      ])
    })

    it('refuses a channel of another guild', async () => {
      const connection = await connectDiscord()
      vendor = () => json({ id: '6', guild_id: '999' })
      const response = await post('call', { connection, request: { method: 'GET', path: '/api/v10/channels/6/messages' } })
      expect(response.status).toBe(400)
      expect(vendorCalls[vendorCalls.length - 1].url).toBe('https://discord.com/api/v10/channels/6')
    })

    it('leaves the guild on end', async () => {
      const connection = await connectDiscord()
      vendor = () => new Response(null, { status: 204 })
      await post('end', { connection })
      const last = vendorCalls[vendorCalls.length - 1]
      expect(last.url).toBe(`https://discord.com/api/v10/users/@me/guilds/${GUILD}`)
      expect(last.init?.method).toBe('DELETE')
    })
  })

  describe('trello', () => {
    it('serves the fragment page, then accepts a token Trello vouches for', async () => {
      const consent = await consentFor('trello')
      expect(consent.origin + consent.pathname).toBe('https://trello.com/1/authorize')
      const back = new URL(consent.searchParams.get('return_url') ?? '')
      const state = back.searchParams.get('state') ?? ''
      expect(back.origin + back.pathname).toBe(REDIRECT)

      const { response, html } = await callback({ state })
      expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'")
      expect(html).toContain("fetch('token'")
      expect(vendorCalls).toHaveLength(0)

      vendor = () => json({ id: 'member' })
      const accepted = await fetch(`${base}/v1/import/connect/token`, { method: 'POST', body: JSON.stringify({ state, token: 'trello-token' }) })
      const outcome = await accepted.json()
      expect(outcome.source).toBe('trello')
      expect(vendorCalls[0].url).toBe('https://api.trello.com/1/members/me?key=trello-key&token=trello-token&fields=id')

      vendor = () => json([])
      await post('call', { connection: outcome.connection, request: { method: 'GET', path: '/1/members/me/boards', query: [['token', 'forged']] } })
      expect(vendorCalls[vendorCalls.length - 1].url).toBe('https://api.trello.com/1/members/me/boards?key=trello-key&token=trello-token')
    })

    it('rejects a token Trello does not recognise', async () => {
      const consent = await consentFor('trello')
      const state = new URL(consent.searchParams.get('return_url') ?? '').searchParams.get('state') ?? ''
      vendor = () => new Response('invalid token', { status: 401 })
      const response = await fetch(`${base}/v1/import/connect/token`, { method: 'POST', body: JSON.stringify({ state, token: 'bad' }) })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ source: 'trello', error: 'failed' })
    })

    it('treats an empty fragment as denied', async () => {
      const consent = await consentFor('trello')
      const state = new URL(consent.searchParams.get('return_url') ?? '').searchParams.get('state') ?? ''
      const response = await fetch(`${base}/v1/import/connect/token`, { method: 'POST', body: JSON.stringify({ state, token: '' }) })
      expect(await response.json()).toEqual({ source: 'trello', error: 'denied' })
    })
  })
})
