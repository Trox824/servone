import { type AccountUuid, type MeasureContext, systemAccountUuid, type Tx, type WorkspaceUuid } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { QueueTopic } from '@hcengineering/server-core'
import { buildStorageFromConfig, storageConfigFromEnv } from '@hcengineering/server-storage'
import { generateToken } from '@hcengineering/server-token'
import { findPreset } from '@servone/mail'
import config from '../config'
import { createSessionCache, openSession } from '../mcp/session'
import type { RequestHandler } from '../router'
import { authenticate, readBearer } from '../webhooks/auth'
import { TokenBuckets } from '../webhooks/rate'
import { findWorkspace, listActiveWorkspaces } from '../workspaces'
import { openBlobStore } from './blobs'
import { createWorkspaceClients } from './clients'
import { createMailHandler } from './http'
import { exchangeGoogleCode, googleConsentUrl, OAuthGrantError, parseGoogleClient, PendingConsents } from './oauth'
import { MailPurge, PURGE_PAUSE_MS } from './purge'
import { MailSupervisor } from './supervisor'
import { createTaskForCaller } from './task'
import { parseVaultKeys, Vault, VAULT_NAMESPACE } from './vault'

// Five login attempts, then one a minute: a person retyping is fine, a password sprayer is not.
const LOGIN_BURST = 5
const LOGIN_REFILL_PER_SECOND = 1 / 60

export interface MailModuleConfig {
  IsEnabled: boolean
  VaultKeys: string | undefined
  GoogleCredentials: string | undefined
  QueueRegion: string
  ServiceId: string
}

export function createMail (ctx: MeasureContext, mailConfig: MailModuleConfig): { handler: RequestHandler, stop: () => Promise<void> } {
  if (mailConfig.VaultKeys === undefined) throw new Error('MAIL_SYNC_ENABLED needs MAIL_VAULT_KEYS')
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: mailConfig.ServiceId })
  const kv = getKvsClient(VAULT_NAMESPACE, config.KvsUrl, kvsToken)
  const vault = new Vault(kv, parseVaultKeys(mailConfig.VaultKeys))
  const google = mailConfig.GoogleCredentials === undefined ? undefined : parseGoogleClient(mailConfig.GoogleCredentials)
  const gmail = findPreset('gmail')
  if (gmail === undefined) throw new Error('Gmail provider preset is missing')
  // Must be listed under Authorized redirect URIs on the Google OAuth client.
  const redirectUri = `${config.PublicUrl}/mail/oauth/callback`
  const consents = new PendingConsents(Date.now)
  const storage = buildStorageFromConfig(storageConfigFromEnv())
  const clients = createWorkspaceClients(mailConfig.ServiceId)
  const purge = new MailPurge(ctx, kv, clients, async (workspace) => await openBlobStore(ctx, storage, mailConfig.ServiceId, workspace), PURGE_PAUSE_MS)
  purge.resume()
  const supervisor = new MailSupervisor(ctx, vault, storage, mailConfig.ServiceId, google, clients, purge)
  void listActiveWorkspaces(mailConfig.ServiceId, Date.now())
    .then(async (workspaces) => { await supervisor.startAll(new Set(workspaces.map((workspace) => workspace.uuid))) })
    .catch((error: Error) => { ctx.error('mail sessions not started', { error: error.message }) })

  // Keyed by account, not by the bearer token: every token for the same account opens an identical, caller-scoped session.
  const taskSessionFor = createSessionCache<{ token: string, workspace: WorkspaceUuid, account: AccountUuid }>(
    async (opening) => await openSession({ token: opening.token, workspace: opening.workspace }),
    (opening) => `${opening.workspace}/${opening.account}`,
    Date.now
  )

  const queue = getPlatformQueue(mailConfig.ServiceId, mailConfig.QueueRegion)
  // A throw makes the queue retry with backoff: only transient IMAP failures may throw here, since a change that
  // can never apply (malformed location, not the mailbox owner) would retry forever and block the topic.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (_ctx, message) => {
    await supervisor.handleTx(message.workspace, message.value)
  })

  const handler = createMailHandler({
    frontUrl: config.FrontUrl,
    buckets: new TokenBuckets(LOGIN_BURST, LOGIN_REFILL_PER_SECOND),
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    checkLogin: async (request) => await supervisor.testLogin(
      { provider: request.provider, authKind: 'password', email: request.email, username: request.username, imap: request.imap, smtp: request.smtp },
      { kind: 'password', password: request.password }
    ),
    connect: async (caller, request) => await supervisor.connect(caller, request),
    reconnect: async (caller, request) => await supervisor.reconnect(caller, request),
    disconnect: async (caller, shouldDeleteMail) => { await supervisor.disconnect(caller, shouldDeleteMail) },
    setup: async (caller) => { await supervisor.setup(caller) },
    send: async (caller, draft) => await supervisor.send(caller, draft),
    saveDraft: async (caller, draft) => await supervisor.saveDraft(caller, draft),
    fetchBody: async (caller, message) => await supervisor.fetchBody(caller, message),
    createTask: async (caller, authorization, request) => {
      // authenticate() has already verified this same bearer token; openSession re-derives the caller's own client from it.
      const token = readBearer(authorization)
      if (token === undefined) return { error: 'not_found' }
      const session = await taskSessionFor({ token, workspace: caller.workspace, account: caller.account })
      const workspaceInfo = await findWorkspace(mailConfig.ServiceId, caller.workspace)
      return await createTaskForCaller(session, caller, workspaceInfo?.url, config.FrontUrl, request)
    },
    startOAuth: (caller) => {
      if (google === undefined) return { error: 'oauth_unavailable' }
      const { state, verifier } = consents.begin(caller)
      return { url: googleConsentUrl(google, redirectUri, state, verifier) }
    },
    completeOAuth: async (state, code) => {
      const consent = consents.take(state)
      if (consent === undefined || google === undefined) return { isOk: false, reason: 'expired' }
      let granted: { email: string, refreshToken: string }
      try {
        granted = await exchangeGoogleCode(google, redirectUri, code, consent.verifier)
      } catch (error) {
        if (error instanceof OAuthGrantError) return { isOk: false, reason: 'expired' }
        throw error
      }
      const connection = { provider: 'gmail' as const, authKind: 'oauth' as const, email: granted.email, username: granted.email, imap: gmail.imap, smtp: gmail.smtp }
      const secret = { kind: 'oauth' as const, refreshToken: granted.refreshToken }
      // Google re-consenting to the same mailbox is a reconnect, not a second mailbox: reattach replaces the
      // refresh token and restarts the session instead of failing with already_connected.
      const reattached = await supervisor.reattachMailbox(consent.caller, connection, secret)
      if (!('error' in reattached)) return { isOk: true }
      if (reattached.error === 'mailbox_mismatch') return { isOk: false, reason: 'already_connected' }
      if (reattached.error === 'removing') return { isOk: false, reason: 'removing' }
      const connected = await supervisor.connectMailbox(consent.caller, connection, secret)
      return 'error' in connected ? { isOk: false, reason: connected.error } : { isOk: true }
    },
    report: (event, fields) => { ctx.info(event, fields) }
  })
  return {
    handler,
    stop: async () => {
      purge.stop()
      await consumer.close()
      await supervisor.stopAll()
    }
  }
}
