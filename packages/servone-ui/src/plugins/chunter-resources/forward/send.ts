import chunter, { type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import type { Class, Ref, Space } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'

import { buildForwardMarkup } from './markup'
import { FORWARDED_FROM_ATTR, type ForwardedFrom } from './origin'
import { resolveDestination, type ForwardTarget } from './targets'

interface ForwardedMessage extends ChatMessage {
  [FORWARDED_FROM_ATTR]?: ForwardedFrom
}

const forwardedClass: Ref<Class<ForwardedMessage>> = chunter.class.ChatMessage

function isThreadReply (message: ChatMessage): message is ThreadMessage {
  return getClient().getHierarchy().isDerived(message._class, chunter.class.ThreadMessage)
}

function originOf (message: ChatMessage): ForwardedFrom {
  const channel = isThreadReply(message)
    ? { channelId: message.objectId, channelClass: message.objectClass }
    : { channelId: message.attachedTo, channelClass: message.attachedToClass }
  return {
    messageId: message._id,
    messageClass: message._class,
    ...channel,
    author: message.createdBy ?? message.modifiedBy,
    createdOn: message.createdOn ?? message.modifiedOn
  }
}

export async function forwardMessage (message: ChatMessage, target: ForwardTarget, note: string): Promise<void> {
  const destination = await resolveDestination(target)
  await getClient().addCollection(
    forwardedClass,
    destination._id as Ref<Space>,
    destination._id,
    destination._class,
    'messages',
    {
      message: buildForwardMarkup(message.message, note),
      attachments: 0,
      [FORWARDED_FROM_ATTR]: originOf(message)
    }
  )
}
