jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))

import { MailApiError } from '../../api'
import { mailErrorKey } from '../errors'
import { en } from '../../strings'

it('maps known service codes to a plain sentence', () => {
  expect(mailErrorKey(new MailApiError(409, 'already_connected'))).toBe('ErrAlreadyConnected')
  expect(mailErrorKey(new MailApiError(0, 'not_configured'))).toBe('ErrNotConfigured')
  expect(mailErrorKey(new MailApiError(429, 'rate_limited'))).toBe('ErrRateLimited')
  expect(mailErrorKey(new MailApiError(400, 'mailbox_mismatch'))).toBe('ErrMailboxMismatch')
  expect(mailErrorKey(new MailApiError(404, 'not_connected'))).toBe('ErrNotConnected')
  expect(mailErrorKey(new MailApiError(404, 'not_found'))).toBe('ErrNotFound')
  expect(mailErrorKey(new MailApiError(400, 'invalid'))).toBe('ErrInvalidTask')
  expect(mailErrorKey(new MailApiError(400, 'invalid_smtp'))).toBe('ErrInvalidServer')
  expect(mailErrorKey(new MailApiError(502, 'mail_unavailable'))).toBe('ErrServiceDown')
})

it('never shows an unknown code, only the generic message', () => {
  expect(mailErrorKey(new MailApiError(500, 'internal_error'))).toBe('ErrGeneric')
  expect(mailErrorKey(new MailApiError(200, 'bad_response'))).toBe('ErrGeneric')
  expect(mailErrorKey(new Error('boom'))).toBe('ErrGeneric')
  expect(en[mailErrorKey(new MailApiError(500, 'weird_code'))]).not.toContain('weird_code')
})

it('tells an offline user to check their connection', () => {
  expect(mailErrorKey(new TypeError('Failed to fetch'))).toBe('ErrOffline')
})
