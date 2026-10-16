import type { MailAccountCard } from '@servone/mail'
import { findPreset } from '@servone/mail'

export type Banner =
  | { kind: 'none' }
  | { kind: 'backfill', done: number, total: number }
  | { kind: 'authError', email: string }
  | { kind: 'offline', host: string }

type BannerAccount = Pick<MailAccountCard, 'mailStatus' | 'mailEmail' | 'mailProvider' | 'mailBackfillDone' | 'mailBackfillTotal' | 'mailLastError'>

const HOST_IN_CONNECT_ERROR = /connect\s+\S+\s+([^:\s]+):\d+/

function offlineHost (account: BannerAccount): string {
  const preset = findPreset(account.mailProvider)
  if (preset !== undefined) return preset.imap.host
  const match = HOST_IN_CONNECT_ERROR.exec(account.mailLastError)
  if (match !== null) return match[1]
  return account.mailEmail.split('@')[1] ?? ''
}

export function accountBanner (account: BannerAccount): Banner {
  if (account.mailStatus === 'auth-error') return { kind: 'authError', email: account.mailEmail }
  if (account.mailStatus === 'backfilling') return { kind: 'backfill', done: account.mailBackfillDone, total: account.mailBackfillTotal }
  if (account.mailStatus === 'offline') return { kind: 'offline', host: offlineHost(account) }
  return { kind: 'none' }
}
