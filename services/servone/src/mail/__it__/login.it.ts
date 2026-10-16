import { testImapLogin } from '../imap'
import { startMailbox } from './harness'

describe('IMAP login against Dovecot', () => {
  it('accepts the right password', async () => {
    const mailbox = await startMailbox()
    expect(await testImapLogin(mailbox.login)).toEqual({ isOk: true })
  })

  it('reports a wrong password as an auth failure', async () => {
    const mailbox = await startMailbox()
    const check = await testImapLogin({ ...mailbox.login, auth: { pass: 'wrong' } })
    expect(check).toMatchObject({ isOk: false, reason: 'auth' })
  })

  it('reports a closed port as a network failure', async () => {
    const mailbox = await startMailbox()
    const check = await testImapLogin({ ...mailbox.login, endpoint: { ...mailbox.login.endpoint, port: 3199 } })
    expect(check).toMatchObject({ isOk: false, reason: 'network' })
  })
})
