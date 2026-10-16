export type ProviderId = 'gmail' | 'outlook' | 'icloud' | 'yahoo' | 'zoho' | 'other'
export type AuthKind = 'password' | 'oauth'
// 'removing': disconnected with delete; the purge job still has cards left, so the mailbox cannot be reconnected yet.
export type AccountStatus = 'connecting' | 'backfilling' | 'ready' | 'auth-error' | 'offline' | 'removing'
// 'all' is Gmail's \All (All Mail): every message has a copy there, so it is an archive target but never a move source.
export type FolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'all' | 'other'
// 'plain' exists for the Dovecot test container only; /mail/connect refuses it.
export type Security = 'tls' | 'starttls' | 'plain'

export interface ServerEndpoint {
  host: string
  port: number
  security: Security
}
