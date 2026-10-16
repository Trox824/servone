import { MeasureMetricsContext } from '@hcengineering/core'
import { createMailLogger } from '../logger'

describe('createMailLogger', () => {
  it('forwards only the message and error text', () => {
    const ctx = new MeasureMetricsContext('test', {})
    const warn = jest.spyOn(ctx, 'warn').mockImplementation(() => {})
    const logger = createMailLogger(ctx, 'linh@example.vn')
    // imapflow hands over entries with more fields than LogEntry declares; a variable skips the excess-property check.
    const entry = { msg: 'Login failed', err: new Error('AUTHENTICATIONFAILED'), password: 'abcd efgh', accessToken: 'tok', cmd: 'LOGIN linh abcd' }
    logger.warn(entry)
    expect(warn).toHaveBeenCalledWith('Login failed', { mailbox: 'linh@example.vn', error: 'AUTHENTICATIONFAILED' })
  })

  it('drops debug and info', () => {
    const ctx = new MeasureMetricsContext('test', {})
    const info = jest.spyOn(ctx, 'info')
    createMailLogger(ctx, 'x').info({ msg: 'C: LOGIN x secret' })
    expect(info).not.toHaveBeenCalled()
  })
})
