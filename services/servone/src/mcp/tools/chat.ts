import chunter, { type Channel, type ChatMessage, type DirectMessage } from '@hcengineering/chunter'
import contact, { formatName } from '@hcengineering/contact'
import { type AccountUuid, SortingOrder } from '@hcengineering/core'
import { jsonToMarkup, markupToText } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import { z } from 'zod'

import { type AnyTool, capText, defineTool, ToolInputError } from '../tool'
import type { WorkspaceSession } from '../types'
import { namesBySocialId } from './people'

// Keep agent posts reviewable by a human; the UI itself has no hard limit.
const MAX_MESSAGE_CHARS = 10_000
const MAX_READ_MESSAGES = 100
const MAX_CHANNEL_SUGGESTIONS = 10

type Conversation = { kind: 'channel', channel: Channel } | { kind: 'direct', direct: DirectMessage }

export function formatTimestamp (timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')
}

export function oneLine (text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export async function directTitles (
  session: WorkspaceSession,
  directs: DirectMessage[]
): Promise<Map<DirectMessage['_id'], string>> {
  const me = session.account.uuid
  const others = [...new Set(directs.flatMap((direct) => direct.members))].filter((member) => member !== me)
  const employees =
    others.length === 0 ? [] : await session.client.findAll(contact.mixin.Employee, { personUuid: { $in: others } })
  const nameByAccount = new Map<AccountUuid, string>()
  for (const employee of employees) {
    if (employee.personUuid !== undefined) nameByAccount.set(employee.personUuid, formatName(employee.name))
  }
  return new Map(
    directs.map((direct) => {
      const names = direct.members
        .filter((member) => member !== me)
        .map((member) => nameByAccount.get(member) ?? 'unknown member')
      return [direct._id, names.length === 0 ? 'DM with yourself' : `DM with ${names.join(', ')}`]
    })
  )
}

function suggestChannels (channels: Channel[], wanted: string, me: AccountUuid): string {
  const mine = channels
    .filter((channel) => channel.members.includes(me) && !channel.archived)
    .map((channel) => channel.name)
    .sort()
  const needle = wanted.toLowerCase()
  const close = mine.filter((name) => name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase()))
  const shown = (close.length > 0 ? close : mine).slice(0, MAX_CHANNEL_SUGGESTIONS)
  return shown.length === 0 ? 'You are not a member of any channel' : `Your channels: ${shown.map((name) => `#${name}`).join(', ')}`
}

