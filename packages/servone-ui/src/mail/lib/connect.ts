import { findPreset, type ProviderId, type Security } from '@servone/mail'
import type { ConnectForm, LoginCheck } from '../api'
import type { StringKey } from '../strings'

export type ConnectPhase =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'failed', key: StringKey, retry?: () => void }

const TILE_ORDER: ProviderId[] = ['gmail', 'outlook', 'icloud', 'yahoo', 'zoho', 'other']

const STARTTLS_PORTS = [143, 587]

function securityForPort (port: number): Security {
  return STARTTLS_PORTS.includes(port) ? 'starttls' : 'tls'
}

export function loginErrorKey (check: Exclude<LoginCheck, { isOk: true }>, provider: ProviderId): StringKey {
  if (check.reason === 'auth') return provider === 'gmail' ? 'ErrAuthGmail' : 'ErrAuth'
  if (check.reason === 'network') return 'ErrNetwork'
  if (check.reason === 'tls') return 'ErrTls'
  return 'ErrHostRefused'
}

export function visibleTiles (current: ProviderId | undefined): ProviderId[] {
  return TILE_ORDER.filter((provider) => provider !== 'outlook' || current === 'outlook')
}

export function formFor (
  provider: ProviderId,
  email: string,
  password: string,
  imapHost: string,
  imapPort: number,
  smtpHost: string,
  smtpPort: number
): ConnectForm {
  const preset = findPreset(provider)
  if (preset !== undefined) return { provider, email, password }
  return {
    provider,
    email,
    password,
    imap: { host: imapHost, port: imapPort, security: securityForPort(imapPort) },
    smtp: { host: smtpHost, port: smtpPort, security: securityForPort(smtpPort) }
  }
}
