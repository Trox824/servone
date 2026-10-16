import type { RestClient } from '@hcengineering/api-client'
import chunter, { type ChatMessage, type ChunterSpace, type DirectMessage } from '@hcengineering/chunter'
import core, { type AccountUuid, type Class, type Data, generateId, type Markup, type Ref, TxFactory } from '@hcengineering/core'
import type { BotIdentity } from '../webhooks/bot'
import { findOpenChannel, type WebhookMessage } from '../webhooks/post'
import type { PostTarget } from './run'

interface SpaceRef {
  _id: Ref<ChunterSpace>
  _class: Ref<Class<ChunterSpace>>
}

export function pickDirect (
  directs: ReadonlyArray<Pick<DirectMessage, '_id' | 'members'>>,
  bot: AccountUuid,
  runner: AccountUuid
): Ref<DirectMessage> | undefined {
  return directs.find((direct) => direct.members.length === 2 && direct.members.includes(bot) && direct.members.includes(runner))?._id
}

// The webhook name attribute makes the message show "/deploy" as its poster, like an incoming webhook's name.
async function createMessage (client: RestClient, botTx: TxFactory, space: SpaceRef, commandName: string, message: Markup): Promise<void> {
  const attributes: Data<WebhookMessage> = {
    message,
    attachments: 0,
    attachedTo: space._id,
    attachedToClass: space._class,
    collection: 'messages',
    servoneWebhookName: `/${commandName}`
  }
  await client.tx(
    botTx.createTxCollectionCUD(
      space._class,
      space._id,
      space._id,
      'messages',
      botTx.createTxCreateDoc<ChatMessage>(chunter.class.ChatMessage, space._id, attributes, generateId<ChatMessage>())
    )
  )
}

async function directWith (client: RestClient, botTx: TxFactory, bot: BotIdentity, runner: AccountUuid): Promise<Ref<DirectMessage>> {
  const directs = await client.findAll(chunter.class.DirectMessage, { members: bot.account })
  const existing = pickDirect(directs, bot.account, runner)
  if (existing !== undefined) return existing
  const id = generateId<DirectMessage>()
  await client.tx(
    botTx.createTxCreateDoc<DirectMessage>(
      chunter.class.DirectMessage,
      core.space.Space,
      { name: '', description: '', private: true, archived: false, members: [bot.account, runner] },
      id
    )
  )
  return id
}

export async function postToTarget (
  client: RestClient,
  bot: BotIdentity,
  target: PostTarget,
  commandName: string,
  message: Markup
): Promise<boolean> {
  const botTx = new TxFactory(bot.primarySocialId)
  if (target.kind === 'channel') {
    const channel = await findOpenChannel(client, target.channel)
    if (channel === undefined) return false
    await createMessage(client, botTx, channel, commandName, message)
    return true
  }
  const direct = await directWith(client, botTx, bot, target.account)
  await createMessage(client, botTx, { _id: direct, _class: chunter.class.DirectMessage }, commandName, message)
  return true
}
