import chunter, { type Channel, type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, {
  type AttachedDoc,
  type Class,
  type Doc,
  type Markup,
  type PersonId,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import hr from '@hcengineering/hr'
import { markupToJSON, type MarkupNode, MarkupNodeType } from '@hcengineering/text-core'
import type { WebhookMessage } from '../webhooks/post'

export const CHAT_EVENTS = ['message.posted', 'message.updated', 'message.deleted', 'thread.reply', 'reaction.added'] as const
export type ChatEventName = (typeof CHAT_EVENTS)[number]

// @hcengineering/activity is not a dependency of this package, so its class id is spelled out.
export const REACTION_CLASS = 'activity:class:Reaction' as Ref<Class<Doc>>

const MESSAGES_COLLECTION = 'messages'
const REPLIES_COLLECTION = 'replies'
const REACTIONS_COLLECTION = 'reactions'
// Person and @here/@channel references use the person classes; a team mention references its department.
const MENTION_CLASSES: readonly string[] = [contact.class.Person, contact.mixin.Employee, hr.class.Department]

type ChannelReply = ThreadMessage & Pick<WebhookMessage, 'servoneWebhookName'>

interface ReactionDoc extends AttachedDoc {
  emoji: string
  createBy: PersonId
}

export interface ChatEvent {
  name: ChatEventName
  tx: Ref<Tx>
  channel: Ref<Channel>
  message: Ref<ChatMessage>
  messageClass: Ref<Class<ChatMessage>>
  // Known from the tx only for thread.reply; the resolver looks it up for edits and reactions.
  threadParent: Ref<ChatMessage> | null
  // The new text for posted, reply and updated; null for deleted and reaction.added.
  markup: Markup | null
  hasMentions: boolean
  // Posted by an incoming webhook, which stamps its name on the message.
  isIntegration: boolean
  actor: PersonId
  emoji: string | null
  occurredAt: number
}

const isMessageClass = (objectClass: Ref<Class<Doc>> | undefined): objectClass is Ref<Class<ChatMessage>> =>
  objectClass === chunter.class.ChatMessage || objectClass === chunter.class.ThreadMessage

function nodeHasMention (node: MarkupNode): boolean {
  const objectclass = node.attrs?.objectclass
  if (node.type === MarkupNodeType.reference && typeof objectclass === 'string' && MENTION_CLASSES.includes(objectclass)) {
    return true
  }
  return (node.content ?? []).some(nodeHasMention)
}

export function markupHasMentions (markup: Markup): boolean {
  return nodeHasMention(markupToJSON(markup))
}

// Chat messages live in their channel's space.
const channelOf = (tx: TxCUD<Doc>): Ref<Channel> => tx.objectSpace as Ref<Channel>

function created (
  name: ChatEventName,
  create: TxCreateDoc<WebhookMessage> | TxCreateDoc<ChannelReply>,
  threadParent: Ref<ChatMessage> | null
): ChatEvent {
  const { message, servoneWebhookName } = create.attributes
  return {
    name,
    tx: create._id,
    channel: channelOf(create),
    message: create.objectId,
    messageClass: create.objectClass,
    threadParent,
    markup: message,
    hasMentions: markupHasMentions(message),
    isIntegration: servoneWebhookName !== undefined,
    actor: create.modifiedBy,
    emoji: null,
    occurredAt: create.modifiedOn
  }
}

function readCreate (create: TxCreateDoc<Doc>): ChatEvent | undefined {
  if (create.objectClass === chunter.class.ChatMessage) {
    const post = create as TxCreateDoc<WebhookMessage>
    if (post.attachedToClass !== chunter.class.Channel || post.collection !== MESSAGES_COLLECTION) return undefined
    return created('message.posted', post, null)
  }
  if (create.objectClass === chunter.class.ThreadMessage) {
    const reply = create as TxCreateDoc<ChannelReply>
    if (reply.attributes.objectClass !== chunter.class.Channel || reply.collection !== REPLIES_COLLECTION) return undefined
    if (reply.attachedTo === undefined) return undefined
    return created('thread.reply', reply, reply.attachedTo as Ref<ChatMessage>)
  }
  if (create.objectClass === REACTION_CLASS) {
    const reaction = create as TxCreateDoc<ReactionDoc>
    const target = reaction.attachedToClass
    if (reaction.collection !== REACTIONS_COLLECTION || reaction.attachedTo === undefined || !isMessageClass(target)) {
      return undefined
    }
    return {
      name: 'reaction.added',
      tx: reaction._id,
      channel: channelOf(reaction),
      message: reaction.attachedTo as Ref<ChatMessage>,
      messageClass: target,
      threadParent: null,
      markup: null,
      hasMentions: false,
      isIntegration: false,
      actor: reaction.modifiedBy,
      emoji: reaction.attributes.emoji,
      occurredAt: reaction.modifiedOn
    }
  }
  return undefined
}

function readUpdate (update: TxUpdateDoc<ChatMessage>): ChatEvent | undefined {
  if (!isMessageClass(update.objectClass)) return undefined
  const markup = update.operations.message
  if (markup === undefined) return undefined
  return {
    name: 'message.updated',
    tx: update._id,
    channel: channelOf(update),
    message: update.objectId,
    messageClass: update.objectClass,
    threadParent: null,
    markup,
    hasMentions: markupHasMentions(markup),
    isIntegration: false,
    actor: update.modifiedBy,
    emoji: null,
    occurredAt: update.modifiedOn
  }
}

function readRemove (remove: TxRemoveDoc<ChatMessage>): ChatEvent | undefined {
  if (!isMessageClass(remove.objectClass)) return undefined
  return {
    name: 'message.deleted',
    tx: remove._id,
    channel: channelOf(remove),
    message: remove.objectId,
    messageClass: remove.objectClass,
    threadParent: null,
    markup: null,
    hasMentions: false,
    isIntegration: false,
    actor: remove.modifiedBy,
    emoji: null,
    occurredAt: remove.modifiedOn
  }
}

// Updates, removals and reactions carry only the space; a direct message never has a hook, so routing drops them.
export function readChatEvent (tx: Tx): ChatEvent | undefined {
  if (tx._class === core.class.TxCreateDoc) return readCreate(tx as TxCreateDoc<Doc>)
  if (tx._class === core.class.TxUpdateDoc) return readUpdate(tx as TxUpdateDoc<ChatMessage>)
  if (tx._class === core.class.TxRemoveDoc) return readRemove(tx as TxRemoveDoc<ChatMessage>)
  return undefined
}
