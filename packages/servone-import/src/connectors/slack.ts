import { z } from 'zod'
import { firstText, slackConverter, slackMessage, slackPerson, type SlackUser } from '../slack'
import type { ApiCall, ChannelImport, Connector, MessageImport, ScopeOption } from '../types'
import { callApi } from './api'

const PAGE_LIMIT = '200'
const LIST_LIMIT = '1000'
const SKIPPABLE_ERRORS = new Set(['not_in_channel', 'missing_scope', 'channel_not_found', 'access_denied'])

const envelope = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  response_metadata: z.object({ next_cursor: z.string().optional() }).optional()
})

const slackUser = z.object({
  id: z.string(),
  name: z.string(),
  real_name: z.string().optional(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
  profile: z.object({ email: z.string().optional(), real_name: z.string().optional(), display_name: z.string().optional() }).optional()
})

const slackChannel = z.object({
  id: z.string(),
  name: z.string(),
  is_private: z.boolean().optional(),
  is_archived: z.boolean().optional(),
  is_member: z.boolean().optional(),
  topic: z.object({ value: z.string() }).optional(),
  purpose: z.object({ value: z.string() }).optional()
})

const slackMessageSchema = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  user: z.string().optional(),
  text: z.string().optional(),
  ts: z.string(),
  thread_ts: z.string().optional(),
  reply_count: z.number().optional(),
  user_profile: z.object({ real_name: z.string().optional(), display_name: z.string().optional() }).optional(),
  files: z.array(z.object({ name: z.string().optional(), title: z.string().optional() })).optional(),
  bot_id: z.string().optional(),
  username: z.string().optional(),
  bot_profile: z.object({ name: z.string().optional() }).optional()
})

const usersPage = z.object({ members: z.array(slackUser) })
const channelsPage = z.object({ channels: z.array(slackChannel) })
const messagesPage = z.object({ messages: z.array(slackMessageSchema) })
const membersPage = z.object({ members: z.array(z.string()) })

type SlackChannel = z.infer<typeof slackChannel>
type SlackMessage = z.infer<typeof slackMessageSchema>

export class SlackApiError extends Error {
  constructor (readonly code: string, readonly method: string) {
    super(`Slack ${method} failed: ${code}`)
  }
}

async function listAll<T> (
  api: ApiCall,
  method: string,
  query: Array<[string, string]>,
  page: z.ZodType<T>,
  signal: AbortSignal
): Promise<T[]> {
  const pages: T[] = []
  let cursor = ''
  do {
    const body = await callApi(api, { method: 'GET', path: `/api/${method}`, query: cursor === '' ? query : [...query, ['cursor', cursor]] }, signal)
    const meta = envelope.parse(body)
    if (!meta.ok) throw new SlackApiError(meta.error ?? 'unknown_error', method)
    pages.push(page.parse(body))
    cursor = meta.response_metadata?.next_cursor ?? ''
  } while (cursor !== '')
  return pages
}

async function listChannels (api: ApiCall, signal: AbortSignal): Promise<SlackChannel[]> {
  const query: Array<[string, string]> = [['types', 'public_channel,private_channel'], ['exclude_archived', 'false'], ['limit', LIST_LIMIT]]
  const pages = await listAll(api, 'conversations.list', query, channelsPage, signal)
  return pages.flatMap((page) => page.channels)
}

export const slackConnector: Connector = {
  async listScopes (api) {
    const channels = await listChannels(api, new AbortController().signal)
    return channels.map((channel): ScopeOption => ({
      id: channel.id,
      name: channel.name,
      kind: 'channel',
      parentName: channel.is_private === true ? 'Private channels' : 'Public channels',
      isSelected: channel.is_archived !== true && channel.is_member === true
    }))
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const userPages = await listAll(api, 'users.list', [['limit', LIST_LIMIT]], usersPage, signal)
    const users = new Map<string, SlackUser>(userPages.flatMap((page) => page.members).map((user) => [user.id, user]))
    const allChannels = await listChannels(api, signal)
    const convert = slackConverter(users, new Map(allChannels.map((channel) => [channel.id, channel.name])))
    const selected = new Set(scopeIds)

    let skippedFiles = 0
    const unreadable: string[] = []
    const channels: ChannelImport[] = []
    for (const channel of allChannels.filter((candidate) => selected.has(candidate.id))) {
      const byKey = new Map<string, MessageImport>()
      const add = (message: SlackMessage): void => {
        const converted = slackMessage(message, users, convert)
        if (converted === undefined || byKey.has(converted.key)) return
        skippedFiles += message.files?.length ?? 0
        byKey.set(converted.key, converted)
      }
      try {
        const history = await listAll(api, 'conversations.history', [['channel', channel.id], ['limit', PAGE_LIMIT]], messagesPage, signal)
        for (const message of history.flatMap((page) => page.messages)) {
          add(message)
          if ((message.reply_count ?? 0) > 0) {
            const replies = await listAll(api, 'conversations.replies', [['channel', channel.id], ['ts', message.ts], ['limit', PAGE_LIMIT]], messagesPage, signal)
            replies.flatMap((page) => page.messages).forEach(add)
          }
          onProgress({ label: channel.name, count: byKey.size })
        }
        const memberPages = await listAll(api, 'conversations.members', [['channel', channel.id], ['limit', LIST_LIMIT]], membersPage, signal)
        channels.push({
          name: channel.name,
          topic: convert(firstText(channel.topic?.value, channel.purpose?.value)),
          isPrivate: channel.is_private ?? false,
          isArchived: channel.is_archived ?? false,
          members: memberPages
            .flatMap((page) => page.members)
            .map((id) => users.get(id))
            .filter((user): user is SlackUser => user !== undefined)
            .map(slackPerson),
          messages: [...byKey.values()].sort((a, b) => (a.date !== b.date ? a.date - b.date : a.key.localeCompare(b.key)))
        })
      } catch (error) {
        if (!(error instanceof SlackApiError) || !SKIPPABLE_ERRORS.has(error.code)) throw error
        unreadable.push(`#${channel.name}`)
      }
    }

    const warnings: string[] = []
    if (unreadable.length > 0) warnings.push(`Skipped channels the app can't read (join them first): ${unreadable.join(', ')}`)
    if (skippedFiles > 0) warnings.push(`${skippedFiles} attached files were not imported`)
    return { projects: [], channels, teamspaces: [], warnings }
  }
}
