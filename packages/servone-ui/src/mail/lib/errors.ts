import { MailApiError } from '../api'
import type { StringKey } from '../strings'

const KEY_BY_CODE = new Map<string, StringKey>([
  ['already_connected', 'ErrAlreadyConnected'],
  ['not_configured', 'ErrNotConfigured'],
  ['rate_limited', 'ErrRateLimited'],
  ['mailbox_mismatch', 'ErrMailboxMismatch'],
  ['removing', 'ErrRemoving'],
  ['not_connected', 'ErrNotConnected'],
  ['not_found', 'ErrNotFound'],
  ['invalid_task', 'ErrInvalidTask'],
  ['invalid', 'ErrInvalidTask'],
  ['invalid_email', 'ErrInvalidEmail'],
  ['invalid_password', 'ErrInvalidPassword'],
  ['invalid_imap', 'ErrInvalidServer'],
  ['invalid_smtp', 'ErrInvalidServer'],
  ['oauth_required', 'ErrOAuthRequired'],
  ['oauth_unavailable', 'ErrOAuthUnavailable'],
  ['unauthorized', 'ErrSessionExpired'],
  ['mail_unavailable', 'ErrServiceDown']
])

export function mailErrorKey (error: Error): StringKey {
  if (error instanceof MailApiError) return KEY_BY_CODE.get(error.code) ?? 'ErrGeneric'
  if (error instanceof TypeError) return 'ErrOffline'
  return 'ErrGeneric'
}
