import type { Ref } from '@hcengineering/core'
import { type FolderRole, formatAddress, type MailFolderCard, type ServerEndpoint } from '@servone/mail'
import { type FetchMessageObject, type FetchQueryObject, ImapFlow, type ListResponse, type MessageAddressObject, type MessageStructureObject } from 'imapflow'
import { types } from 'util'
import type { MailLogger } from './logger'
import type { FetchedMessage } from './store'

export interface ImapLogin {
  endpoint: ServerEndpoint
  // The resolved IP from resolvePublicHost; endpoint.host stays the name for TLS.
  address: string
  servername: string
  username: string
  // imapflow's own auth keys: XOAUTH2 when accessToken is set.
  auth: { pass: string } | { accessToken: string }
}

export function openImap (login: ImapLogin, logger: MailLogger | false): ImapFlow {
  return new ImapFlow({
    host: login.address,
    port: login.endpoint.port,
    secure: login.endpoint.security === 'tls',
    doSTARTTLS: login.endpoint.security === 'starttls' ? true : login.endpoint.security === 'plain' ? false : undefined,
    servername: login.servername,
    auth: { user: login.username, ...login.auth },
    logger,
    emitLogs: false
  })
}

export type LoginCheck = { isOk: true } | { isOk: false, reason: 'auth' | 'network' | 'tls', detail: string }

const NETWORK_CODES = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'NoConnection']

export async function testImapLogin (login: ImapLogin): Promise<LoginCheck> {
  const client = openImap(login, false)
  try {
    await client.connect()
    await client.logout()
    return { isOk: true }
  } catch (error: unknown) {
    // isNativeError: Node socket/TLS errors come from another realm under jest, so instanceof fails.
    client.close()
    if (!types.isNativeError(error)) throw error
    if ('authenticationFailed' in error && error.authenticationFailed === true) {
      return { isOk: false, reason: 'auth', detail: 'responseText' in error ? String(error.responseText) : error.message }
    }
    const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
    if (NETWORK_CODES.includes(code)) {
      return { isOk: false, reason: 'network', detail: code }
    }
    if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || /certificate|ssl|tls/i.test(error.message)) {
      return { isOk: false, reason: 'tls', detail: error.message }
    }
    throw error
  }
}

export interface ListedFolder {
  path: string
  name: string
  role: FolderRole
}

// \Flagged and \Important are Gmail views of messages that live elsewhere; syncing them would only add duplicate locations.
const SKIPPED_USES = ['\\Flagged', '\\Important']
const ROLE_BY_USE = new Map<string, FolderRole>([
  ['\\Inbox', 'inbox'], ['\\Sent', 'sent'], ['\\Drafts', 'drafts'], ['\\Trash', 'trash'],
  ['\\Junk', 'spam'], ['\\Archive', 'archive'], ['\\All', 'all']
])

export function toListedFolder (entry: ListResponse): ListedFolder | undefined {
  if (entry.flags.has('\\Noselect') || entry.flags.has('\\NonExistent')) return undefined
  const use = entry.specialUse ?? ''
  if (SKIPPED_USES.includes(use)) return undefined
  const role = entry.path.toUpperCase() === 'INBOX' ? 'inbox' : ROLE_BY_USE.get(use) ?? 'other'
  return { path: entry.path, name: entry.name, role }
}

export const FETCH_QUERY: FetchQueryObject = {
  uid: true,
  flags: true,
  envelope: true,
  internalDate: true,
  bodyStructure: true,
  headers: ['references'],
  emailId: true,
  threadId: true
}

function addresses (list: MessageAddressObject[] | undefined): string[] {
  return (list ?? []).filter((it) => it.address !== undefined).map((it) => formatAddress({ name: it.name ?? '', email: (it.address ?? '').toLowerCase() }))
}

function referencesOf (headers: Buffer | undefined): string[] {
  if (headers === undefined) return []
  const unfolded = headers.toString('utf8').replace(/\r?\n[ \t]+/g, ' ')
  return unfolded.match(/<[^<>\s]+>/g) ?? []
}

export function hasAttachmentPart (node: MessageStructureObject | undefined): boolean {
  if (node === undefined) return false
  if (node.disposition === 'attachment') return true
  return (node.childNodes ?? []).some(hasAttachmentPart)
}

export function toFetchedMessage (message: FetchMessageObject, folder: Ref<MailFolderCard>): FetchedMessage {
  const envelope = message.envelope
  const flags = message.flags ?? new Set<string>()
  return {
    folder,
    uid: message.uid,
    messageId: envelope?.messageId ?? '',
    inReplyTo: envelope?.inReplyTo ?? '',
    references: referencesOf(message.headers),
    subject: envelope?.subject ?? '',
    from: addresses(envelope?.from)[0] ?? '',
    to: addresses(envelope?.to),
    cc: addresses(envelope?.cc),
    bcc: addresses(envelope?.bcc),
    sentAt: (envelope?.date !== undefined ? new Date(envelope.date) : message.internalDate !== undefined ? new Date(message.internalDate) : new Date(0)).getTime(),
    isRead: flags.has('\\Seen'),
    isStarred: flags.has('\\Flagged'),
    isDraft: flags.has('\\Draft'),
    hasAttachments: hasAttachmentPart(message.bodyStructure),
    providerMessageId: message.emailId ?? '',
    providerThreadId: message.threadId ?? ''
  }
}
