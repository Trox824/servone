import { AccountRole, MeasureMetricsContext, type AccountUuid, type PersonId, type Ref, TxFactory, type WorkspaceUuid } from '@hcengineering/core'
import type { StorageAdapter } from '@hcengineering/server-core'
import { MAIL_MESSAGE_CLASS, mailboxSpaceId, type MailMessageCard, type MailThreadCard } from '@servone/mail'
import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'
import { FakeMailCards } from './fake-cards'
import { FakeKeyValueClient } from './fake-kv'
import { parseVaultKeys, Vault } from '../vault'

// A fake IMAP socket: connect()/logout() resolve at once; tests fire 'close' by hand instead of a real disconnect.
class MockImapFlow extends EventEmitter {
  isClosed = false
  async connect (): Promise<void> {}
  async logout (): Promise<void> { await mockLogout() }
  close (): void { this.isClosed = true }
}

const mockImapFlows: MockImapFlow[] = []
const mockLogout = jest.fn(async () => {})
const mockSync = {
  run: jest.fn(async (task: () => Promise<void>) => { await task() }),
  backfill: jest.fn(async () => {}),
  pollAll: jest.fn(async () => {}),
  watchInbox: jest.fn(async () => {}),
  stopWatching: jest.fn(async () => {}),
  applyChange: jest.fn(async () => {}),
  send: jest.fn(async () => '<msg@id>'),
  saveDraft: jest.fn(async () => {})
}
const mockBodies = {
  fetchPending: jest.fn(async () => 0),
  fetchOne: jest.fn(async () => {})
}
const OWNER_SOCIAL_ID = 'social-owner' as PersonId
// Stands in for the transactor: the owner's Person and one SocialIdentity attached to it.
const mockTransactor = {
  findOne: jest.fn(async (): Promise<{ _id: string } | undefined> => ({ _id: 'person-owner' })),
  findAll: async () => [{ _id: OWNER_SOCIAL_ID }]
}
const mockGetWorkspaceInfo = jest.fn(async () => ({ url: 'https://ws.example', dataId: undefined }))
const mockCardsBySpace = new Map<string, FakeMailCards>()
const mockPurge = { enqueue: jest.fn(async () => {}) }

jest.mock('@hcengineering/server-token', () => ({ generateToken: () => 'token' }), { virtual: true })
jest.mock('@hcengineering/api-client', () => ({ createRestTxOperations: async () => ({ client: mockTransactor }) }), { virtual: true })
jest.mock(
  '@hcengineering/server-client',
  () => ({
    getAccountClient: () => ({ getWorkspaceInfo: mockGetWorkspaceInfo }),
    getTransactorEndpoint: async () => 'ws://transactor.internal'
  }),
  { virtual: true }
)
jest.mock('../../host-guard', () => ({ resolvePublicHost: async (host: string) => host }))
jest.mock('../logger', () => ({ createMailLogger: () => ({ debug () {}, info () {}, warn () {}, error () {} }) }))
jest.mock('../blobs', () => ({ createBlobStore: () => ({ put: async () => '', read: async () => Buffer.from('') }) }))
jest.mock('../bodies', () => ({ BodyFetcher: jest.fn().mockImplementation(() => mockBodies) }))
const mockTestImapLogin = jest.fn(async () => ({ isOk: true as const }))
const mockTestSmtpLogin = jest.fn(async () => ({ isOk: true as const }))
jest.mock('../imap', () => ({
  openImap: () => {
    const imap = new MockImapFlow()
    mockImapFlows.push(imap)
    return imap
  },
  testImapLogin: (login: unknown) => mockTestImapLogin(login)
}))
jest.mock('../smtp', () => ({
  ...jest.requireActual('../smtp'),
  testSmtpLogin: (login: unknown) => mockTestSmtpLogin(login)
}))
// IMAP/thread behavior is covered by the sync tests; here only which calls start() and handleTx() make matters.
jest.mock('../sync', () => ({
  MailboxSync: jest.fn().mockImplementation(() => mockSync),
  POLL_INTERVAL_MS: 999_999_999
}))
jest.mock('../cards', () => ({
  createMailCards: (_client: unknown, space: string) => mockCardsBySpace.get(space)
}))

import { createWorkspaceClients } from '../clients'
import { nextBackoff, RECONNECT_MAX_MS, RECONNECT_MIN_MS, MailSupervisor } from '../supervisor'
import { MailboxSync } from '../sync'

