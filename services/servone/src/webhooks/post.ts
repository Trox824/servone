import type { RestClient } from '@hcengineering/api-client'
import chunter, { type Channel, type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import core, { type Data, generateId, type Markup, type Ref, TxFactory, type Type } from '@hcengineering/core'
import { getEmbeddedLabel } from '@hcengineering/platform'
import type { BotIdentity } from './bot'
import type { MessageColor } from './payload'
import type { StoredHook } from './store'

// Must match the same constants in packages/servone-ui/src/plugins/chunter-resources/webhooks/api.ts.
export const WEBHOOK_NAME_ATTR = 'servoneWebhookName' satisfies keyof WebhookMessage
export const WEBHOOK_COLOR_ATTR = 'servoneWebhookColor' satisfies keyof WebhookMessage
export const WEBHOOK_THREAD_ATTR = 'servoneWebhookThread' satisfies keyof WebhookMessage

export interface WebhookMessage extends ChatMessage {
  servoneWebhookName?: string
  servoneWebhookColor?: string
  servoneWebhookThread?: string
}

type WebhookReply = ThreadMessage & Pick<WebhookMessage, 'servoneWebhookName' | 'servoneWebhookColor'>

export interface OutgoingPost {
  message: Markup
  color: MessageColor | undefined
  replyTo: Ref<ChatMessage> | undefined
  broadcastOf: Ref<ChatMessage> | undefined
}

export type Delivery =
  | { isPosted: true, messageId: Ref<ChatMessage> }
  | { isPosted: false, reason: 'channel_closed' | 'parent_missing' }

const systemTx = new TxFactory(core.account.System)

const WEBHOOK_ATTRIBUTES = [
  { name: WEBHOOK_NAME_ATTR, label: 'Webhook' },
  { name: WEBHOOK_COLOR_ATTR, label: 'Webhook color' },
  { name: WEBHOOK_THREAD_ATTR, label: 'Webhook thread' }
] as const

// The stock transactor never loads a Servone model, so the attributes are created at runtime.
export async function ensureWebhookAttributes (client: RestClient): Promise<void> {
  for (const attribute of WEBHOOK_ATTRIBUTES) {
    const existing = await client.findOne(core.class.Attribute, {
      attributeOf: chunter.class.ChatMessage,
      name: attribute.name
    })
    if (existing !== undefined) continue
    await client.tx(
      systemTx.createTxCreateDoc(core.class.Attribute, core.space.Model, {
        attributeOf: chunter.class.ChatMessage,
        name: attribute.name,
        label: getEmbeddedLabel(attribute.label),
        type: { _class: core.class.TypeString, label: core.string.String } satisfies Type<string>,
        isCustom: true,
        hidden: true
      })
    )
  }
}

export async function findOpenChannel (client: RestClient, channelId: Ref<Channel>): Promise<Channel | undefined> {
  const channel = await client.findOne(chunter.class.Channel, { _id: channelId })
  return channel === undefined || channel.archived ? undefined : channel
}

async function postReply (
  client: RestClient,
  botTx: TxFactory,
  hook: StoredHook,
  channel: Channel,
  parent: ChatMessage,
  post: OutgoingPost
): Promise<Ref<ChatMessage>> {
  const messageId = generateId<ThreadMessage>()
  const attributes: Data<WebhookReply> = {
    message: post.message,
    attachments: 0,
    attachedTo: parent._id,
    attachedToClass: parent._class,
    collection: 'replies',
    objectId: channel._id,
    objectClass: channel._class,
    servoneWebhookName: hook.name
  }
  if (post.color !== undefined) attributes.servoneWebhookColor = post.color
  await client.tx(
    botTx.createTxCollectionCUD(
      parent._class,
      parent._id,
      channel._id,
      'replies',
      botTx.createTxCreateDoc<ThreadMessage>(chunter.class.ThreadMessage, channel._id, attributes, messageId)
    )
  )
  return messageId
}

export async function postMessage (
  client: RestClient,
  bot: BotIdentity,
  hook: StoredHook,
  post: OutgoingPost
): Promise<Delivery> {
  const channel = await findOpenChannel(client, hook.channel)
  if (channel === undefined) return { isPosted: false, reason: 'channel_closed' }
  const botTx = new TxFactory(bot.primarySocialId)

  if (post.replyTo !== undefined) {
    const parent = await client.findOne(chunter.class.ChatMessage, { _id: post.replyTo, attachedTo: channel._id })
    if (parent === undefined) return { isPosted: false, reason: 'parent_missing' }
    return { isPosted: true, messageId: await postReply(client, botTx, hook, channel, parent, post) }
  }

  const messageId = generateId<ChatMessage>()
  const attributes: Data<WebhookMessage> = {
    message: post.message,
    attachments: 0,
    attachedTo: channel._id,
    attachedToClass: channel._class,
    collection: 'messages',
    servoneWebhookName: hook.name
  }
  if (post.color !== undefined) attributes.servoneWebhookColor = post.color
  if (post.broadcastOf !== undefined) attributes.servoneWebhookThread = post.broadcastOf
  await client.tx(
    botTx.createTxCollectionCUD(
      channel._class,
      channel._id,
      channel._id,
      'messages',
      botTx.createTxCreateDoc<ChatMessage>(chunter.class.ChatMessage, channel._id, attributes, messageId)
    )
  )
  return { isPosted: true, messageId }
}
