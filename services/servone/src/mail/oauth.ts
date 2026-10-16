import { createHash, randomBytes } from 'crypto'
import type { Caller } from '../webhooks/auth'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
// mail.google.com is the only Google scope IMAP and SMTP accept; openid email names the mailbox that consented.
const GOOGLE_SCOPES = 'openid email https://mail.google.com/'
// Long enough to read Google's unverified-app warning and pick an account.
export const CONSENT_TTL_MS = 10 * 60_000

export interface GoogleClient {
  clientId: string
  clientSecret: string
}

export class OAuthGrantError extends Error {
  constructor (message: string) {
    super(message)
    Object.setPrototypeOf(this, OAuthGrantError.prototype)
  }
}

// Same JSON the calendar service reads from `Credentials`: the Google Cloud "web" client download.
export function parseGoogleClient (text: string): GoogleClient {
  const parsed: { web?: { client_id?: string, client_secret?: string } } = JSON.parse(text)
  const clientId = parsed.web?.client_id
  const clientSecret = parsed.web?.client_secret
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') throw new Error('MAIL_GOOGLE_CREDENTIALS must be a Google "web" OAuth client JSON')
  return { clientId, clientSecret }
}

export function googleConsentUrl (client: GoogleClient, redirectUri: string, state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    // offline + consent: Google returns a refresh token only on a fresh consent.
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

async function postToken (form: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  })
  const body: TokenResponse = await response.json()
  if (body.error === 'invalid_grant') throw new OAuthGrantError(body.error_description ?? 'invalid_grant')
  if (!response.ok) throw new Error(`Google token endpoint answered ${response.status} ${body.error ?? ''}`)
  return body
}

// The id_token comes straight from Google's token endpoint over TLS, so OIDC lets us read it without checking the signature.
function emailOf (idToken: string): string {
  const payload: { email?: string, email_verified?: boolean } = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
  if (typeof payload.email !== 'string' || payload.email_verified !== true) throw new Error('Google id_token has no verified email')
  return payload.email.toLowerCase()
}

export async function exchangeGoogleCode (client: GoogleClient, redirectUri: string, code: string, verifier: string): Promise<{ email: string, refreshToken: string }> {
  const tokens = await postToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier
  })
  if (tokens.refresh_token === undefined || tokens.id_token === undefined) throw new Error('Google returned no refresh token or id_token')
  return { email: emailOf(tokens.id_token), refreshToken: tokens.refresh_token }
}

export async function googleAccessToken (client: GoogleClient, refreshToken: string): Promise<string> {
  const tokens = await postToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
  if (tokens.access_token === undefined) throw new Error('Google returned no access token')
  return tokens.access_token
}

export async function revokeGoogleToken (refreshToken: string): Promise<void> {
  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }).toString()
  })
  // 400 means Google already dropped the token (revoked by the user, or expired in testing mode).
  if (!response.ok && response.status !== 400) throw new Error(`Google revoke answered ${response.status}`)
}

interface PendingConsent {
  caller: Caller
  verifier: string
  expiresAt: number
}

// In memory: the service runs as one replica (see railway.ts), and a lost consent only means clicking Connect again.
export class PendingConsents {
  private readonly pending = new Map<string, PendingConsent>()

  constructor (private readonly now: () => number) {}

  begin (caller: Caller): { state: string, verifier: string } {
    this.sweep()
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    this.pending.set(state, { caller, verifier, expiresAt: this.now() + CONSENT_TTL_MS })
    return { state, verifier }
  }

  // One-shot: a replayed callback URL finds nothing.
  take (state: string): { caller: Caller, verifier: string } | undefined {
    const consent = this.pending.get(state)
    this.pending.delete(state)
    if (consent === undefined || consent.expiresAt <= this.now()) return undefined
    return { caller: consent.caller, verifier: consent.verifier }
  }

  private sweep (): void {
    const now = this.now()
    for (const [state, consent] of this.pending) if (consent.expiresAt <= now) this.pending.delete(state)
  }
}
