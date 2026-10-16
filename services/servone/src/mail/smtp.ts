import type { ServerEndpoint } from '@servone/mail'
import { parseAddress } from '@servone/mail'
import { randomUUID } from 'crypto'
import { types } from 'util'
import nodemailer, { type Transporter } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { LoginCheck } from './imap'

export interface SmtpLogin {
  endpoint: ServerEndpoint
  // The resolved IP from resolvePublicHost; endpoint.host stays the name for TLS, same as ImapLogin.
  address: string
  servername: string
  username: string
  // nodemailer's own auth keys: with OAuth2 it refreshes the access token itself before each login.
  auth: { pass: string } | { type: 'OAuth2', clientId: string, clientSecret: string, refreshToken: string }
}

export function createSmtpTransport (login: SmtpLogin): Transporter {
  return nodemailer.createTransport({
    host: login.address,
    port: login.endpoint.port,
    secure: login.endpoint.security === 'tls',
    requireTLS: login.endpoint.security === 'starttls',
    ignoreTLS: login.endpoint.security === 'plain',
    tls: { servername: login.servername },
    auth: { user: login.username, ...login.auth },
    logger: false
  })
}

export async function testSmtpLogin (login: SmtpLogin): Promise<LoginCheck> {
  try {
    await createSmtpTransport(login).verify()
    return { isOk: true }
  } catch (error: unknown) {
    // isNativeError: Node socket/TLS errors come from another realm under jest, so instanceof fails.
    if (!types.isNativeError(error)) throw error
    const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
    if (code === 'EAUTH') return { isOk: false, reason: 'auth', detail: error.message }
    if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') return { isOk: false, reason: 'network', detail: code }
    if (code === 'ETLS') return { isOk: false, reason: 'tls', detail: error.message }
    throw error
  }
}

export interface OutgoingMail {
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  html: string
  text: string
  messageId: string
  inReplyTo: string
  references: string[]
  attachments: Array<{ filename: string, contentType: string, content: Buffer }>
}

export function newMessageId (from: string): string {
  const domain = parseAddress(from).email.split('@')[1] ?? 'servone.local'
  return `<${randomUUID()}@${domain}>`
}

export async function buildMime (mail: OutgoingMail): Promise<Buffer> {
  const composer = new MailComposer({
    from: mail.from,
    to: mail.to,
    cc: mail.cc,
    // Bcc belongs in the SMTP envelope only; MailComposer leaves it out of the headers.
    bcc: mail.bcc,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    messageId: mail.messageId,
    inReplyTo: mail.inReplyTo === '' ? undefined : mail.inReplyTo,
    references: mail.references.length === 0 ? undefined : mail.references,
    attachments: mail.attachments
  })
  return await composer.compile().build()
}
