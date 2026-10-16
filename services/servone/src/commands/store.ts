// hulykvs layout, namespace `servone-chat-commands`:
//   cmd/<workspace>/<id>     StoredCommand
//   resp/<sha256(token)>     StoredResponseUrl, removed once expired or used up
import type { Channel } from '@hcengineering/chunter'
import type { AccountUuid, Ref, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import type { SealedSecret } from '../seal'
import { hashSecret } from '../webhooks/secret'

export const KVS_NAMESPACE = 'servone-chat-commands'
export const MAX_COMMANDS_PER_WORKSPACE = 50
// Slack's response_url rule: 30 minutes, 5 uses.
export const RESPONSE_URL_TTL_MS = 30 * 60_000
export const RESPONSE_URL_MAX_USES = 5

export interface StoredCommand {
  id: string
  workspace: WorkspaceUuid
  name: string
  description: string
  usage: string
  url: string
  sealedSecret: SealedSecret
  createdBy: AccountUuid
  createdOn: number
}

export interface StoredResponseUrl {
  workspace: WorkspaceUuid
  commandId: string
  commandName: string
  channel: Ref<Channel>
  runner: AccountUuid
  runnerName: string
  expiresOn: number
  uses: number
}

export type ResponseUse = { isAllowed: true, response: StoredResponseUrl } | { isAllowed: false }

const commandPrefix = (workspace: WorkspaceUuid): string => `cmd/${workspace}/`
const commandKey = (workspace: WorkspaceUuid, id: string): string => `${commandPrefix(workspace)}${id}`
const RESPONSE_PREFIX = 'resp/'
// Hashed so a KVS dump holds no usable response URL.
const responseKey = (token: string): string => `${RESPONSE_PREFIX}${hashSecret(token)}`

export class CommandStore {
  constructor (private readonly kv: KeyValueClient) {}

  async getCommand (workspace: WorkspaceUuid, id: string): Promise<StoredCommand | undefined> {
    return (await this.kv.getValue<StoredCommand>(commandKey(workspace, id))) ?? undefined
  }

  async listCommands (workspace: WorkspaceUuid): Promise<StoredCommand[]> {
    const listed = await this.kv.listKeys(commandPrefix(workspace))
    const commands = await Promise.all(
      (listed?.keys ?? []).map(async (key) => (await this.kv.getValue<StoredCommand>(key)) ?? undefined)
    )
    return commands
      .filter((command): command is StoredCommand => command !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async findByName (workspace: WorkspaceUuid, name: string): Promise<StoredCommand | undefined> {
    return (await this.listCommands(workspace)).find((command) => command.name === name)
  }

  async saveCommand (command: StoredCommand): Promise<void> {
    await this.kv.setValue(commandKey(command.workspace, command.id), command)
  }

  async deleteCommand (workspace: WorkspaceUuid, id: string): Promise<void> {
    await this.kv.deleteKey(commandKey(workspace, id))
  }

  async saveResponseUrl (token: string, response: StoredResponseUrl): Promise<void> {
    await this.kv.setValue(responseKey(token), response)
  }

  // Read-modify-write without a lock: two answers landing together may both take the last use, which is harmless.
  async useResponseUrl (token: string, now: number): Promise<ResponseUse> {
    const key = responseKey(token)
    const stored = await this.kv.getValue<StoredResponseUrl>(key)
    if (stored === null) return { isAllowed: false }
    if (stored.expiresOn <= now) {
      await this.kv.deleteKey(key)
      return { isAllowed: false }
    }
    const used = { ...stored, uses: stored.uses + 1 }
    if (used.uses >= RESPONSE_URL_MAX_USES) await this.kv.deleteKey(key)
    else await this.kv.setValue(key, used)
    return { isAllowed: true, response: used }
  }

  // Most runs never use their response URL, so expired entries are swept rather than found on read.
  async sweepExpiredResponseUrls (now: number): Promise<void> {
    const listed = await this.kv.listKeys(RESPONSE_PREFIX)
    for (const key of listed?.keys ?? []) {
      const stored = await this.kv.getValue<StoredResponseUrl>(key)
      if (stored !== null && stored.expiresOn > now) continue
      await this.kv.deleteKey(key)
    }
  }
}
