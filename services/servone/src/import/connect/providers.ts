import { createHash } from 'crypto'
import { z } from 'zod'

export const sourceId = z.enum(['linear', 'clickup', 'jira', 'asana', 'trello', 'monday', 'slack', 'teams', 'discord', 'notion', 'confluence', 'gdocs'])
export type SourceId = z.infer<typeof sourceId>

export type Fetch = typeof fetch

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

export interface ConnectSettings {
  Linear: OAuthClient | undefined
  ClickUp: OAuthClient | undefined
  Atlassian: OAuthClient | undefined
  Asana: OAuthClient | undefined
  Monday: OAuthClient | undefined
  Slack: OAuthClient | undefined
  Microsoft: OAuthClient | undefined
  Notion: OAuthClient | undefined
  TrelloApiKey: string | undefined
  Discord: (OAuthClient & { botToken: string }) | undefined
  Google: OAuthClient | undefined
}

export interface Grant {
  token: string
  refreshToken?: string
  expiresAt?: number
  guildId?: string
}

export type Redemption = { kind: 'code', code: string, verifier: string, redirectUri: string } | { kind: 'refresh', refreshToken: string }

export interface ApiRule {
  method: 'GET' | 'POST'
  path: RegExp
}

export interface Credentials {
  headers: Record<string, string>
  query: Array<[string, string]>
}

export interface Provider {
  source: SourceId
  apiBase: string
  flow: 'code' | 'fragment'
  rules: ApiRule[]
  consentUrl: (redirectUri: string, state: string, verifier: string) => string
  redeem: (fetch: Fetch, redemption: Redemption, now: number) => Promise<Grant>
  credentials: (token: string) => Credentials
  release?: (fetch: Fetch, token: string, guildId: string | undefined) => Promise<void>
}

export class VendorTokenError extends Error {
  constructor (message: string) {
    super(message)
    Object.setPrototypeOf(this, VendorTokenError.prototype)
  }
}

export const VENDOR_TIMEOUT_MS = 30_000
const TRELLO_TOKEN_TTL_MS = 60 * 60_000
const MONDAY_API_VERSION = '2026-07'
const NOTION_VERSION = '2022-06-28'
const DISCORD_VIEW_CHANNEL_AND_READ_HISTORY = '66560'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'

const tokenReply = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().positive().optional()
})
const slackReply = z.object({ ok: z.literal(true), authed_user: z.object({ access_token: z.string().min(1) }) })
const discordReply = z.object({ guild: z.object({ id: z.string().regex(/^\d+$/) }) })

type TokenEncoding = 'form' | 'json' | 'basic-json' | 'query'

interface TokenEndpoint {
  url: string
  encoding: TokenEncoding
  client: OAuthClient
  isPkce: boolean
}

function grantOf (reply: z.infer<typeof tokenReply>, now: number): Grant {
  const grant: Grant = { token: reply.access_token }
  if (reply.refresh_token !== undefined) grant.refreshToken = reply.refresh_token
  if (reply.expires_in !== undefined) grant.expiresAt = now + reply.expires_in * 1000
  return grant
}

function redemptionFields (redemption: Redemption, isPkce: boolean): Record<string, string> {
  if (redemption.kind === 'refresh') return { grant_type: 'refresh_token', refresh_token: redemption.refreshToken }
  const fields: Record<string, string> = { grant_type: 'authorization_code', code: redemption.code, redirect_uri: redemption.redirectUri }
  if (isPkce) fields.code_verifier = redemption.verifier
  return fields
}

