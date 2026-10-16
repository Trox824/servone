import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'
import { randomBytes } from 'crypto'
import { seal, SealError } from '../../seal'
import { parseVaultKeys, Vault, VaultError } from '../vault'

const WORKSPACE = 'ws-1' as WorkspaceUuid
const OWNER = 'acc-1' as AccountUuid
const CONNECTION = {
  provider: 'other' as const, authKind: 'password' as const, email: 'linh@example.vn', username: 'linh@example.vn',
  imap: { host: 'imap.example.vn', port: 993, security: 'tls' as const },
  smtp: { host: 'smtp.example.vn', port: 465, security: 'tls' as const }
}

// Sealed by the vault's own AES-GCM code before it moved to ../seal; mailboxes saved then must still open.
const LEGACY_KEYS = 'k1:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
const LEGACY_SEALED = {
  keyId: 'k1',
  iv: 'cWXiYR0OAYYN1t21',
  tag: 'HvHici7ZMh6gQh+Oic1uUA==',
  data: 'r8ySNzFbYyxV0RbiXMR7+Yv/j+3iUAAv5nnN9oQ79DKZvpxPXyn518YXu7yyfjUM8MPRzA=='
}

class FakeKeyValueClient implements KeyValueClient {
  private readonly store = new Map<string, unknown>()
  async setValue<T> (key: string, value: T): Promise<void> { this.store.set(key, value) }
  async getValue<T> (key: string): Promise<T | null> { return (this.store.get(key) as T | undefined) ?? null }
  async deleteKey (key: string): Promise<void> { this.store.delete(key) }
  async listKeys (prefix?: string): Promise<ListResult | null> {
    const keys = [...this.store.keys()].filter((key) => prefix === undefined || key.startsWith(prefix))
    return { keys, count: keys.length, namespace: 'test' }
  }
}

describe('Vault', () => {
  it('opens a mailbox sealed before the shared seal module', async () => {
    const kv = new FakeKeyValueClient()
    await kv.setValue(`vault/${WORKSPACE}/${OWNER}`, { connection: CONNECTION, sealed: LEGACY_SEALED })
    const loaded = await new Vault(kv, parseVaultKeys(LEGACY_KEYS)).load(WORKSPACE, OWNER)
    expect(loaded).toEqual({ connection: CONNECTION, secret: { kind: 'password', password: 'abcd efgh ijkl mnop' } })
  })

  it('round-trips a saved mailbox', async () => {
    const vault = new Vault(new FakeKeyValueClient(), parseVaultKeys(`a:${randomBytes(32).toString('base64')}`))
    await vault.save(WORKSPACE, OWNER, CONNECTION, { kind: 'oauth', refreshToken: 'refresh-1' })
    expect(await vault.load(WORKSPACE, OWNER)).toEqual({ connection: CONNECTION, secret: { kind: 'oauth', refreshToken: 'refresh-1' } })
    expect(await vault.listConnected()).toEqual([{ workspace: WORKSPACE, owner: OWNER }])
  })

  it('refuses a record moved to another account', async () => {
    const kv = new FakeKeyValueClient()
    await kv.setValue(`vault/${WORKSPACE}/acc-2`, { connection: CONNECTION, sealed: LEGACY_SEALED })
    await expect(new Vault(kv, parseVaultKeys(LEGACY_KEYS)).load(WORKSPACE, 'acc-2' as AccountUuid)).rejects.toThrow(SealError)
  })

  it('refuses a secret with an unknown shape', async () => {
    const keys = parseVaultKeys(`a:${randomBytes(32).toString('base64')}`)
    const kv = new FakeKeyValueClient()
    await kv.setValue(`vault/${WORKSPACE}/${OWNER}`, { connection: CONNECTION, sealed: seal(keys, `${WORKSPACE}:${OWNER}`, '{"kind":"token"}') })
    await expect(new Vault(kv, keys).load(WORKSPACE, OWNER)).rejects.toThrow(VaultError)
  })

  it('names MAIL_VAULT_KEYS when a key is not 32 bytes', () => {
    expect(() => parseVaultKeys(`a:${randomBytes(16).toString('base64')}`)).toThrow('MAIL_VAULT_KEYS')
  })
})