async function resolveConversation (session: WorkspaceSession, raw: string): Promise<Conversation> {
  const wanted = raw.trim().replace(/^#/, '')
  const channels = await session.client.findAll(chunter.class.Channel, {})
  const channel = channels.find(
    (candidate) => candidate._id === wanted || candidate.name.toLowerCase() === wanted.toLowerCase()
  )
  if (channel !== undefined) return { kind: 'channel', channel }
  const directs = await session.client.findAll(chunter.class.DirectMessage, { members: session.account.uuid })
  const direct = directs.find((candidate) => candidate._id === wanted)
  if (direct !== undefined) return { kind: 'direct', direct }
  throw new ToolInputError(`Channel #${wanted} not found. ${suggestChannels(channels, wanted, session.account.uuid)}`)
}

function conversationSpace (conversation: Conversation): Channel | DirectMessage {
  return conversation.kind === 'channel' ? conversation.channel : conversation.direct
}

const listChannels = defineTool({
  name: 'list_channels',
  title: 'List chat channels',
  description:
    'List the chat channels the current user is a member of (archived channels excluded), one per line as "#name  topic". ' +
    'With includeDirect=true also lists direct-message conversations as "DM with Name, Name  id: <id>"; ' +
    'pass that id as `channel` to read_channel or post_message.',
  input: z.object({
    includeDirect: z.boolean().default(false).describe('Also list direct-message conversations')
  }),
  annotations: { readOnlyHint: true },
  run: async (session, { includeDirect }) => {
    const channels = await session.client.findAll(
      chunter.class.Channel,
      { members: session.account.uuid, archived: false },
      { sort: { name: SortingOrder.Ascending } }
    )
    const lines = channels.map((channel) =>
      channel.topic === undefined || channel.topic === '' ? `#${channel.name}` : `#${channel.name}  ${oneLine(channel.topic)}`
    )
    if (includeDirect) {
      const directs = await session.client.findAll(chunter.class.DirectMessage, {
        members: session.account.uuid,
        archived: false
      })
      const titles = await directTitles(session, directs)
      for (const direct of directs) lines.push(`${titles.get(direct._id) ?? 'DM'}  id: ${direct._id}`)
    }
    return lines.length === 0 ? 'You are not a member of any channel' : capText(lines.join('\n'))
  }
})

const readChannel = defineTool({
  name: 'read_channel',
  title: 'Read chat channel',
  description:
    'Read the latest messages of a chat channel or direct-message conversation. ' +
    '`channel` is a channel name (with or without "#", case-insensitive) or a DM id from list_channels. ' +
    'Returns up to `limit` most recent top-level messages, oldest first, one per line as "YYYY-MM-DD HH:mm Author: text" (UTC). ' +
    'Thread replies are not included.',
  input: z.object({
    channel: z.string().min(1).describe('Channel name like "general" or "#general", or a DM id'),
    limit: z.number().int().min(1).max(MAX_READ_MESSAGES).default(30)
  }),
  annotations: { readOnlyHint: true },
  run: async (session, { channel, limit }) => {
    const space = conversationSpace(await resolveConversation(session, channel))
    const newestFirst = await session.client.findAll(
      chunter.class.ChatMessage,
      { attachedTo: space._id },
      { sort: { createdOn: SortingOrder.Descending }, limit }
    )
    if (newestFirst.length === 0) return 'No messages yet'
    const messages = [...newestFirst].reverse()
    const authors = await namesBySocialId(session, [
      ...new Set(messages.map((message) => message.createdBy ?? message.modifiedBy))
    ])
    const lines = messages.map((message) => {
      const author = message.createdBy ?? message.modifiedBy
      const time = formatTimestamp(message.createdOn ?? message.modifiedOn)
      return `${time} ${authors.get(author) ?? 'Unknown'}: ${oneLine(markupToText(message.message))}`
    })
    return capText(lines.join('\n'))
  }
})

const postMessage = defineTool({
  name: 'post_message',
  title: 'Post chat message',
  description:
    'Post a message as the current user to a chat channel or direct-message conversation. ' +
    '`channel` is a channel name (with or without "#") or a DM id from list_channels. ' +
    '`text` is Markdown. Fails if the user is not a member of the channel or the channel is archived. ' +
    'Returns "Posted to #name".',
  input: z.object({
    channel: z.string().min(1).describe('Channel name like "general" or "#general", or a DM id'),
    text: z.string().min(1).max(MAX_MESSAGE_CHARS).describe('Message body in Markdown')
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  run: async (session, { channel, text }) => {
    const conversation = await resolveConversation(session, channel)
    if (conversation.kind === 'channel') {
      if (!conversation.channel.members.includes(session.account.uuid)) {
        throw new ToolInputError(`You are not a member of #${conversation.channel.name}`)
      }
      if (conversation.channel.archived) throw new ToolInputError(`#${conversation.channel.name} is archived`)
    }
    const space = conversationSpace(conversation)
    await session.client.addCollection<Channel | DirectMessage, ChatMessage>(
      chunter.class.ChatMessage,
      space._id,
      space._id,
      space._class,
      'messages',
      { message: jsonToMarkup(markdownToMarkup(text)) }
    )
    return conversation.kind === 'channel' ? `Posted to #${conversation.channel.name}` : 'Posted to direct message'
  }
})

export const chatTools: AnyTool[] = [listChannels, readChannel, postMessage]
