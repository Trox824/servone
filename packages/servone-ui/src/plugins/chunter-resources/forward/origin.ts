import type { Class, Doc, PersonId, Ref, Timestamp } from '@hcengineering/core'

export const FORWARDED_FROM_ATTR = 'servoneForwardedFrom'

export interface ForwardedFrom {
  messageId: Ref<Doc>
  messageClass: Ref<Class<Doc>>
  channelId: Ref<Doc>
  channelClass: Ref<Class<Doc>>
  author: PersonId
  createdOn: Timestamp
}

interface StoredOrigin {
  messageId?: unknown
  messageClass?: unknown
  channelId?: unknown
  channelClass?: unknown
  author?: unknown
  createdOn?: unknown
}

export function readForwardedFrom (message: Doc): ForwardedFrom | undefined {
  const stored = FORWARDED_FROM_ATTR in message ? message[FORWARDED_FROM_ATTR] : undefined
  if (typeof stored !== 'object' || stored === null) return undefined
  const origin: StoredOrigin = stored
  const { messageId, messageClass, channelId, channelClass, author, createdOn } = origin
  if (
    typeof messageId !== 'string' ||
    typeof messageClass !== 'string' ||
    typeof channelId !== 'string' ||
    typeof channelClass !== 'string' ||
    typeof author !== 'string'
  ) {
    return undefined
  }
  return {
    messageId: messageId as Ref<Doc>,
    messageClass: messageClass as Ref<Class<Doc>>,
    channelId: channelId as Ref<Doc>,
    channelClass: channelClass as Ref<Class<Doc>>,
    author: author as PersonId,
    createdOn: typeof createdOn === 'number' ? createdOn : 0
  }
}
