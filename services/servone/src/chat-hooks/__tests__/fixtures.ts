import chunter, { type Channel, type ChatMessage, type DirectMessage, type ThreadMessage } from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type AttachedDoc,
  type Markup,
  type PersonId,
  type Ref,
  type TxCreateDoc,
  TxFactory,
  type TxRemoveDoc,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import hr from '@hcengineering/hr'
import { jsonToMarkup, type MarkupNode, MarkupNodeType } from '@hcengineering/text-core'
import type { WebhookMessage } from '../../webhooks/post'
import { REACTION_CLASS } from '../events'
import type { StoredChatHook } from '../store'

export const WORKSPACE = 'ws-1' as WorkspaceUuid
export const CHANNEL = 'channel-backend' as Ref<Channel>
export const DM = 'dm-ana-hung' as Ref<DirectMessage>
export const MESSAGE = 'message-1' as Ref<ChatMessage>
export const REPLY = 'reply-1' as Ref<ThreadMessage>
export const ANA = 'social-ana' as PersonId

export const factory = new TxFactory(ANA)

function paragraphs (nodes: MarkupNode[]): Markup {
  return jsonToMarkup({ type: MarkupNodeType.doc, content: [{ type: MarkupNodeType.paragraph, content: nodes }] })
}

export const text = (plain: string): Markup => paragraphs([{ type: MarkupNodeType.text, text: plain }])

export function mention (objectclass: string, id: string): Markup {
  return paragraphs([
    { type: MarkupNodeType.text, text: 'ping ' },
    { type: MarkupNodeType.reference, attrs: { id, objectclass, label: 'x' } }
  ])
}

export const PERSON_MENTION = mention(contact.class.Person, 'person-ana')
export const TEAM_MENTION = mention(hr.class.Department, 'dept-backend')
export const HERE_MENTION = mention(contact.mixin.Employee, contact.mention.Here)
export const CHANNEL_MENTION = mention(contact.mixin.Employee, contact.mention.Everyone)
export const ISSUE_REFERENCE = mention('tracker:class:Issue', 'issue-1')

export function postMessage (
  message: Markup,
  to: Ref<Channel> | Ref<DirectMessage> = CHANNEL,
  extra: Partial<WebhookMessage> = {}
): TxCreateDoc<WebhookMessage> {
  const attachedToClass = to === DM ? chunter.class.DirectMessage : chunter.class.Channel
  const create = factory.createTxCreateDoc<WebhookMessage>(
    chunter.class.ChatMessage,
    to,
    { message, attachedTo: to, attachedToClass, collection: 'messages', attachments: 0, ...extra },
    MESSAGE,
    1_000
  )
  return { ...create, attachedTo: to, attachedToClass, collection: 'messages' }
}

export function postReply (
  message: Markup,
  objectClass = chunter.class.Channel,
  extra: Pick<WebhookMessage, 'servoneWebhookName'> = {}
): TxCreateDoc<ThreadMessage> {
  const create = factory.createTxCreateDoc<ThreadMessage>(
    chunter.class.ThreadMessage,
    CHANNEL,
    {
      message,
      attachedTo: MESSAGE,
      attachedToClass: chunter.class.ChatMessage,
      collection: 'replies',
      objectId: CHANNEL,
      objectClass,
      ...extra
    },
    REPLY,
    2_000
  )
  return { ...create, attachedTo: MESSAGE, attachedToClass: chunter.class.ChatMessage, collection: 'replies' }
}

export const editMessage = (message: Markup, of = chunter.class.ChatMessage): TxUpdateDoc<ChatMessage> =>
  factory.createTxUpdateDoc<ChatMessage>(of, CHANNEL, of === chunter.class.ThreadMessage ? REPLY : MESSAGE, { message }, false, 3_000)

export const editedOnly = (): TxUpdateDoc<ChatMessage> =>
  factory.createTxUpdateDoc<ChatMessage>(chunter.class.ChatMessage, CHANNEL, MESSAGE, { isPinned: true }, false, 3_000)

export const removeMessage = (of = chunter.class.ChatMessage): TxRemoveDoc<ChatMessage> =>
  factory.createTxRemoveDoc<ChatMessage>(of, CHANNEL, of === chunter.class.ThreadMessage ? REPLY : MESSAGE, 4_000)

interface ReactionDoc extends AttachedDoc {
  emoji: string
  createBy: PersonId
}

export function react (emoji: string, on = chunter.class.ChatMessage): TxCreateDoc<ReactionDoc> {
  const create = factory.createTxCreateDoc<ReactionDoc>(
    REACTION_CLASS,
    CHANNEL,
    { emoji, createBy: ANA, attachedTo: MESSAGE, attachedToClass: on, collection: 'reactions' },
    undefined,
    5_000
  )
  return { ...create, attachedTo: MESSAGE, attachedToClass: on, collection: 'reactions' }
}

export const systemRemove = (): TxRemoveDoc<ChatMessage> =>
  new TxFactory(core.account.System).createTxRemoveDoc<ChatMessage>(chunter.class.ChatMessage, CHANNEL, MESSAGE)

export function storedChatHook (id: string, overrides: Partial<StoredChatHook> = {}): StoredChatHook {
  return {
    id,
    workspace: WORKSPACE,
    channel: CHANNEL,
    url: 'https://hooks.example.com/servone',
    events: ['message.posted'],
    mentionsOnly: false,
    peopleOnly: false,
    includeIntegrations: false,
    sealedSecret: { keyId: 'a', iv: '', tag: '', data: '' },
    createdBy: 'owner' as AccountUuid,
    createdOn: 1,
    consecutiveFailures: 0,
    ...overrides
  }
}