function tokenRequest (endpoint: TokenEndpoint, redemption: Redemption): { url: string, init: RequestInit } {
  const fields = redemptionFields(redemption, endpoint.isPkce)
  const creds = { client_id: endpoint.client.clientId, client_secret: endpoint.client.clientSecret }
  if (endpoint.encoding === 'form') {
    return {
      url: endpoint.url,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ ...creds, ...fields }).toString()
      }
    }
  }
  if (endpoint.encoding === 'json') {
    return {
      url: endpoint.url,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...creds, ...fields }) }
    }
  }
  if (endpoint.encoding === 'basic-json') {
    const basic = Buffer.from(`${endpoint.client.clientId}:${endpoint.client.clientSecret}`).toString('base64')
    return {
      url: endpoint.url,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Basic ${basic}` }, body: JSON.stringify(fields) }
    }
  }
  return { url: `${endpoint.url}?${new URLSearchParams({ ...creds, ...fields }).toString()}`, init: { method: 'POST', headers: { Accept: 'application/json' } } }
}

async function postToken (fetch: Fetch, endpoint: TokenEndpoint, redemption: Redemption): Promise<string> {
  const { url, init } = tokenRequest(endpoint, redemption)
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS) })
  if (!response.ok) throw new VendorTokenError(`${endpoint.url} answered ${response.status}`)
  return await response.text()
}

function oauthRedeem (endpoint: TokenEndpoint): Provider['redeem'] {
  return async (fetch, redemption, now) => {
    const parsed = tokenReply.safeParse(JSON.parse(await postToken(fetch, endpoint, redemption)))
    if (!parsed.success) throw new VendorTokenError(`${endpoint.url} returned no access token`)
    return grantOf(parsed.data, now)
  }
}

function consentUrl (authorizeUrl: string, params: Record<string, string>, isPkce: boolean): Provider['consentUrl'] {
  return (redirectUri, state, verifier) => {
    const url = new URL(authorizeUrl)
    for (const [name, param] of Object.entries(params)) url.searchParams.set(name, param)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    if (isPkce) {
      url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
      url.searchParams.set('code_challenge_method', 'S256')
    }
    return url.toString()
  }
}

const bearer = (token: string): Credentials => ({ headers: { Authorization: `Bearer ${token}` }, query: [] })

function linear (client: OAuthClient): Provider {
  return {
    source: 'linear',
    apiBase: 'https://api.linear.app',
    flow: 'code',
    rules: [{ method: 'POST', path: /^\/graphql$/ }],
    consentUrl: consentUrl('https://linear.app/oauth/authorize', { client_id: client.clientId, response_type: 'code', scope: 'read' }, true),
    redeem: oauthRedeem({ url: 'https://api.linear.app/oauth/token', encoding: 'form', client, isPkce: true }),
    credentials: bearer
  }
}

function clickup (client: OAuthClient): Provider {
  return {
    source: 'clickup',
    apiBase: 'https://api.clickup.com',
    flow: 'code',
    rules: [{ method: 'GET', path: /^\/api\/v2\// }],
    consentUrl: consentUrl('https://app.clickup.com/api', { client_id: client.clientId }, false),
    redeem: oauthRedeem({ url: 'https://api.clickup.com/api/v2/oauth/token', encoding: 'query', client, isPkce: false }),
    credentials: bearer
  }
}

function atlassian (source: 'jira' | 'confluence', client: OAuthClient, scope: string, product: RegExp): Provider {
  return {
    source,
    apiBase: 'https://api.atlassian.com',
    flow: 'code',
    rules: [
      { method: 'GET', path: /^\/oauth\/token\/accessible-resources$/ },
      { method: 'GET', path: product }
    ],
    consentUrl: consentUrl(
      'https://auth.atlassian.com/authorize',
      { audience: 'api.atlassian.com', client_id: client.clientId, scope, response_type: 'code', prompt: 'consent' },
      false
    ),
    redeem: oauthRedeem({ url: 'https://auth.atlassian.com/oauth/token', encoding: 'json', client, isPkce: false }),
    credentials: bearer
  }
}

function asana (client: OAuthClient): Provider {
  return {
    source: 'asana',
    apiBase: 'https://app.asana.com',
    flow: 'code',
    rules: [{ method: 'GET', path: /^\/api\/1\.0\// }],
    consentUrl: consentUrl(
      'https://app.asana.com/-/oauth_authorize',
      { client_id: client.clientId, response_type: 'code', scope: 'workspaces:read teams:read projects:read tasks:read stories:read users:read' },
      true
    ),
    redeem: oauthRedeem({ url: 'https://app.asana.com/-/oauth_token', encoding: 'form', client, isPkce: true }),
    credentials: bearer
  }
}

const trelloMember = z.object({ id: z.string().min(1) })

function trello (apiKey: string): Provider {
  return {
    source: 'trello',
    apiBase: 'https://api.trello.com',
    flow: 'fragment',
    rules: [{ method: 'GET', path: /^\/1\// }],
    consentUrl: (redirectUri, state) => {
      const back = new URL(redirectUri)
      back.searchParams.set('state', state)
      const params = new URLSearchParams({
        expiration: '1hour',
        name: 'Servone',
        scope: 'read',
        response_type: 'token',
        key: apiKey,
        callback_method: 'fragment',
        return_url: back.toString()
      })
      return `https://trello.com/1/authorize?${params.toString()}`
    },
    redeem: async (fetch, redemption, now) => {
      if (redemption.kind === 'refresh') throw new VendorTokenError('Trello tokens do not refresh')
      const query = new URLSearchParams({ key: apiKey, token: redemption.code, fields: 'id' })
      const response = await fetch(`https://api.trello.com/1/members/me?${query.toString()}`, { signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS) })
      if (!response.ok) throw new VendorTokenError(`Trello answered ${response.status} for the returned token`)
      if (!trelloMember.safeParse(await response.json()).success) throw new VendorTokenError('Trello returned no member for the token')
      return { token: redemption.code, expiresAt: now + TRELLO_TOKEN_TTL_MS }
    },
    credentials: (token) => ({ headers: {}, query: [['key', apiKey], ['token', token]] })
  }
}

