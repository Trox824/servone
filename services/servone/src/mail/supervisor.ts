import contact from '@hcengineering/contact'
import { type AccountUuid, type MeasureContext, type PersonId, type Ref, systemAccountUuid, type Tx, type TxOperations, type WorkspaceUuid } from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import type { StorageAdapter } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { IMAP_PORTS, type MailMessageCard, mailboxSpaceId, SMTP_PORTS } from '@servone/mail'
import type { ImapFlow } from 'imapflow'
import { types } from 'util'
import { HostRefusedError, HostUnresolvedError, resolvePublicHost, ResolverDownError } from '../host-guard'
import type { Caller } from '../webhooks/auth'
import { BodyFetcher } from './bodies'
import { type BlobStore, createBlobStore } from './blobs'
import { createMailCards, type MailCards } from './cards'
import type { WorkspaceClients } from './clients'
import { type ImapLogin, type LoginCheck, openImap, testImapLogin } from './imap'
import { createMailLogger } from './logger'
import { type GoogleClient, googleAccessToken, OAuthGrantError, revokeGoogleToken } from './oauth'
import type { MailPurge } from './purge'
import { readMessageChange } from './push'
import type { ConnectRequest } from './requests'
import { ensureMailApp, ensureMailbox, ensureMailSchema } from './schema'
import { createSmtpTransport, type SmtpLogin, testSmtpLogin } from './smtp'
import { MailStore } from './store'
import { MailboxSync, POLL_INTERVAL_MS } from './sync'
import type { MailConnection, MailSecret, Vault } from './vault'

// What /mail/test, /mail/connect and /mail/reconnect all report back: either imap.ts's LoginCheck,
// or a host the guard refused before any socket was opened.
export type LoginOutcome = LoginCheck | { isOk: false, reason: 'host_refused', detail: string }

export const RECONNECT_MIN_MS = 5_000
export const RECONNECT_MAX_MS = 5 * 60_000
// Bodies are fetched in small bites so a new IDLE event never waits behind a long download run.
const BODY_BATCH = 20
const BODY_INTERVAL_MS = 30_000

export function nextBackoff (previousMs: number): number {
  return previousMs === 0 ? RECONNECT_MIN_MS : Math.min(previousMs * 2, RECONNECT_MAX_MS)
}

interface Session {
  workspace: WorkspaceUuid
  owner: AccountUuid
  // The transactor lets any workspace member write into another member's Mailbox space; only the owner's edits reach IMAP.
  ownerSocialIds: Set<PersonId>
  imap: ImapFlow
  cards: MailCards
  sync: MailboxSync
  blobs: BlobStore
  smtp: SmtpLogin
  bodies: BodyFetcher
  timers: NodeJS.Timeout[]
}

const sessionKey = (workspace: WorkspaceUuid, owner: AccountUuid): string => `${workspace}/${owner}`

