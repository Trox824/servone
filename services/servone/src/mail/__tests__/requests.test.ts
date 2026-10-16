import { parseConnectRequest } from '../requests'

describe('parseConnectRequest', () => {
  it('fills endpoints from the preset', () => {
    expect(parseConnectRequest({ provider: 'gmail', email: 'Linh@Gmail.com', password: 'abcd efgh ijkl mnop' })).toEqual({
      provider: 'gmail', email: 'linh@gmail.com', username: 'linh@gmail.com', password: 'abcd efgh ijkl mnop',
      imap: { host: 'imap.gmail.com', port: 993, security: 'tls' }, smtp: { host: 'smtp.gmail.com', port: 465, security: 'tls' }
    })
  })

  it('takes custom endpoints for Khác and refuses plaintext', () => {
    expect(parseConnectRequest({ provider: 'other', email: 'a@acme.vn', password: 'x', imap: { host: 'mail.acme.vn', port: 993, security: 'tls' }, smtp: { host: 'mail.acme.vn', port: 587, security: 'starttls' } }))
      .toMatchObject({ imap: { host: 'mail.acme.vn' } })
    expect(parseConnectRequest({ provider: 'other', email: 'a@acme.vn', password: 'x', imap: { host: 'mail.acme.vn', port: 143, security: 'plain' }, smtp: { host: 'mail.acme.vn', port: 587, security: 'starttls' } }))
      .toEqual({ error: 'invalid_imap' })
  })

  it('refuses OAuth providers until Plan 3', () => {
    expect(parseConnectRequest({ provider: 'outlook', email: 'a@outlook.com', password: 'x' })).toEqual({ error: 'oauth_required' })
  })

  it('refuses a missing password or a bad email', () => {
    expect(parseConnectRequest({ provider: 'gmail', email: 'a@gmail.com' })).toEqual({ error: 'invalid_password' })
    expect(parseConnectRequest({ provider: 'gmail', email: 'nope', password: 'x' })).toEqual({ error: 'invalid_email' })
  })
})