describe('nextBackoff', () => {
  it('doubles from 5 s and stops at 5 min', () => {
    expect(nextBackoff(0)).toBe(RECONNECT_MIN_MS)
    expect(nextBackoff(RECONNECT_MIN_MS)).toBe(2 * RECONNECT_MIN_MS)
    expect(nextBackoff(RECONNECT_MAX_MS)).toBe(RECONNECT_MAX_MS)
  })
})

const WORKSPACE = 'ws-1' as WorkspaceUuid
const OWNER = 'owner-1' as AccountUuid
const CONNECTION = {
  provider: 'other' as const, authKind: 'password' as const, email: 'linh@example.vn', username: 'linh@example.vn',
  imap: { host: 'imap.example.vn', port: 993, security: 'tls' as const },
  smtp: { host: 'smtp.example.vn', port: 465, security: 'tls' as const }
}
const SECRET = { kind: 'password' as const, password: 'app-pass' }

async function newVault (): Promise<Vault> {
  const keys = parseVaultKeys(`k1:${randomBytes(32).toString('base64')}`)
  const vault = new Vault(new FakeKeyValueClient(), keys)
  await vault.save(WORKSPACE, OWNER, CONNECTION, SECRET)
  return vault
}

function fakeStorage (): StorageAdapter {
  const notImplemented = (): never => { throw new Error('not used by these tests') }
  return {
    initialize: notImplemented, close: notImplemented, exists: notImplemented, make: notImplemented, delete: notImplemented,
    listBuckets: notImplemented, remove: notImplemented, listStream: notImplemented, stat: notImplemented, get: notImplemented,
    put: notImplemented, read: notImplemented, partial: notImplemented, getUrl: notImplemented
  }
}

async function seedReadyAccount (space: string): Promise<FakeMailCards> {
  const cards = new FakeMailCards()
  await cards.createAccount(CONNECTION.email, {
    mailEmail: CONNECTION.email, mailDisplayName: '', mailProvider: 'other', mailAuthKind: 'password', mailStatus: 'ready',
    mailLastError: '', mailBackfillDone: 0, mailBackfillTotal: 0, mailLastSyncAt: 0
  })
  mockCardsBySpace.set(space, cards)
  return cards
}

async function seedFolder (cards: FakeMailCards, uidValidity: number): Promise<void> {
  const account = await cards.findAccount()
  if (account === undefined) throw new Error('seed the account first')
  await cards.createFolder('INBOX', {
    mailAccount: account._id, mailPath: 'INBOX', mailRole: 'inbox', mailUidValidity: uidValidity, mailHighestModSeq: '', mailUnread: 0, mailTotal: 0
  })
}