// IMAP servers are case-insensitive on the mailbox address; a provider can return it in a different case than the user typed at connect time.
const sameEmail = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export class MailSupervisor {
  private readonly sessions = new Map<string, Session>()
  private readonly backoff = new Map<string, number>()
  // Joined by concurrent start() calls for the same key so a slow IMAP connect never opens two sessions.
  private readonly starting = new Map<string, Promise<void>>()
  // Joined by concurrent connect() calls for the same caller so findAccount -> createAccount can't interleave.
  private readonly connecting = new Map<string, Promise<{ account: string } | { error: 'already_connected' | 'removing' }>>()
  private isStopping = false

  constructor (
    private readonly ctx: MeasureContext,
    private readonly vault: Vault,
    private readonly storage: StorageAdapter,
    private readonly serviceId: string,
    private readonly google: GoogleClient | undefined,
    private readonly clients: WorkspaceClients,
    private readonly purge: Pick<MailPurge, 'enqueue'>
  ) {}

  // Archived or disabled workspaces keep their vault entry but get no IMAP session, like upstream pod-gmail.
  async startAll (activeWorkspaces: Set<WorkspaceUuid>): Promise<void> {
    for (const { workspace, owner } of await this.vault.listConnected()) {
      if (!activeWorkspaces.has(workspace)) continue
      await this.start(workspace, owner).catch((error: Error) => {
        this.ctx.error('mail start failed', { workspace, owner, error: error.message })
        this.scheduleReconnect(workspace, owner)
      })
    }
  }

  // De-duplicated: startAll(), connect() and scheduleReconnect() can all target the same key while a previous
  // start() is still awaiting IMAP connect, so overlapping calls join the in-flight promise instead of racing.
  async start (workspace: WorkspaceUuid, owner: AccountUuid): Promise<void> {
    const key = sessionKey(workspace, owner)
    const inFlight = this.starting.get(key)
    if (inFlight !== undefined) return await inFlight
    if (this.sessions.has(key)) return
    const promise = this.startSession(workspace, owner)
    this.starting.set(key, promise)
    try {
      await promise
    } finally {
      this.starting.delete(key)
    }
  }

  private async startSession (workspace: WorkspaceUuid, owner: AccountUuid): Promise<void> {
    const stored = await this.vault.load(workspace, owner)
    if (stored === undefined) return
    const client = await this.clients(workspace)
    const space = mailboxSpaceId(owner)
    const cards = createMailCards(client, space)
    const account = await cards.findAccount()
    if (account === undefined || account.mailStatus === 'removing') return
    const ownerSocialIds = await this.socialIdsOf(client, owner)
    if (ownerSocialIds.size === 0) this.ctx.warn('mail owner has no social ids', { workspace, owner })
    // Everything that can fail without IMAP happens before connect, so a failure here never leaves a logged-in socket.
    const workspaceIds = await getAccountClient(generateToken(systemAccountUuid, workspace, { service: this.serviceId })).getWorkspaceInfo()
    const blobs = createBlobStore(this.ctx, this.storage, { uuid: workspace, url: workspaceIds.url, dataId: workspaceIds.dataId })
    let logins: { imap: ImapLogin, smtp: SmtpLogin }
    try {
      logins = await this.logins(stored.connection, stored.secret)
    } catch (error) {
      // A revoked or expired refresh token never recovers by retrying; wait for the user to reconnect.
      if (!(error instanceof OAuthGrantError)) throw error
      await cards.updateAccount(account._id, { mailStatus: 'auth-error', mailLastError: error.message })
      return
    }
    const { imap: imapLogin, smtp } = logins
    const imap = openImap(imapLogin, createMailLogger(this.ctx, stored.connection.email))
    try {
      await imap.connect()
    } catch (error) {
      // isNativeError: imapflow's rejection comes from another realm under jest, so instanceof fails.
      if (types.isNativeError(error) && Reflect.get(error, 'authenticationFailed') === true) {
        // Retrying a rejected password gets Gmail and Microsoft accounts locked; wait for the user to reconnect.
        await cards.updateAccount(account._id, { mailStatus: 'auth-error', mailLastError: error.message })
        imap.close()
        return
      }
      await cards.updateAccount(account._id, { mailStatus: 'offline', mailLastError: types.isNativeError(error) ? error.message : String(error) })
      // Matches testImapLogin: a socket left open here would leak on every backoff retry.
      imap.close()
      throw error
    }
    const key = sessionKey(workspace, owner)
    let session: Session | undefined
    let isWatchStarted = false
    try {
      const sync = new MailboxSync({
        imap, cards, store: new MailStore(cards, account._id), account: account._id, now: Date.now,
        report: (event, fields) => { this.ctx.warn(event, fields) }
      })
      const bodies = new BodyFetcher(sync, imap, cards, blobs)
      const started: Session = { workspace, owner, ownerSocialIds, imap, cards, sync, blobs, smtp, bodies, timers: [] }
      session = started
      this.sessions.set(key, started)
      imap.on('close', () => { this.onClosed(started) })
      imap.on('error', (error: Error) => { this.ctx.warn('mail connection error', { mailbox: stored.connection.email, error: error.message }) })

      // Folder state, not mailStatus: a crash mid-backfill or a new folder leaves mailUidValidity at 0.
      const folders = await cards.findFolders({})
      if (folders.length === 0 || folders.some((folder) => folder.mailUidValidity === 0)) await sync.backfill()
      else await sync.pollAll()
      isWatchStarted = true
      await sync.watchInbox()
      await cards.updateAccount(account._id, {
        mailStatus: 'ready',
        mailLastError: ownerSocialIds.size === 0 ? 'Mailbox owner has no linked identities; changes made in Servone will not reach the mail server' : ''
      })
      this.backoff.delete(key)
      started.timers.push(setInterval(() => { void sync.pollAll().catch((error: Error) => { this.ctx.warn('mail poll failed', { error: error.message }) }) }, POLL_INTERVAL_MS))
      started.timers.push(setInterval(() => { void bodies.fetchPending(BODY_BATCH).catch((error: Error) => { this.ctx.warn('mail body fetch failed', { error: error.message }) }) }, BODY_INTERVAL_MS))
    } catch (error) {
      // Cleanup failures are reported, never thrown: start()'s caller must see the error that stopped the start.
      if (session !== undefined) {
        // Deleted before close() so onClosed sees a superseded session and leaves the reconnect to start()'s caller.
        if (this.sessions.get(key) === session) this.sessions.delete(key)
        for (const timer of session.timers) clearInterval(timer)
        if (isWatchStarted) await session.sync.stopWatching().catch((stopError: Error) => { this.ctx.warn('mail stop watching failed', { owner, error: stopError.message }) })
      }
      imap.close()
      await cards.updateAccount(account._id, { mailStatus: 'offline', mailLastError: types.isNativeError(error) ? error.message : String(error) })
        .catch((updateError: Error) => { this.ctx.warn('mail status update failed', { owner, error: updateError.message }) })
      throw error
    }
  }

  async stop (workspace: WorkspaceUuid, owner: AccountUuid): Promise<void> {
    // A start still inside imap.connect has no session yet; stopping before it settles would let it sync on afterwards.
    // Its failure is handled by whoever started it, so here it only needs to settle.
    await this.starting.get(sessionKey(workspace, owner))?.then(() => {}, () => {})
    const session = this.sessions.get(sessionKey(workspace, owner))
    if (session === undefined) return
    this.sessions.delete(sessionKey(workspace, owner))
    for (const timer of session.timers) clearInterval(timer)
    try {
      await session.sync.stopWatching()
      await session.imap.logout()
    } finally {
      session.imap.close()
    }
  }

  async stopAll (): Promise<void> {
    this.isStopping = true
    for (const session of [...this.sessions.values()]) await this.stop(session.workspace, session.owner)
  }

  async handleTx (workspace: WorkspaceUuid, tx: Tx): Promise<void> {
    const read = readMessageChange(tx)
    if (read === undefined) return
    const session = [...this.sessions.values()].find((it) => it.workspace === workspace && mailboxSpaceId(it.owner) === read.space)
    if (session === undefined) return
    if (!session.ownerSocialIds.has(tx.modifiedBy)) {
      const event = session.ownerSocialIds.size === 0 ? 'mail change dropped: owner has no social ids' : 'mail change by non-owner dropped'
      this.ctx.warn(event, { workspace, owner: session.owner, modifiedBy: tx.modifiedBy, message: read.message })
      return
    }
    await session.sync.applyChange(read.message, read.change)
  }

  // De-duplicated like start(): two overlapping requests for the same caller must not both pass the
  // findAccount check before either has created its MailAccount card.
  async connect (caller: Caller, request: ConnectRequest): Promise<{ account: string } | { error: 'already_connected' | 'removing' }> {
    const connection: MailConnection = {
      provider: request.provider, authKind: 'password', email: request.email, username: request.username, imap: request.imap, smtp: request.smtp
    }
    return await this.connectMailbox(caller, connection, { kind: 'password', password: request.password })
  }

  async connectMailbox (caller: Caller, connection: MailConnection, secret: MailSecret): Promise<{ account: string } | { error: 'already_connected' | 'removing' }> {
    const key = sessionKey(caller.workspace, caller.account)
    const inFlight = this.connecting.get(key)
    if (inFlight !== undefined) return await inFlight
    const promise = this.connectOnce(caller, connection, secret)
    this.connecting.set(key, promise)
    try {
      return await promise
    } finally {
      this.connecting.delete(key)
    }
  }

  private async connectOnce (caller: Caller, connection: MailConnection, secret: MailSecret): Promise<{ account: string } | { error: 'already_connected' | 'removing' }> {
    const client = await this.clients(caller.workspace)
    await ensureMailSchema(client)
    const space = await ensureMailbox(client, caller.account, connection.email)
    const cards = createMailCards(client, space)
    const existing = await cards.findAccount()
    if (existing?.mailStatus === 'removing') return { error: 'removing' }
    if (existing !== undefined) return { error: 'already_connected' }
    await this.vault.save(caller.workspace, caller.account, connection, secret)
    const account = await cards.createAccount(connection.email, {
      mailEmail: connection.email, mailDisplayName: '', mailProvider: connection.provider, mailAuthKind: connection.authKind, mailStatus: 'connecting',
      mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
    })
    void this.start(caller.workspace, caller.account).catch((error: Error) => {
      this.ctx.error('mail first sync failed', { owner: caller.account, error: error.message })
      this.scheduleReconnect(caller.workspace, caller.account)
    })
    return { account }
  }

  // Shared by /mail/test, /mail/connect and /mail/reconnect so a rejected password never diverges between them.
  async testLogin (connection: MailConnection, secret: MailSecret): Promise<LoginOutcome> {
    try {
      const { imap, smtp } = await this.logins(connection, secret)
      const imapCheck = await testImapLogin(imap)
      return imapCheck.isOk ? await testSmtpLogin(smtp) : imapCheck
    } catch (error) {
      // HostUnresolvedError is a HostRefusedError, so it must be checked first.
      if (error instanceof HostUnresolvedError || error instanceof ResolverDownError) return { isOk: false, reason: 'network', detail: error.code }
      if (error instanceof HostRefusedError) return { isOk: false, reason: 'host_refused', detail: error.message }
      throw error
    }
  }

  // Reconnect never disconnects first (a wrong password would then leave the user with neither the old
  // session nor a new one): it tests the new login against the caller's existing account, and only on
  // success replaces the vault secret and restarts the session. Nothing changes on failure.
  async reconnect (caller: Caller, request: ConnectRequest): Promise<{ account: string } | { error: 'not_found' | 'mailbox_mismatch' | 'removing' } | LoginOutcome> {
    const client = await this.clients(caller.workspace)
    const cards = createMailCards(client, mailboxSpaceId(caller.account))
    const account = await cards.findAccount()
    if (account === undefined) return { error: 'not_found' }
    if (account.mailStatus === 'removing') return { error: 'removing' }
    if (!sameEmail(account.mailEmail, request.email)) return { error: 'mailbox_mismatch' }
    const connection: MailConnection = {
      provider: request.provider, authKind: 'password', email: request.email, username: request.username, imap: request.imap, smtp: request.smtp
    }
    const secret: MailSecret = { kind: 'password', password: request.password }
    const check = await this.testLogin(connection, secret)
    if (!check.isOk) return check
    return await this.reattachMailbox(caller, connection, secret)
  }

  // The OAuth callback's same-email path also lands here: neither call re-tests the login, since the
  // caller has just proven it (a fresh password check above, or Google's own consent for OAuth).
  async reattachMailbox (caller: Caller, connection: MailConnection, secret: MailSecret): Promise<{ account: string } | { error: 'not_found' | 'mailbox_mismatch' | 'removing' }> {
    const client = await this.clients(caller.workspace)
    const cards = createMailCards(client, mailboxSpaceId(caller.account))
    const account = await cards.findAccount()
    if (account === undefined) return { error: 'not_found' }
    if (account.mailStatus === 'removing') return { error: 'removing' }
    if (!sameEmail(account.mailEmail, connection.email)) return { error: 'mailbox_mismatch' }
    await this.vault.save(caller.workspace, caller.account, connection, secret)
    await cards.updateAccount(account._id, { mailStatus: 'connecting', mailLastError: '' })
    await this.stop(caller.workspace, caller.account)
    void this.start(caller.workspace, caller.account).catch((error: Error) => {
      this.ctx.error('mail reattach sync failed', { owner: caller.account, error: error.message })
      this.scheduleReconnect(caller.workspace, caller.account)
    })
    return { account: account._id }
  }

  async setup (caller: Caller): Promise<void> {
    const client = await this.clients(caller.workspace)
    await ensureMailSchema(client)
    await ensureMailApp(client)
  }

  // caller comes from the authenticated bearer token (see MailHttpDeps.disconnect), never the request body,
  // so a caller can only ever stop and wipe their own mailbox.
  async disconnect (caller: Caller, shouldDeleteMail: boolean): Promise<void> {
    const stored = await this.vault.load(caller.workspace, caller.account)
    try {
      await this.stop(caller.workspace, caller.account)
    } finally {
      await this.vault.remove(caller.workspace, caller.account)
    }
    // After the vault entry is gone: a failed revoke still leaves the user disconnected here.
    if (stored?.secret.kind === 'oauth') {
      await revokeGoogleToken(stored.secret.refreshToken).catch((error: Error) => {
        this.ctx.warn('mail oauth revoke failed', { owner: caller.account, error: error.message })
      })
    }
    const client = await this.clients(caller.workspace)
    const cards = createMailCards(client, mailboxSpaceId(caller.account))
    if (!shouldDeleteMail) {
      // "Keep mail" leaves the card and its messages; mailStatus must still leave 'ready' so the UI
      // offers Reconnect instead of showing a mailbox that looks live with no session behind it.
      const account = await cards.findAccount()
      if (account !== undefined) await cards.updateAccount(account._id, { mailStatus: 'auth-error', mailLastError: '' })
      return
    }
    const account = await cards.findAccount()
    if (account === undefined) return
    // Queued before the status flips: a failed KVS write must not leave a hidden mailbox with no job to empty it.
    await this.purge.enqueue({ workspace: caller.workspace, owner: caller.account })
    await cards.updateAccount(account._id, { mailStatus: 'removing', mailLastError: '' })
  }

  // caller comes from the authenticated bearer token, so the session lookup below can only find the
  // caller's own mailbox: draftId narrows the id but the query still scopes to this account's cards.
  async send (caller: Caller, draftId: string): Promise<{ messageId: string } | { error: 'not_connected' | 'not_found' }> {
    const session = this.sessions.get(sessionKey(caller.workspace, caller.account))
    if (session === undefined) return { error: 'not_connected' }
    const [draft] = await session.cards.findMessages({ _id: draftId as Ref<MailMessageCard>, mailIsDraft: true }, { limit: 1 })
    if (draft === undefined) return { error: 'not_found' }
    return { messageId: await session.sync.send(draft, session.blobs, createSmtpTransport(session.smtp)) }
  }

  async saveDraft (caller: Caller, draftId: string): Promise<{ isOk: true } | { error: 'not_connected' | 'not_found' }> {
    const session = this.sessions.get(sessionKey(caller.workspace, caller.account))
    if (session === undefined) return { error: 'not_connected' }
    const [draft] = await session.cards.findMessages({ _id: draftId as Ref<MailMessageCard>, mailIsDraft: true }, { limit: 1 })
    if (draft === undefined) return { error: 'not_found' }
    await session.sync.saveDraft(draft, session.blobs)
    return { isOk: true }
  }

  async fetchBody (caller: Caller, messageId: string): Promise<{ isOk: true } | { error: 'not_connected' | 'not_found' }> {
    const session = this.sessions.get(sessionKey(caller.workspace, caller.account))
    if (session === undefined) return { error: 'not_connected' }
    // Drafts included: one synced from the provider has no body until fetched, and Continue editing needs it.
    const [message] = await session.cards.findMessages({ _id: messageId as Ref<MailMessageCard> }, { limit: 1 })
    if (message === undefined) return { error: 'not_found' }
    if (message.mailBodyBlob === '' && message.mailRawBlob === '') await session.bodies.fetchOne(message)
    return { isOk: true }
  }

  async logins (connection: MailConnection, secret: MailSecret): Promise<{ imap: ImapLogin, smtp: SmtpLogin }> {
    const auth = await this.authOf(secret)
    return {
      imap: {
        endpoint: connection.imap, address: await resolvePublicHost(connection.imap.host, connection.imap.port, IMAP_PORTS),
        servername: connection.imap.host, username: connection.username, auth: auth.imap
      },
      smtp: {
        endpoint: connection.smtp, address: await resolvePublicHost(connection.smtp.host, connection.smtp.port, SMTP_PORTS),
        servername: connection.smtp.host, username: connection.username, auth: auth.smtp
      }
    }
  }

  private async authOf (secret: MailSecret): Promise<{ imap: ImapLogin['auth'], smtp: SmtpLogin['auth'] }> {
    if (secret.kind === 'password') return { imap: { pass: secret.password }, smtp: { pass: secret.password } }
    if (this.google === undefined) throw new Error('OAuth mailbox needs MAIL_GOOGLE_CREDENTIALS')
    // IMAP checks the access token only at login, so each connect or reconnect fetches a fresh one.
    return {
      imap: { accessToken: await googleAccessToken(this.google, secret.refreshToken) },
      smtp: { type: 'OAuth2', clientId: this.google.clientId, clientSecret: this.google.clientSecret, refreshToken: secret.refreshToken }
    }
  }

  private async socialIdsOf (client: TxOperations, owner: AccountUuid): Promise<Set<PersonId>> {
    const person = await client.findOne(contact.class.Person, { personUuid: owner })
    if (person === undefined) return new Set()
    const identities = await client.findAll(contact.class.SocialIdentity, { attachedTo: person._id })
    return new Set(identities.map((identity) => identity._id))
  }

  private onClosed (session: Session): void {
    for (const timer of session.timers) clearInterval(timer)
    const key = sessionKey(session.workspace, session.owner)
    // A stale 'close' from a superseded session must not evict the session that replaced it.
    if (this.sessions.get(key) !== session) return
    this.sessions.delete(key)
    if (!this.isStopping) this.scheduleReconnect(session.workspace, session.owner)
  }

  private scheduleReconnect (workspace: WorkspaceUuid, owner: AccountUuid): void {
    const key = sessionKey(workspace, owner)
    const delay = nextBackoff(this.backoff.get(key) ?? 0)
    this.backoff.set(key, delay)
    setTimeout(() => {
      if (this.isStopping || this.sessions.has(key)) return
      void this.start(workspace, owner).catch((error: Error) => {
        this.ctx.warn('mail reconnect failed', { owner, error: error.message })
        this.scheduleReconnect(workspace, owner)
      })
    }, delay)
  }
}
