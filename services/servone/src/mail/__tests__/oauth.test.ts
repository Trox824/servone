import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createHash } from 'crypto'
import type { Caller } from '../../webhooks/auth'
import { CONSENT_TTL_MS, exchangeGoogleCode, googleAccessToken, googleConsentUrl, OAuthGrantError, parseGoogleClient, PendingConsents } from '../oauth'

const client = { clientId: 'cid', clientSecret: 'csecret' }
const caller: Caller = { account: 'acc' as AccountUuid, workspace: 'ws' as WorkspaceUuid, role: AccountRole.User }
const REDIRECT = 'https://svc.example/mail/oauth/callback'

function idToken (payload: Record<string, string | boolean>): string {
  return ['h', Buffer.from(JSON.stringify(payload)).toString('base64url'), 's'].join('.')
}

function answerToken (status: number, body: Record<string, string>): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

afterEach(() => { jest.restoreAllMocks() })

describe('parseGoogleClient', () => {
  it('reads the web client id and secret', () => {
    expect(parseGoogleClient(JSON.stringify({ web: { client_id: 'a', client_secret: 'b' } }))).toEqual({ clientId: 'a', clientSecret: 'b' })
  })

  it('refuses an installed-app client', () => {
    expect(() => parseGoogleClient(JSON.stringify({ installed: { client_id: 'a' } }))).toThrow('web')
  })
})

describe('googleConsentUrl', () => {
  it('asks for offline mail access with an S256 PKCE challenge', () => {
    const url = new URL(googleConsentUrl(client, REDIRECT, 'st', 'verifier'))
    expect(url.searchParams.get('scope')).toBe('openid email https://mail.google.com/')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update('verifier').digest('base64url'))
  })
})

describe('exchangeGoogleCode', () => {
  it('returns the verified email and refresh token', async () => {
    const fetchSpy = answerToken(200, { refresh_token: 'rt', id_token: idToken({ email: 'Linh@Gmail.com', email_verified: true }) })
    expect(await exchangeGoogleCode(client, REDIRECT, 'code', 'verifier')).toEqual({ email: 'linh@gmail.com', refreshToken: 'rt' })
    const form = new URLSearchParams(String(fetchSpy.mock.calls[0][1].body))
    expect(form.get('code_verifier')).toBe('verifier')
    expect(form.get('grant_type')).toBe('authorization_code')
  })

  it('refuses an unverified email', async () => {
    answerToken(200, { refresh_token: 'rt', id_token: idToken({ email: 'a@gmail.com', email_verified: false }) })
    await expect(exchangeGoogleCode(client, REDIRECT, 'code', 'verifier')).rejects.toThrow('verified')
  })

  it('maps invalid_grant to OAuthGrantError', async () => {
    answerToken(400, { error: 'invalid_grant', error_description: 'Bad Request' })
    await expect(exchangeGoogleCode(client, REDIRECT, 'code', 'verifier')).rejects.toBeInstanceOf(OAuthGrantError)
  })
})

describe('googleAccessToken', () => {
  it('maps a revoked refresh token to OAuthGrantError', async () => {
    answerToken(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    await expect(googleAccessToken(client, 'rt')).rejects.toBeInstanceOf(OAuthGrantError)
  })

  it('throws a plain error on other failures', async () => {
    answerToken(500, { error: 'server_error' })
    const failure = googleAccessToken(client, 'rt')
    await expect(failure).rejects.toThrow('500')
    await expect(failure).rejects.not.toBeInstanceOf(OAuthGrantError)
  })
})

describe('PendingConsents', () => {
  it('hands a consent back once', () => {
    const consents = new PendingConsents(() => 0)
    const { state, verifier } = consents.begin(caller)
    expect(consents.take(state)).toEqual({ caller, verifier })
    expect(consents.take(state)).toBeUndefined()
  })

  it('drops a consent after the ttl', () => {
    let now = 0
    const consents = new PendingConsents(() => now)
    const { state } = consents.begin(caller)
    now = CONSENT_TTL_MS
    expect(consents.take(state)).toBeUndefined()
  })

  it('refuses an unknown state', () => {
    expect(new PendingConsents(() => 0).take('forged')).toBeUndefined()
  })
})