describe('MailSupervisor concurrency', () => {
  let supervisor: MailSupervisor

  beforeEach(() => {
    mockImapFlows.length = 0
    mockCardsBySpace.clear()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    // Sessions register a poll and a body-fetch setInterval; leaving them running would hang the test process.
    await supervisor.stopAll()
  })

  it('joins two overlapping start() calls for the same key into one session', async () => {
    const space = mailboxSpaceId(OWNER)
    await seedReadyAccount(space)
    const vault = await newVault()
    const loadSpy = jest.spyOn(vault, 'load')
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await Promise.all([supervisor.start(WORKSPACE, OWNER), supervisor.start(WORKSPACE, OWNER)])

    // Both calls resolved through the same in-flight promise, so vault.load and openImap each ran exactly once.
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(mockImapFlows).toHaveLength(1)
  })

  it('starts only mailboxes whose workspace is still active', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await supervisor.startAll(new Set())
    expect(mockImapFlows).toHaveLength(0)

    await supervisor.startAll(new Set([WORKSPACE]))
    expect(mockImapFlows).toHaveLength(1)
  })

  it('does not let a superseded session\'s close handler evict its replacement', async () => {
    const space = mailboxSpaceId(OWNER)
    await seedReadyAccount(space)
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await supervisor.start(WORKSPACE, OWNER)
    const staleImap = mockImapFlows[0]
    await supervisor.stop(WORKSPACE, OWNER)
    // A fresh session for the same key replaces the one that just stopped.
    await supervisor.start(WORKSPACE, OWNER)
    const currentImap = mockImapFlows[1]
    const currentLogout = jest.spyOn(currentImap, 'logout')

    // A late 'close' from the first (already-stopped) socket must not touch the session that replaced it.
    staleImap.emit('close')

    await supervisor.stop(WORKSPACE, OWNER)
    expect(currentLogout).toHaveBeenCalledTimes(1)
  })

  it('applies a change made by the mailbox owner', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    await supervisor.handleTx(WORKSPACE, readChange(OWNER_SOCIAL_ID))

    expect(mockSync.applyChange).toHaveBeenCalledWith('m1', { mailIsRead: true })
  })

  it('ignores a change another workspace member wrote into the owner\'s mailbox', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    const ctx = new MeasureMetricsContext('test', {})
    const warn = jest.spyOn(ctx, 'warn').mockImplementation(() => {})
    supervisor = new MailSupervisor(ctx, await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    await supervisor.handleTx(WORKSPACE, readChange('social-intruder' as PersonId))

    expect(mockSync.applyChange).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('mail change by non-owner dropped', expect.objectContaining({ modifiedBy: 'social-intruder' }))
  })

  it('drops the session and closes the socket when start fails after connecting', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    mockSync.watchInbox.mockRejectedValueOnce(new Error('Mailbox has no inbox folder'))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await expect(supervisor.start(WORKSPACE, OWNER)).rejects.toThrow('Mailbox has no inbox folder')

    expect(mockImapFlows[0].isClosed).toBe(true)
    expect(mockSync.stopWatching).toHaveBeenCalledTimes(1)
    expect((await cards.findAccount())?.mailStatus).toBe('offline')
    expect(await supervisor.send({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, 'd1')).toEqual({ error: 'not_connected' })
  })

  it('closes the logged-in socket when a step between connect and registering the session throws', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    jest.mocked(MailboxSync).mockImplementationOnce(() => { throw new Error('sync setup failed') })
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await expect(supervisor.start(WORKSPACE, OWNER)).rejects.toThrow('sync setup failed')

    expect(mockImapFlows).toHaveLength(1)
    expect(mockImapFlows[0].isClosed).toBe(true)
    expect(mockSync.stopWatching).not.toHaveBeenCalled()
    expect((await cards.findAccount())?.mailStatus).toBe('offline')
  })

  it('opens no socket when the workspace lookup fails', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    mockGetWorkspaceInfo.mockRejectedValueOnce(new Error('account service down'))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await expect(supervisor.start(WORKSPACE, OWNER)).rejects.toThrow('account service down')

    expect(mockImapFlows).toHaveLength(0)
  })

  it('keeps the original start error when marking the account offline also fails', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    mockSync.watchInbox.mockRejectedValueOnce(new Error('Mailbox has no inbox folder'))
    jest.spyOn(cards, 'updateAccount').mockRejectedValue(new Error('transactor down'))
    const ctx = new MeasureMetricsContext('test', {})
    const warn = jest.spyOn(ctx, 'warn').mockImplementation(() => {})
    supervisor = new MailSupervisor(ctx, await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await expect(supervisor.start(WORKSPACE, OWNER)).rejects.toThrow('Mailbox has no inbox folder')

    expect(mockImapFlows[0].isClosed).toBe(true)
    expect(warn).toHaveBeenCalledWith('mail status update failed', expect.objectContaining({ error: 'transactor down' }))
  })

  it('flags an owner with no social ids once instead of treating every change as an intruder', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    mockTransactor.findOne.mockResolvedValueOnce(undefined)
    const ctx = new MeasureMetricsContext('test', {})
    const warn = jest.spyOn(ctx, 'warn').mockImplementation(() => {})
    supervisor = new MailSupervisor(ctx, await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    expect(warn).toHaveBeenCalledWith('mail owner has no social ids', { workspace: WORKSPACE, owner: OWNER })
    expect((await cards.findAccount())?.mailLastError).not.toBe('')

    await supervisor.handleTx(WORKSPACE, readChange(OWNER_SOCIAL_ID))
    expect(mockSync.applyChange).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('mail change dropped: owner has no social ids', expect.objectContaining({ modifiedBy: OWNER_SOCIAL_ID }))
  })

  it('backfills while any folder has never been synced, whatever the account status says', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    await seedFolder(cards, 0)
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    expect(mockSync.backfill).toHaveBeenCalledTimes(1)
    expect(mockSync.pollAll).not.toHaveBeenCalled()
  })

  it('catches up instead of backfilling once every folder has been synced', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    await seedFolder(cards, 7)
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    expect(mockSync.pollAll).toHaveBeenCalledTimes(1)
    expect(mockSync.backfill).not.toHaveBeenCalled()
  })

  it('reports not_connected when saving a draft without a session', async () => {
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await expect(supervisor.saveDraft({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, 'd1')).resolves.toEqual({ error: 'not_connected' })
  })

  it('reports not_found when the draft id does not resolve to a message', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const saved = await supervisor.saveDraft({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, 'missing-draft')

    expect(saved).toEqual({ error: 'not_found' })
    expect(mockSync.saveDraft).not.toHaveBeenCalled()
  })

  it('saves a found draft to the provider', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const draftId = await cards.createMessage('Nháp', {
      mailThread: 'thread' as Ref<MailThreadCard>, mailMessageId: '', mailInReplyTo: '', mailReferences: [], mailFrom: 'linh@example.vn', mailTo: [], mailCc: [], mailBcc: [],
      mailSentAt: 0, mailSnippet: '', mailIsRead: true, mailIsStarred: false, mailIsDraft: true, mailLocations: [], mailFolders: [],
      mailProviderMessageId: '', mailBodyBlob: '', mailRawBlob: '', mailHasAttachments: false, mailTargetFolder: null, mailIsDeleted: false
    })
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const saved = await supervisor.saveDraft({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, draftId)

    expect(saved).toEqual({ isOk: true })
    const draft = (await cards.findMessages({ _id: draftId }))[0]
    expect(mockSync.saveDraft).toHaveBeenCalledWith(draft, expect.anything())
  })

  it('reports not_connected when fetching a body without a session', async () => {
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await expect(supervisor.fetchBody({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, 'm1')).resolves.toEqual({ error: 'not_connected' })
  })

  it('reports not_found when the message id is outside the mailbox', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const fetched = await supervisor.fetchBody({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, 'missing-message')

    expect(fetched).toEqual({ error: 'not_found' })
    expect(mockBodies.fetchOne).not.toHaveBeenCalled()
  })

  it('fetches an unfetched message body on demand', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const messageId = await cards.createMessage('Báo giá', {
      mailThread: 'thread' as Ref<MailThreadCard>, mailMessageId: '<m@x>', mailInReplyTo: '', mailReferences: [], mailFrom: 'khach@example.vn', mailTo: [], mailCc: [], mailBcc: [],
      mailSentAt: 1000, mailSnippet: '', mailIsRead: true, mailIsStarred: false, mailIsDraft: false, mailLocations: [], mailFolders: [],
      mailProviderMessageId: '', mailBodyBlob: '', mailRawBlob: '', mailHasAttachments: false, mailTargetFolder: null, mailIsDeleted: false
    })
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const fetched = await supervisor.fetchBody({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, messageId)

    expect(fetched).toEqual({ isOk: true })
    const message = (await cards.findMessages({ _id: messageId }))[0]
    expect(mockBodies.fetchOne).toHaveBeenCalledWith(message)
  })

  it('fetches the body of a draft synced from the provider', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const draftId = await cards.createMessage('Nháp', {
      mailThread: 'thread' as Ref<MailThreadCard>, mailMessageId: '<d@x>', mailInReplyTo: '', mailReferences: [], mailFrom: 'me@example.vn', mailTo: [], mailCc: [], mailBcc: [],
      mailSentAt: 1000, mailSnippet: '', mailIsRead: true, mailIsStarred: false, mailIsDraft: true, mailLocations: [], mailFolders: [],
      mailProviderMessageId: '', mailBodyBlob: '', mailRawBlob: '', mailHasAttachments: false, mailTargetFolder: null, mailIsDeleted: false
    })
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const fetched = await supervisor.fetchBody({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, draftId)

    expect(fetched).toEqual({ isOk: true })
    expect(mockBodies.fetchOne).toHaveBeenCalled()
  })

  it('leaves the account out of ready when disconnecting with keep-mail', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    await supervisor.disconnect({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, false)

    const account = await cards.findAccount()
    expect(account).not.toBeUndefined()
    expect(account?.mailStatus).not.toBe('ready')
    expect(account?.mailStatus).toBe('auth-error')
    expect(await vault.load(WORKSPACE, OWNER)).toBeUndefined()
  })

  it('queues the purge and hides the mailbox instead of deleting inline', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    await seedFolder(cards, 1)
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    await supervisor.disconnect({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, true)

    expect(mockPurge.enqueue).toHaveBeenCalledWith({ workspace: WORKSPACE, owner: OWNER })
    expect((await cards.findAccount())?.mailStatus).toBe('removing')
    expect(cards.folders).toHaveLength(1)
    expect(await vault.load(WORKSPACE, OWNER)).toBeUndefined()
  })

  it('leaves the mailbox as it was when the purge cannot be queued', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    mockPurge.enqueue.mockRejectedValueOnce(new Error('kvs down'))

    await expect(supervisor.disconnect({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, true)).rejects.toThrow('kvs down')

    expect((await cards.findAccount())?.mailStatus).toBe('ready')
  })

  it('does not start a session for a mailbox that is being removed', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const account = await cards.findAccount()
    if (account === undefined) throw new Error('test setup: account missing')
    await cards.updateAccount(account._id, { mailStatus: 'removing' })
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    await supervisor.start(WORKSPACE, OWNER)

    expect(mockImapFlows).toHaveLength(0)
  })

  it('waits for a start still connecting before disconnect stops the session', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    const starting = supervisor.start(WORKSPACE, OWNER)
    await supervisor.disconnect({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, false)
    await starting

    expect(mockImapFlows).toHaveLength(1)
    expect(mockImapFlows[0].isClosed).toBe(true)
  })

  it('removes the stored password even when logout fails', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)
    mockLogout.mockRejectedValueOnce(new Error('socket hang up'))

    await expect(supervisor.disconnect({ workspace: WORKSPACE, account: OWNER, role: AccountRole.User }, false)).rejects.toThrow('socket hang up')

    expect(await vault.load(WORKSPACE, OWNER)).toBeUndefined()
    expect(mockImapFlows[0].isClosed).toBe(true)
  })
})

