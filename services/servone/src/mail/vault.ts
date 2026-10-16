import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import type { AuthKind, ProviderId, ServerEndpoint } from '@servone/mail'
import { parseSealKeys, seal, type SealedSecret, type SealKeys, unseal } from '../seal'

export const VAULT_NAMESPACE = 'servone-mail'

export class VaultError extends Error {
  constructor (message: string) {
    super(message)
    Object.setPrototypeOf(this, VaultError.prototype)
  }
}

export function parseVaultKeys (text: string): SealKeys {
  return parseSealKeys(text, 'MAIL_VAULT_KEYS')
}

export type MailSecret = { kind: 'password', password: string } | { kind: 'oauth', refreshToken: string }

export interface MailConnection {
  provider: ProviderId
  authKind: AuthKind
  email: string
  username: string
  imap: ServerEndpoint
  smtp: ServerEndpoint
}

interface VaultEntry {
  connection: MailConnection
  sealed: SealedSecret
}

function parseSecret (json: string): MailSecret {
  const parsed: { kind?: string, password?: string, refreshToken?: string } = JSON.parse(json)
  if (parsed.kind === 'password' && typeof parsed.password === 'string') return { kind: 'password', password: parsed.password }
  if (parsed.kind === 'oauth' && typeof parsed.refreshToken === 'string') return { kind: 'oauth', refreshToken: parsed.refreshToken }
  throw new VaultError('Vault secret has an unknown shape')
}

const entryKey = (workspace: WorkspaceUuid, owner: AccountUuid): string => `vault/${workspace}/${owner}`
const aadOf = (workspace: WorkspaceUuid, owner: AccountUuid): string => `${workspace}:${owner}`

export class Vault {
  constructor (private readonly kv: KeyValueClient, private readonly keys: SealKeys) {}

  async save (workspace: WorkspaceUuid, owner: AccountUuid, connection: MailConnection, secret: MailSecret): Promise<void> {
    const entry: VaultEntry = { connection, sealed: seal(this.keys, aadOf(workspace, owner), JSON.stringify(secret)) }
    await this.kv.setValue(entryKey(workspace, owner), entry)
  }

  async load (workspace: WorkspaceUuid, owner: AccountUuid): Promise<{ connection: MailConnection, secret: MailSecret } | undefined> {
    const entry = await this.kv.getValue<VaultEntry>(entryKey(workspace, owner))
    if (entry === null) return undefined
    return { connection: entry.connection, secret: parseSecret(unseal(this.keys, aadOf(workspace, owner), entry.sealed)) }
  }

  async remove (workspace: WorkspaceUuid, owner: AccountUuid): Promise<void> {
    await this.kv.deleteKey(entryKey(workspace, owner))
  }

  async listConnected (): Promise<Array<{ workspace: WorkspaceUuid, owner: AccountUuid }>> {
    const listed = await this.kv.listKeys('vault/')
    return (listed?.keys ?? []).flatMap((key) => {
      const [, workspace, owner] = key.split('/')
      return workspace !== undefined && owner !== undefined ? [{ workspace: workspace as WorkspaceUuid, owner: owner as AccountUuid }] : []
    })
  }
}
