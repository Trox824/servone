import { z } from 'zod'
import type { ApiCall, ChannelImport, Connector, MessageImport, PersonRef, ScopeOption } from '../types'
import { callApi, ConnectorError } from './api'

const API = '/api/v10'
const PAGE_SIZE = 100
const TEXT_CHANNEL_TYPES = new Set([0, 5])
const CATEGORY_TYPE = 4
const IMPORTED_MESSAGE_TYPES = new Set([0, 19])
const FORBIDDEN = 403

const user = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullish()
})

const channel = z.object({
  id: z.string(),
  type: z.number(),
  name: z.string().nullish(),
  parent_id: z.string().nullish(),
  position: z.number().optional(),
  topic: z.string().nullish(),
  thread_metadata: z.object({ archive_timestamp: z.string() }).optional()
})

const message = z.object({
  id: z.string(),
  type: z.number(),
  content: z.string(),
  timestamp: z.string(),
  author: user,
  mentions: z.array(user),
  attachments: z.array(z.object({ filename: z.string(), content_type: z.string().optional() }))
})

const threadList = z.object({ threads: z.array(channel), has_more: z.boolean().optional() })

type DiscordChannel = z.infer<typeof channel>
type DiscordMessage = z.infer<typeof message>

async function get<T> (api: ApiCall, path: string, query: Array<[string, string]>, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  return schema.parse(await callApi(api, { method: 'GET', path, query }, signal))
}

async function guildChannels (api: ApiCall, signal: AbortSignal): Promise<DiscordChannel[]> {
  return await get(api, `${API}/guilds/{guild}/channels`, [], z.array(channel), signal)
}

async function allMessages (api: ApiCall, channelId: string, signal: AbortSignal, onPage: (count: number) => void): Promise<DiscordMessage[]> {
  const messages: DiscordMessage[] = []
  let query: Array<[string, string]> = [['limit', String(PAGE_SIZE)]]
  while (true) {
    const page = await get(api, `${API}/channels/${channelId}/messages`, query, z.array(message), signal)
    messages.push(...page)
    onPage(messages.length)
    if (page.length < PAGE_SIZE) return messages.reverse()
    query = [['limit', String(PAGE_SIZE)], ['before', page[page.length - 1].id]]
  }
}

async function archivedThreads (api: ApiCall, channelId: string, signal: AbortSignal): Promise<DiscordChannel[]> {
  const threads: DiscordChannel[] = []
  let query: Array<[string, string]> = [['limit', String(PAGE_SIZE)]]
  while (true) {
    const page = await get(api, `${API}/channels/${channelId}/threads/archived/public`, query, threadList, signal)
    threads.push(...page.threads)
    const last = page.threads[page.threads.length - 1]?.thread_metadata?.archive_timestamp
    if (page.has_more !== true || last === undefined) return threads
    query = [['limit', String(PAGE_SIZE)], ['before', last]]
  }
}

function author (discordUser: z.infer<typeof user>): PersonRef {
  return { name: discordUser.global_name ?? discordUser.username }
}

function messageText (discordMessage: DiscordMessage, channelNames: Map<string, string>): string {
  const names = new Map(discordMessage.mentions.map((mentioned) => [mentioned.id, author(mentioned).name]))
  const content = discordMessage.content
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${names.get(id) ?? 'unknown'}`)
    .replace(/<#(\d+)>/g, (_, id: string) => `#${channelNames.get(id) ?? 'unknown'}`)
    .replace(/<a?(:\w+:)\d+>/g, '$1')
  const files = discordMessage.attachments.map((attached) =>
    attached.content_type?.startsWith('image/') === true ? `[image: ${attached.filename}]` : `[file: ${attached.filename}]`
  )
  return [content, ...files].filter((part) => part !== '').join('\n')
}

export const discordConnector: Connector = {
  async listScopes (api) {
    const channels = await guildChannels(api, new AbortController().signal)
    const categories = new Map(channels.filter((candidate) => candidate.type === CATEGORY_TYPE).map((category) => [category.id, category.name ?? '']))
    return channels
      .filter((candidate) => TEXT_CHANNEL_TYPES.has(candidate.type))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((textChannel): ScopeOption => ({
        id: textChannel.id,
        name: textChannel.name ?? textChannel.id,
        kind: 'channel',
        parentName: textChannel.parent_id == null ? undefined : categories.get(textChannel.parent_id),
        isSelected: true
      }))
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const allChannels = await guildChannels(api, signal)
    const channelNames = new Map(allChannels.map((candidate) => [candidate.id, candidate.name ?? candidate.id]))
    const selected = new Set(scopeIds)
    const active = await get(api, `${API}/guilds/{guild}/threads/active`, [], threadList, signal)

    let skippedFiles = 0
    const unreadable: string[] = []
    const channels: ChannelImport[] = []
    for (const textChannel of allChannels.filter((candidate) => selected.has(candidate.id))) {
      const name = textChannel.name ?? textChannel.id
      const authors = new Map<string, PersonRef>()
      const toMessage = (discordMessage: DiscordMessage, threadKey?: string): MessageImport => {
        skippedFiles += discordMessage.attachments.length
        authors.set(discordMessage.author.id, author(discordMessage.author))
        const text = messageText(discordMessage, channelNames)
        return { key: discordMessage.id, threadKey, author: author(discordMessage.author), date: Date.parse(discordMessage.timestamp), text }
      }
      try {
        const progress = (count: number): void => { onProgress({ label: name, count }) }
        const imported = (await allMessages(api, textChannel.id, signal, progress))
          .filter((discordMessage) => IMPORTED_MESSAGE_TYPES.has(discordMessage.type))
          .map((discordMessage) => toMessage(discordMessage))
        const keys = new Set(imported.map((channelMessage) => channelMessage.key))
        const threads = [
          ...active.threads.filter((thread) => thread.parent_id === textChannel.id),
          ...(await archivedThreads(api, textChannel.id, signal))
        ]
        for (const thread of threads) {
          const replies = (await allMessages(api, thread.id, signal, (count) => { progress(imported.length + count) }))
            .filter((discordMessage) => IMPORTED_MESSAGE_TYPES.has(discordMessage.type))
          if (replies.length === 0) continue
          const rootKey = keys.has(thread.id) ? thread.id : replies[0].id
          imported.push(...replies.map((reply) => toMessage(reply, reply.id === rootKey ? undefined : rootKey)))
        }
        channels.push({
          name,
          topic: textChannel.topic ?? '',
          isPrivate: false,
          isArchived: false,
          members: [...authors.values()],
          messages: imported.sort((a, b) => a.date - b.date)
        })
      } catch (error) {
        if (!(error instanceof ConnectorError) || error.status !== FORBIDDEN) throw error
        unreadable.push(`#${name}`)
      }
    }

    const warnings: string[] = []
    if (unreadable.length > 0) warnings.push(`Skipped channels the bot can't read: ${unreadable.join(', ')}`)
    if (skippedFiles > 0) warnings.push(`${skippedFiles} attached files were not imported`)
    return { projects: [], channels, teamspaces: [], warnings }
  }
}