function readChange (modifiedBy: PersonId): ReturnType<TxFactory['createTxUpdateDoc']> {
  return new TxFactory(modifiedBy).createTxUpdateDoc(MAIL_MESSAGE_CLASS, mailboxSpaceId(OWNER), 'm1' as Ref<MailMessageCard>, { mailIsRead: true })
}

const CALLER = { workspace: WORKSPACE, account: OWNER, role: AccountRole.User }
const RECONNECT_REQUEST = {
  provider: 'other' as const, email: CONNECTION.email, username: CONNECTION.username, password: 'new-app-pass',
  imap: CONNECTION.imap, smtp: CONNECTION.smtp
}

describe('MailSupervisor reconnect', () => {
  let supervisor: MailSupervisor

  beforeEach(() => {
    mockImapFlows.length = 0
    mockCardsBySpace.clear()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await supervisor.stopAll()
  })

  it('tests the new login, replaces the vault secret, clears the error, and restarts the session', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const readyAccount = await cards.findAccount()
    if (readyAccount === undefined) throw new Error('test setup: account missing')
    await cards.updateAccount(readyAccount._id, { mailStatus: 'auth-error', mailLastError: 'bad password' })
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)
    const staleImap = mockImapFlows[0]
    const startSpy = jest.spyOn(supervisor, 'start')

    const result = await supervisor.reconnect(CALLER, RECONNECT_REQUEST)

    expect(result).toEqual({ account: readyAccount._id })
    expect(mockTestImapLogin).toHaveBeenCalledTimes(1)
    expect(mockTestSmtpLogin).toHaveBeenCalledTimes(1)
    expect(staleImap.isClosed).toBe(true)
    expect(await vault.load(WORKSPACE, OWNER)).toEqual({
      connection: expect.objectContaining({ email: CONNECTION.email, username: CONNECTION.username }),
      secret: { kind: 'password', password: 'new-app-pass' }
    })
    const account = await cards.findAccount()
    expect(account?.mailStatus).toBe('connecting')
    expect(account?.mailLastError).toBe('')
    expect(startSpy).toHaveBeenCalledWith(WORKSPACE, OWNER)
  })

  it('leaves the vault secret and account untouched when the new password is wrong', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)
    const stopSpy = jest.spyOn(supervisor, 'stop')
    mockTestImapLogin.mockResolvedValueOnce({ isOk: false, reason: 'auth', detail: 'Invalid credentials' })

    const result = await supervisor.reconnect(CALLER, RECONNECT_REQUEST)

    expect(result).toEqual({ isOk: false, reason: 'auth', detail: 'Invalid credentials' })
    expect(mockTestSmtpLogin).not.toHaveBeenCalled()
    expect(stopSpy).not.toHaveBeenCalled()
    expect(await vault.load(WORKSPACE, OWNER)).toEqual({ connection: CONNECTION, secret: SECRET })
    expect((await cards.findAccount())?.mailStatus).toBe('ready')
  })

  it('accepts a reconnect email that differs only by case', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const vault = await newVault()
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), vault, fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const result = await supervisor.reconnect(CALLER, { ...RECONNECT_REQUEST, email: CONNECTION.email.toUpperCase() })

    expect(mockTestImapLogin).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ account: (await cards.findAccount())?._id })
  })

  it('refuses a reconnect whose email does not match the account, without testing the login', async () => {
    await seedReadyAccount(mailboxSpaceId(OWNER))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await supervisor.start(WORKSPACE, OWNER)

    const result = await supervisor.reconnect(CALLER, { ...RECONNECT_REQUEST, email: 'someone-else@example.vn', username: 'someone-else@example.vn' })

    expect(result).toEqual({ error: 'mailbox_mismatch' })
    expect(mockTestImapLogin).not.toHaveBeenCalled()
  })

  it('refuses a reconnect while the old mail is still being removed, without testing the login', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    const account = await cards.findAccount()
    if (account === undefined) throw new Error('test setup: account missing')
    await cards.updateAccount(account._id, { mailStatus: 'removing' })
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    expect(await supervisor.reconnect(CALLER, RECONNECT_REQUEST)).toEqual({ error: 'removing' })
    expect(mockTestImapLogin).not.toHaveBeenCalled()
  })

  it('reports not_found when the caller has no mailbox to reconnect', async () => {
    mockCardsBySpace.set(mailboxSpaceId(OWNER), new FakeMailCards())
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await newVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)

    const result = await supervisor.reconnect(CALLER, RECONNECT_REQUEST)

    expect(result).toEqual({ error: 'not_found' })
    expect(mockTestImapLogin).not.toHaveBeenCalled()
  })
})

