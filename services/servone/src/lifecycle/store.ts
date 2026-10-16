import type { WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import { createHash } from 'crypto'
import type { StoredInvite } from './plan'

export const KVS_NAMESPACE = 'servone-lifecycle'
const INVITE_ID_CHARS = 32

export interface DoneRecord {
  outcome: 'sent' | 'skipped'
  at: number
}

export const inviteIdOf = (email: string): string => createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, INVITE_ID_CHARS)

export class LifecycleStore {
  constructor (private readonly kv: KeyValueClient) {}

  async enabledSince (now: number): Promise<number> {
    const stored = await this.kv.getValue<number>('since')
    if (stored !== null) return stored
    await this.kv.setValue('since', now)
    return now
  }

  async isDone (workspace: WorkspaceUuid, step: string): Promise<boolean> {
    return (await this.kv.getValue<DoneRecord>(`done/${workspace}/${step}`)) !== null
  }

  async markDone (workspace: WorkspaceUuid, step: string, record: DoneRecord): Promise<void> {
    await this.kv.setValue(`done/${workspace}/${step}`, record)
  }

  async release (workspace: WorkspaceUuid, step: string): Promise<void> {
    await this.kv.deleteKey(`done/${workspace}/${step}`)
  }

  async recordInvite (workspace: WorkspaceUuid, email: string, at: number): Promise<void> {
    const id = inviteIdOf(email)
    const key = `invite/${workspace}/${id}`
    if ((await this.kv.getValue<StoredInvite>(key)) !== null) return
    await this.kv.setValue(key, { id, email: email.toLowerCase(), at } satisfies StoredInvite)
  }

  async listInvites (workspace: WorkspaceUuid): Promise<StoredInvite[]> {
    const listed = await this.kv.listKeys(`invite/${workspace}/`)
    const stored = await Promise.all((listed?.keys ?? []).map(async (key) => await this.kv.getValue<StoredInvite>(key)))
    return stored.filter((invite): invite is StoredInvite => invite !== null)
  }
}