function monday (client: OAuthClient): Provider {
  return {
    source: 'monday',
    apiBase: 'https://api.monday.com',
    flow: 'code',
    rules: [{ method: 'POST', path: /^\/v2$/ }],
    consentUrl: consentUrl(
      'https://auth.monday.com/oauth2/authorize',
      { client_id: client.clientId, response_type: 'code', scope: 'boards:read users:read updates:read workspaces:read' },
      false
    ),
    redeem: oauthRedeem({ url: 'https://auth.monday.com/oauth2/token', encoding: 'form', client, isPkce: false }),
    credentials: (token) => ({ headers: { Authorization: token, 'API-Version': MONDAY_API_VERSION }, query: [] })
  }
}

function slack (client: OAuthClient): Provider {
  const endpoint: TokenEndpoint = { url: 'https://slack.com/api/oauth.v2.access', encoding: 'form', client, isPkce: false }
  return {
    source: 'slack',
    apiBase: 'https://slack.com',
    flow: 'code',
    rules: [{ method: 'GET', path: /^\/api\/(conversations\.(list|history|replies|info|members)|users\.(list|info))$/ }],
    consentUrl: consentUrl(
      'https://slack.com/oauth/v2/authorize',
      { client_id: client.clientId, user_scope: 'channels:read,channels:history,groups:read,groups:history,users:read,users:read.email' },
      false
    ),
    redeem: async (fetch, redemption) => {
      const parsed = slackReply.safeParse(JSON.parse(await postToken(fetch, endpoint, redemption)))
      if (!parsed.success) throw new VendorTokenError('Slack returned no user token')
      return { token: parsed.data.authed_user.access_token }
    },
    credentials: bearer
  }
}

function teams (client: OAuthClient): Provider {
  return {
    source: 'teams',
    apiBase: 'https://graph.microsoft.com',
    flow: 'code',
    rules: [{ method: 'GET', path: /^\/v1\.0\// }],
    consentUrl: consentUrl(
      `${MICROSOFT_AUTHORITY}/authorize`,
      {
        client_id: client.clientId,
        response_type: 'code',
        response_mode: 'query',
        scope: 'offline_access User.Read User.ReadBasic.All Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All'
      },
      true
    ),
    redeem: oauthRedeem({ url: `${MICROSOFT_AUTHORITY}/token`, encoding: 'form', client, isPkce: true }),
    credentials: bearer
  }
}

function discord (client: OAuthClient & { botToken: string }): Provider {
  const endpoint: TokenEndpoint = { url: 'https://discord.com/api/oauth2/token', encoding: 'form', client, isPkce: false }
  const credentials = (token: string): Credentials => ({ headers: { Authorization: `Bot ${token}` }, query: [] })
  return {
    source: 'discord',
    apiBase: 'https://discord.com',
    flow: 'code',
    rules: [
      { method: 'GET', path: /^\/api\/v10\/guilds\/\{guild\}\/(channels|threads\/active)$/ },
      { method: 'GET', path: /^\/api\/v10\/channels\/(?<channel>\d+)\/(messages|threads\/archived\/public)$/ }
    ],
    consentUrl: consentUrl(
      'https://discord.com/oauth2/authorize',
      { client_id: client.clientId, response_type: 'code', scope: 'identify bot', permissions: DISCORD_VIEW_CHANNEL_AND_READ_HISTORY },
      false
    ),
    redeem: async (fetch, redemption) => {
      const parsed = discordReply.safeParse(JSON.parse(await postToken(fetch, endpoint, redemption)))
      if (!parsed.success) throw new VendorTokenError('Discord returned no guild for the bot')
      return { token: client.botToken, guildId: parsed.data.guild.id }
    },
    credentials,
    release: async (fetch, token, guildId) => {
      if (guildId === undefined) return
      const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
        method: 'DELETE',
        headers: credentials(token).headers,
        signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS)
      })
      if (!response.ok && response.status !== 404) throw new Error(`Discord answered ${response.status} to leaving the guild`)
    }
  }
}

