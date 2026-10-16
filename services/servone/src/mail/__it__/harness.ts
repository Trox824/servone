import { randomUUID } from 'crypto'
import type { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import type { AddressInfo } from 'net'
import { SMTPServer } from 'smtp-server'
import { type ImapLogin, openImap } from '../imap'
import type { SmtpLogin } from '../smtp'

export const DOVECOT_PORT = 3143
const DOVECOT_PASSWORD = 'test-pass'

export interface TestMailbox {
  login: ImapLogin
  // A second connection plays "the user in Gmail" changing things behind our back.
  peer: () => Promise<ImapFlow>
  appendRaw: (path: string, raw: string, flags?: string[], date?: Date) => Promise<number>
}

export function rawMessage (fields: { messageId: string, subject: string, from?: string, to?: string, date?: Date, inReplyTo?: string, references?: string, body?: string }): string {
  const lines = [
    `Message-ID: ${fields.messageId}`,
    `Date: ${(fields.date ?? new Date()).toUTCString()}`,
    `From: ${fields.from ?? 'Khach <khach@example.vn>'}`,
    `To: ${fields.to ?? 'linh@example.vn'}`,
    `Subject: ${fields.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8'
  ]
  if (fields.inReplyTo !== undefined) lines.push(`In-Reply-To: ${fields.inReplyTo}`)
  if (fields.references !== undefined) lines.push(`References: ${fields.references}`)
  return `${lines.join('\r\n')}\r\n\r\n${fields.body ?? 'Chào anh'}\r\n`
}

export async function startMailbox (): Promise<TestMailbox> {
  const login: ImapLogin = {
    endpoint: { host: '127.0.0.1', port: DOVECOT_PORT, security: 'plain' },
    address: '127.0.0.1',
    servername: 'localhost',
    username: `it-${randomUUID()}@test.local`,
    auth: { pass: DOVECOT_PASSWORD }
  }
  const peer = async (): Promise<ImapFlow> => {
    const client = openImap(login, false)
    await client.connect()
    return client
  }
  const appendRaw = async (path: string, raw: string, flags: string[] = [], date?: Date): Promise<number> => {
    const client = await peer()
    const appended = await client.append(path, raw, flags, date)
    await client.logout()
    if (appended === false) throw new Error(`APPEND to ${path} failed`)
    return Number(appended.uid)
  }
  return { login, peer, appendRaw }
}

export interface CapturedSmtp {
  login: SmtpLogin
  received: Array<{ recipients: string[], parsed: ParsedMail }>
  close: () => Promise<void>
}

export async function startSmtpCapture (): Promise<CapturedSmtp> {
  const received: CapturedSmtp['received'] = []
  const server = new SMTPServer({
    secure: false,
    disabledCommands: ['STARTTLS'],
    authOptional: false,
    onAuth: (auth, _session, done) => { done(null, { user: auth.username }) },
    onData: (stream, session, done) => {
      void simpleParser(stream).then((parsed) => {
        received.push({ recipients: session.envelope.rcptTo.map((rcpt) => rcpt.address), parsed })
        done()
      }, done)
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.server.address() as AddressInfo).port
  return {
    login: { endpoint: { host: '127.0.0.1', port, security: 'plain' }, address: '127.0.0.1', servername: 'localhost', username: 'linh', auth: { pass: 'x' } },
    received,
    close: async () => { await new Promise<void>((resolve) => server.close(() => resolve())) }
  }
}
