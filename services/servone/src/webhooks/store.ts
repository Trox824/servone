// hulykvs layout, namespace `servone-webhooks`:
//   hook/<id>                    StoredHook
//   chan/<workspace>/<channel>/<id>  index entry for listing a channel's hooks
//   log/<id>                     CallRecord[], newest first
//   thread/<id>/<sha256(key)>    StoredThread
import type { Channel, ChatMessage } from '@hcengineering/chunter'
import type { AccountUuid, Ref, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import { createHash } from 'crypto'

export const KVS_NAMESPACE = 'servone-webhooks'
export const MAX_LOG_ENTRIES = 100
const DAY_MS = 24 * 60 * 60 * 1000
export const THREAD_TTL_MS = 30 * DAY_MS

export interface StoredHook {
  id: string
  workspace: WorkspaceUuid
  channel: Ref<Channel>
  name: string
  secretHash: string
  createdBy: AccountUuid
  createdOn: number
  revokedOn?: number
  allowMentions?: boolean
}

export interface CallRecord {
  at: number
  status: number
  // Set on the entry that stands for several rate-limited calls.
  count?: number
}

interface StoredThread {
  messageId: Ref<ChatMessage>
  expiresOn: number
}

const hookKey = (id: string): string => `hook/${id}`
const logKey = (id: string): string => `log/${id}`
const channelPrefix = (workspace: WorkspaceUuid, channel: Ref<Channel>): string => `chan/${workspace}/${channel}/`
// Hashed so any sender-chosen key is a safe, bounded KVS key.
const THREAD_PREFIX = 'thread/'
const threadStoreKey = (hookId: string, key: string): string =>
  `${THREAD_PREFIX}${hookId}/${createHash('sha256').update(key).digest('hex')}`

export class HookStore {
  constructor (private readonly kv: KeyValueClient) {}

  async getHook (id: string): Promise<StoredHook | undefined> {
    return (await this.kv.getValue<StoredHook>(hookKey(id))) ?? undefined
  }

  async saveHook (hook: StoredHook): Promise<void> {
    await this.kv.setValue(hookKey(hook.id), hook)
    await this.kv.setValue(`${channelPrefix(hook.workspace, hook.channel)}${hook.id}`, hook.createdOn)
  }

  async listChannelHooks (workspace: WorkspaceUuid, channel: Ref<Channel>): Promise<StoredHook[]> {
    const prefix = channelPrefix(workspace, channel)
    const listed = await this.kv.listKeys(prefix)
    const ids = (listed?.keys ?? []).map((key) => key.slice(key.lastIndexOf('/') + 1))
    const hooks = await Promise.all(ids.map(async (id) => await this.getHook(id)))
    return hooks
      .filter((hook): hook is StoredHook => hook !== undefined)
      .sort((a, b) => b.createdOn - a.createdOn)
  }

  async revokeHook (hook: StoredHook, now: number): Promise<StoredHook> {
    if (hook.revokedOn !== undefined) return hook
    const revoked = { ...hook, revokedOn: now }
    await this.kv.setValue(hookKey(hook.id), revoked)
    return revoked
  }

  // Re-read so a revoke that landed after the caller's read is never overwritten.
  async setAllowMentions (id: string, isAllowed: boolean): Promise<StoredHook | undefined> {
    const current = await this.getHook(id)
    if (current === undefined || current.revokedOn !== undefined) return current
    const updated = { ...current, allowMentions: isAllowed }
    await this.kv.setValue(hookKey(id), updated)
    return updated
  }

  async readLog (id: string): Promise<CallRecord[]> {
    return (await this.kv.getValue<CallRecord[]>(logKey(id))) ?? []
  }

  // Read-modify-write without a lock: two calls landing together may lose one entry, which the rate limit keeps rare.
  async appendLog (id: string, call: CallRecord): Promise<void> {
    const log = await this.readLog(id)
    await this.kv.setValue(logKey(id), [call, ...log].slice(0, MAX_LOG_ENTRIES))
  }

  async findThread (hookId: string, key: string, now: number): Promise<Ref<ChatMessage> | undefined> {
    const storeKey = threadStoreKey(hookId, key)
    const thread = await this.kv.getValue<StoredThread>(storeKey)
    if (thread === null) return undefined
    if (thread.expiresOn > now) return thread.messageId
    await this.kv.deleteKey(storeKey)
    return undefined
  }

  async saveThread (hookId: string, key: string, messageId: Ref<ChatMessage>, now: number): Promise<void> {
    const thread: StoredThread = { messageId, expiresOn: now + THREAD_TTL_MS }
    await this.kv.setValue(threadStoreKey(hookId, key), thread)
  }

  // Senders often use a fresh thread_key per run (build-412), so most entries are never looked up again.
  async sweepExpiredThreads (now: number): Promise<void> {
    const listed = await this.kv.listKeys(THREAD_PREFIX)
    for (const key of listed?.keys ?? []) {
      const thread = await this.kv.getValue<StoredThread>(key)
      if (thread !== null && thread.expiresOn > now) continue
      await this.kv.deleteKey(key)
    }
  }
}
