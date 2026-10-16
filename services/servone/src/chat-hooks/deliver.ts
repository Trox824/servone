import type { Tx, WorkspaceUuid } from '@hcengineering/core'
import { deliveryIdFor } from '../outgoing/dispatcher'
import { type ChatEventName, readChatEvent } from './events'
import { acceptsAuthor, wantsEvent } from './filters'
import { buildChatPayload } from './payload'
import { type ChatLinks, type ChatReader, resolveChatEvent } from './resolve'
import type { StoredChatHook } from './store'

export interface ChatTxDeps {
  enabledHooks: (workspace: WorkspaceUuid) => Promise<StoredChatHook[]>
  reader: (workspace: WorkspaceUuid) => Promise<ChatReader>
  links: (workspace: WorkspaceUuid) => Promise<ChatLinks>
  // Resolves once the delivery is in KVS.
  enqueue: (hook: StoredChatHook, id: string, event: ChatEventName, body: string) => Promise<void>
  warn: (message: string, fields: Record<string, string>) => void
}

// Returns once every delivery is stored; a throw makes the queue retry the tx, so nothing is lost.
export function createChatTxHandler (deps: ChatTxDeps): (workspace: WorkspaceUuid, tx: Tx) => Promise<void> {
  return async (workspace, tx) => {
    const event = readChatEvent(tx)
    if (event === undefined) return
    const hooks = (await deps.enabledHooks(workspace)).filter((hook) => hook.channel === event.channel && wantsEvent(hook, event))
    if (hooks.length === 0) return
    const resolution = await resolveChatEvent(await deps.reader(workspace), event, await deps.links(workspace))
    if ('skipped' in resolution) {
      deps.warn('chat hook event skipped', { workspace, tx: tx._id, reason: resolution.skipped })
      return
    }
    for (const hook of hooks) {
      if (!acceptsAuthor(hook, resolution.author)) continue
      const id = deliveryIdFor(hook.id, tx._id, event.name)
      await deps.enqueue(hook, id, event.name, buildChatPayload(event.name, id, resolution.resolved))
    }
  }
}
