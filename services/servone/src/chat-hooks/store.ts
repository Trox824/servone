import type { Channel } from '@hcengineering/chunter'
import type { Ref } from '@hcengineering/core'
import type { OutgoingHook, OutgoingHookStore, OwnerIndex } from '../outgoing/store'
import type { ChatEventName } from './events'

export const KVS_NAMESPACE = 'servone-chat-hooks'

export interface StoredChatHook extends OutgoingHook<ChatEventName> {
  channel: Ref<Channel>
  mentionsOnly: boolean
  peopleOnly: boolean
  includeIntegrations: boolean
}

export const CHANNEL_INDEX: OwnerIndex<StoredChatHook> = { prefix: 'chan', ownerOf: (hook) => hook.channel }

export type ChatHookStore = OutgoingHookStore<StoredChatHook>