function notion (client: OAuthClient): Provider {
  return {
    source: 'notion',
    apiBase: 'https://api.notion.com',
    flow: 'code',
    rules: [
      { method: 'POST', path: /^\/v1\/search$/ },
      { method: 'GET', path: /^\/v1\/blocks\/[^/]+\/children$/ },
      { method: 'GET', path: /^\/v1\/pages\/[^/]+$/ },
      { method: 'GET', path: /^\/v1\/users(\/[^/]+)?$/ },
      { method: 'POST', path: /^\/v1\/databases\/[^/]+\/query$/ }
    ],
    consentUrl: consentUrl('https://api.notion.com/v1/oauth/authorize', { client_id: client.clientId, response_type: 'code', owner: 'user' }, false),
    redeem: oauthRedeem({ url: 'https://api.notion.com/v1/oauth/token', encoding: 'basic-json', client, isPkce: false }),
    credentials: (token) => ({ headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION }, query: [] })
  }
}

function gdocs (client: OAuthClient): Provider {
  return {
    source: 'gdocs',
    apiBase: 'https://www.googleapis.com',
    flow: 'code',
    rules: [
      { method: 'GET', path: /^\/drive\/v3\/files$/ },
      { method: 'GET', path: /^\/drive\/v3\/files\/[^/]+\/export$/ }
    ],
    consentUrl: consentUrl(GOOGLE_AUTH_URL, { client_id: client.clientId, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.readonly' }, true),
    redeem: oauthRedeem({ url: GOOGLE_TOKEN_URL, encoding: 'form', client, isPkce: true }),
    credentials: bearer
  }
}

export function buildProviders (settings: ConnectSettings): Map<SourceId, Provider> {
  const providers: Provider[] = []
  if (settings.Linear !== undefined) providers.push(linear(settings.Linear))
  if (settings.ClickUp !== undefined) providers.push(clickup(settings.ClickUp))
  if (settings.Atlassian !== undefined) {
    providers.push(atlassian('jira', settings.Atlassian, 'read:jira-work read:jira-user offline_access', /^\/ex\/jira\/[^/]+\/rest\/api\/3\//))
    providers.push(
      atlassian(
        'confluence',
        settings.Atlassian,
        'read:space:confluence read:page:confluence read:hierarchical-content:confluence read:user:confluence offline_access',
        /^\/ex\/confluence\/[^/]+\/wiki\/api\/v2\//
      )
    )
  }
  if (settings.Asana !== undefined) providers.push(asana(settings.Asana))
  if (settings.TrelloApiKey !== undefined) providers.push(trello(settings.TrelloApiKey))
  if (settings.Monday !== undefined) providers.push(monday(settings.Monday))
  if (settings.Slack !== undefined) providers.push(slack(settings.Slack))
  if (settings.Microsoft !== undefined) providers.push(teams(settings.Microsoft))
  if (settings.Discord !== undefined) providers.push(discord(settings.Discord))
  if (settings.Notion !== undefined) providers.push(notion(settings.Notion))
  if (settings.Google !== undefined) providers.push(gdocs(settings.Google))
  return new Map(providers.map((provider) => [provider.source, provider]))
}
