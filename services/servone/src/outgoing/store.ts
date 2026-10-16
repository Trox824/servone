// hulykvs layout, one namespace per kind of hook:
//   hook/<hookId>                                 the stored hook
//   <owner prefix>/<workspace>/<owner>/<hookId>   createdOn, index for listing one owner's hooks
//   delivery/<deliveryId>                         PendingDelivery, removed once delivered or failed
//   due/<nextAttemptAt, 13 digits>/<id>           '', schedule index sorted by time
//   log/<hookId>                                  AttemptRecord[], newest first
import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import type { SealedSecret } from '../seal'
import type { SendError } from './send'

export const MAX_LOG_ENTRIES = 50
// Millisecond timestamps have 13 digits until the year 2286, so due keys sort by time as strings.
const DUE_TIME_DIGITS = 13

export interface OutgoingHook<E extends string = string> {
  id: string
  workspace: WorkspaceUuid
  url: string
  events: E[]
  sealedSecret: SealedSecret
  createdBy: AccountUuid
  createdOn: number
  consecutiveFailures: number
  disabledOn?: number
  disabledReason?: 'failures' | 'manual'
}

export type HookEvent<H extends OutgoingHook> = H['events'][number]
export type DeliveryEvent<E extends string = string> = E | 'test'

export interface PendingDelivery<E extends string = string> {
  id: string
  hook: string
  event: DeliveryEvent<E>
  // Built once at enqueue and sent byte for byte on every attempt.
  body: string
  // Number of the next attempt, from 1.
  attempt: number
  firstAttemptAt: number
  nextAttemptAt: number
}

export type LogError = SendError | 'expired' | 'hook_turned_off' | 'dropped'

export interface AttemptRecord<E extends string = string> {
  at: number
  deliveryId: string
  event: DeliveryEvent<E>
  attempt: number
  status: number
  error?: LogError
  durationMs: number
  responseStart: string
  // Set on 'dropped' lines only: events refused because the hook's backlog was full.
  dropped?: number
}

export interface DueEntry {
  at: number
  id: string
}

// The prefix is part of stored keys: tracker hooks keep `proj`, so existing data stays readable.
export interface OwnerIndex<H extends OutgoingHook> {
  prefix: string
  ownerOf: (hook: H) => string
}

const hookKey = (id: string): string => `hook/${id}`
const logKey = (id: string): string => `log/${id}`
const deliveryKey = (id: string): string => `delivery/${id}`
const dueKey = (delivery: PendingDelivery): string =>
  `due/${String(delivery.nextAttemptAt).padStart(DUE_TIME_DIGITS, '0')}/${delivery.id}`
const lastSegment = (key: string): string => key.slice(key.lastIndexOf('/') + 1)

export class OutgoingHookStore<H extends OutgoingHook> {
  constructor (
    private readonly kv: KeyValueClient,
    private readonly owners: OwnerIndex<H>
  ) {}

  async getHook (id: string): Promise<H | undefined> {
    return (await this.kv.getValue<H>(hookKey(id))) ?? undefined
  }

  async saveHook (hook: H): Promise<void> {
    await this.kv.setValue(hookKey(hook.id), hook)
    await this.kv.setValue(`${this.ownerPrefix(hook.workspace, this.owners.ownerOf(hook))}${hook.id}`, hook.createdOn)
  }

  async deleteHook (hook: H): Promise<void> {
    for (const delivery of await this.listHookDeliveries(hook.id)) await this.removeDelivery(delivery)
    await this.kv.deleteKey(`${this.ownerPrefix(hook.workspace, this.owners.ownerOf(hook))}${hook.id}`)
    await this.kv.deleteKey(logKey(hook.id))
    await this.kv.deleteKey(hookKey(hook.id))
  }

  async listOwnerHooks (workspace: WorkspaceUuid, owner: string): Promise<H[]> {
    const hooks = await this.hooksByIndex(this.ownerPrefix(workspace, owner))
    return hooks.sort((a, b) => b.createdOn - a.createdOn)
  }

  async listAllHooks (): Promise<H[]> {
    return await this.hooksByIndex(`${this.owners.prefix}/`)
  }

  async readLog (id: string): Promise<Array<AttemptRecord<HookEvent<H>>>> {
    return (await this.kv.getValue<Array<AttemptRecord<HookEvent<H>>>>(logKey(id))) ?? []
  }

  // Read-modify-write without a lock: the dispatcher runs one write per hook at a time.
  async appendLog (id: string, record: AttemptRecord<HookEvent<H>>): Promise<void> {
    const log = await this.readLog(id)
    await this.kv.setValue(logKey(id), [record, ...log].slice(0, MAX_LOG_ENTRIES))
  }

  async getDelivery (id: string): Promise<PendingDelivery<HookEvent<H>> | undefined> {
    return (await this.kv.getValue<PendingDelivery<HookEvent<H>>>(deliveryKey(id))) ?? undefined
  }

  // The delivery goes first: a crash between the two writes leaves no due key pointing at nothing.
  async saveDelivery (delivery: PendingDelivery<HookEvent<H>>): Promise<void> {
    await this.kv.setValue(deliveryKey(delivery.id), delivery)
    await this.kv.setValue(dueKey(delivery), '')
  }

  async moveDelivery (previous: PendingDelivery<HookEvent<H>>, next: PendingDelivery<HookEvent<H>>): Promise<void> {
    await this.saveDelivery(next)
    if (dueKey(previous) !== dueKey(next)) await this.kv.deleteKey(dueKey(previous))
  }

  async removeDelivery (delivery: PendingDelivery<HookEvent<H>>): Promise<void> {
    await this.kv.deleteKey(dueKey(delivery))
    await this.kv.deleteKey(deliveryKey(delivery.id))
  }

  async listDue (): Promise<DueEntry[]> {
    const listed = await this.kv.listKeys('due/')
    return (listed?.keys ?? [])
      .map((key) => {
        const [, at, id] = key.split('/')
        return { at: Number(at), id }
      })
      .sort((a, b) => a.at - b.at)
  }

  async listHookDeliveries (hookId: string): Promise<Array<PendingDelivery<HookEvent<H>>>> {
    const due = await this.listDue()
    const deliveries = await Promise.all(due.map(async (entry) => await this.getDelivery(entry.id)))
    return deliveries.filter((delivery): delivery is PendingDelivery<HookEvent<H>> => delivery?.hook === hookId)
  }

  private ownerPrefix (workspace: WorkspaceUuid, owner: string): string {
    return `${this.owners.prefix}/${workspace}/${owner}/`
  }

  private async hooksByIndex (prefix: string): Promise<H[]> {
    const listed = await this.kv.listKeys(prefix)
    const found = await Promise.all((listed?.keys ?? []).map(async (key) => await this.getHook(lastSegment(key))))
    // A filter type guard cannot narrow Awaited<H> back to H, so the hooks are collected by hand.
    const hooks: H[] = []
    for (const hook of found) if (hook !== undefined) hooks.push(hook)
    return hooks
  }
}
