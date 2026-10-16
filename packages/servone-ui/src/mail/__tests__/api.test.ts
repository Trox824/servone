import { MailApiError, parseLoginCheck } from '../api'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))
jest.mock('@hcengineering/platform', () => ({ getMetadata: () => 'token' }))
jest.mock('@hcengineering/analytics', () => ({ Analytics: { handleEvent: jest.fn() } }))

describe('mail api parsing', () => {
  it('reads a successful and a failed login check', () => {
    expect(parseLoginCheck({ isOk: true })).toEqual({ isOk: true })
    expect(parseLoginCheck({ isOk: false, reason: 'auth', detail: 'Invalid credentials' })).toEqual({ isOk: false, reason: 'auth', detail: 'Invalid credentials' })
  })

  it('treats an unknown reason as a network failure so the user still sees the detail', () => {
    expect(parseLoginCheck({ isOk: false, reason: 'weird', detail: 'x' })).toEqual({ isOk: false, reason: 'network', detail: 'x' })
  })

  it('refuses a body that is not a login check', () => {
    expect(() => parseLoginCheck('nope')).toThrow(MailApiError)
  })
})
