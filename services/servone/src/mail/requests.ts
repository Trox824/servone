import type { Json } from '../http-json'
import { findPreset, IMAP_PORTS, type ProviderId, type ServerEndpoint, SMTP_PORTS } from '@servone/mail'

export interface ConnectRequest {
  provider: ProviderId
  email: string
  username: string
  password: string
  imap: ServerEndpoint
  smtp: ServerEndpoint
}

const PROVIDERS: ProviderId[] = ['gmail', 'outlook', 'icloud', 'yahoo', 'zoho', 'other']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// RFC 1035 name length limit.
const MAX_HOST_LENGTH = 253

function field (json: Json, name: string): Json | undefined {
  return typeof json === 'object' && json !== null && !Array.isArray(json) ? json[name] : undefined
}

function endpointOf (json: Json | undefined, ports: number[]): ServerEndpoint | undefined {
  if (json === undefined) return undefined
  const host = field(json, 'host')
  const port = field(json, 'port')
  const security = field(json, 'security')
  if (typeof host !== 'string' || host === '' || host.length > MAX_HOST_LENGTH) return undefined
  if (typeof port !== 'number' || !ports.includes(port)) return undefined
  if (security !== 'tls' && security !== 'starttls') return undefined
  return { host, port, security }
}

export function parseConnectRequest (json: Json): ConnectRequest | { error: string } {
  const provider = PROVIDERS.find((id) => id === field(json, 'provider'))
  if (provider === undefined) return { error: 'invalid_provider' }
  const emailField = field(json, 'email')
  if (typeof emailField !== 'string' || !EMAIL.test(emailField.trim())) return { error: 'invalid_email' }
  const email = emailField.trim().toLowerCase()
  const password = field(json, 'password')
  if (typeof password !== 'string' || password === '') return { error: 'invalid_password' }
  const usernameField = field(json, 'username')
  const username = typeof usernameField === 'string' && usernameField.trim() !== '' ? usernameField.trim() : email
  const preset = findPreset(provider)
  if (preset?.authKind === 'oauth') return { error: 'oauth_required' }
  const imap = preset?.imap ?? endpointOf(field(json, 'imap'), IMAP_PORTS)
  if (imap === undefined) return { error: 'invalid_imap' }
  const smtp = preset?.smtp ?? endpointOf(field(json, 'smtp'), SMTP_PORTS)
  if (smtp === undefined) return { error: 'invalid_smtp' }
  return { provider, email, username, password, imap, smtp }
}
