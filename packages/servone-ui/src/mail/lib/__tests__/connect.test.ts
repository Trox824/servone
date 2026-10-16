import { formFor, loginErrorKey, visibleTiles } from '../connect'

it('tells Gmail users about 2-Step Verification on a refused password', () => {
  expect(loginErrorKey({ isOk: false, reason: 'auth', detail: 'x' }, 'gmail')).toBe('ErrAuthGmail')
  expect(loginErrorKey({ isOk: false, reason: 'auth', detail: 'x' }, 'zoho')).toBe('ErrAuth')
  expect(loginErrorKey({ isOk: false, reason: 'network', detail: 'ETIMEDOUT' }, 'other')).toBe('ErrNetwork')
})

it('builds a custom server form with the security the port implies', () => {
  expect(formFor('other', 'a@acme.vn', 'p', 'mail.acme.vn', 143, 'mail.acme.vn', 587)).toEqual({
    provider: 'other',
    email: 'a@acme.vn',
    password: 'p',
    imap: { host: 'mail.acme.vn', port: 143, security: 'starttls' },
    smtp: { host: 'mail.acme.vn', port: 587, security: 'starttls' }
  })
  expect(formFor('gmail', 'a@gmail.com', 'p', '', 0, '', 0)).toEqual({ provider: 'gmail', email: 'a@gmail.com', password: 'p' })
})

it('reports the tls reason and a refused custom host', () => {
  expect(loginErrorKey({ isOk: false, reason: 'tls', detail: 'CERT' }, 'other')).toBe('ErrTls')
  expect(loginErrorKey({ isOk: false, reason: 'host_refused', detail: '' }, 'other')).toBe('ErrHostRefused')
})

it('hides Outlook from new connections but keeps it for an Outlook account reconnecting', () => {
  expect(visibleTiles(undefined)).not.toContain('outlook')
  expect(visibleTiles('gmail')).not.toContain('outlook')
  expect(visibleTiles('outlook')).toContain('outlook')
})

it('builds implicit-tls ports for a custom server on 993/465', () => {
  expect(formFor('other', 'a@acme.vn', 'p', 'mail.acme.vn', 993, 'mail.acme.vn', 465)).toEqual({
    provider: 'other',
    email: 'a@acme.vn',
    password: 'p',
    imap: { host: 'mail.acme.vn', port: 993, security: 'tls' },
    smtp: { host: 'mail.acme.vn', port: 465, security: 'tls' }
  })
})
