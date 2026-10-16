import type { AuthKind, ProviderId, ServerEndpoint } from './types'

export const IMAP_PORTS = [143, 993]
export const SMTP_PORTS = [465, 587]

export interface ProviderPreset {
  id: Exclude<ProviderId, 'other'>
  label: string
  imap: ServerEndpoint
  smtp: ServerEndpoint
  authKind: AuthKind
  appPasswordHelpUrl?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, security: 'tls' },
    smtp: { host: 'smtp.gmail.com', port: 465, security: 'tls' },
    authKind: 'password',
    appPasswordHelpUrl: 'https://support.google.com/accounts/answer/185833'
  },
  {
    id: 'outlook',
    label: 'Outlook',
    imap: { host: 'outlook.office365.com', port: 993, security: 'tls' },
    smtp: { host: 'smtp.office365.com', port: 587, security: 'starttls' },
    // Microsoft ended app passwords for Outlook.com IMAP/SMTP in Sept 2024.
    authKind: 'oauth'
  },
  {
    id: 'icloud',
    label: 'iCloud',
    imap: { host: 'imap.mail.me.com', port: 993, security: 'tls' },
    smtp: { host: 'smtp.mail.me.com', port: 587, security: 'starttls' },
    authKind: 'password',
    appPasswordHelpUrl: 'https://support.apple.com/en-us/102654'
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'tls' },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, security: 'tls' },
    authKind: 'password',
    appPasswordHelpUrl: 'https://help.yahoo.com/kb/SLN15241.html'
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    // The pro hosts serve organization mailboxes, which is who connects Zoho to a workspace.
    imap: { host: 'imappro.zoho.com', port: 993, security: 'tls' },
    smtp: { host: 'smtppro.zoho.com', port: 465, security: 'tls' },
    authKind: 'password',
    appPasswordHelpUrl: 'https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html'
  }
]

export function findPreset (id: ProviderId): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id)
}

// Provider caps on one message, attachments included after base64 (about 4/3 of raw size).
export const ATTACHMENT_LIMIT_BYTES: Record<ProviderId, number> = {
  gmail: 25 * 1024 * 1024,
  outlook: 20 * 1024 * 1024,
  icloud: 20 * 1024 * 1024,
  yahoo: 25 * 1024 * 1024,
  zoho: 20 * 1024 * 1024,
  other: 10 * 1024 * 1024
}