describe('MailSupervisor oauth', () => {
  const google = { clientId: 'cid', clientSecret: 'csecret' }
  const OAUTH_CONNECTION = { ...CONNECTION, provider: 'gmail' as const, authKind: 'oauth' as const }
  let supervisor: MailSupervisor

  beforeEach(() => {
    mockImapFlows.length = 0
    mockCardsBySpace.clear()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await supervisor.stopAll()
  })

  async function oauthVault (): Promise<Vault> {
    const vault = new Vault(new FakeKeyValueClient(), parseVaultKeys(`k1:${randomBytes(32).toString('base64')}`))
    await vault.save(WORKSPACE, OWNER, OAUTH_CONNECTION, { kind: 'oauth', refreshToken: 'rt' })
    return vault
  }

  it('logs IMAP in with a fresh access token and hands SMTP the refresh token', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await oauthVault(), fakeStorage(), 'servone-mail-test', google, createWorkspaceClients('servone-mail-test'), mockPurge)

    const logins = await supervisor.logins(OAUTH_CONNECTION, { kind: 'oauth', refreshToken: 'rt' })

    expect(logins.imap.auth).toEqual({ accessToken: 'at' })
    expect(logins.smtp.auth).toEqual({ type: 'OAuth2', clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rt' })
  })

  it('refuses an oauth mailbox when no Google client is configured', async () => {
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await oauthVault(), fakeStorage(), 'servone-mail-test', undefined, createWorkspaceClients('servone-mail-test'), mockPurge)
    await expect(supervisor.logins(OAUTH_CONNECTION, { kind: 'oauth', refreshToken: 'rt' })).rejects.toThrow('MAIL_GOOGLE_CREDENTIALS')
  })

  it('marks the account auth-error without opening IMAP when the refresh token is revoked', async () => {
    const cards = await seedReadyAccount(mailboxSpaceId(OWNER))
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }))
    supervisor = new MailSupervisor(new MeasureMetricsContext('test', {}), await oauthVault(), fakeStorage(), 'servone-mail-test', google, createWorkspaceClients('servone-mail-test'), mockPurge)

    await supervisor.start(WORKSPACE, OWNER)

    expect(mockImapFlows).toHaveLength(0)
    expect((await cards.findAccount())?.mailStatus).toBe('auth-error')
  })
})
