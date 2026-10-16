import type { ChannelImport, ExportFile, ImportBundle, MessageImport, PersonRef } from './types'
import { decodeText, readZip } from './zip'

export interface SlackUser {
  id: string
  name: string
  real_name?: string
  deleted?: boolean
  is_bot?: boolean
  profile?: { email?: string, real_name?: string, display_name?: string }
}

interface SlackChannel {
  id: string
  name: string
  is_archived?: boolean
  members?: string[]
  topic?: { value: string }
  purpose?: { value: string }
}

export interface SlackMessage {
  type: string
  subtype?: string
  user?: string
  text?: string
  ts: string
  thread_ts?: string
  user_profile?: { real_name?: string, display_name?: string }
  files?: Array<{ name?: string, title?: string }>
  bot_id?: string
  username?: string
  bot_profile?: { name?: string }
}

const BROADCASTS = new Set(['here', 'channel', 'everyone'])
const KEPT_SUBTYPES = new Set(['thread_broadcast', 'bot_message', 'file_share', 'me_message'])

export function parseSlack (file: ExportFile): ImportBundle {
  const entries = readZip(file.bytes)
  const readList = <T>(path: string): T[] => {
    const bytes = entries.get(path)
    return bytes === undefined ? [] : (JSON.parse(decodeText(bytes)) as T[])
  }

  const users = new Map(readList<SlackUser>('users.json').map((user) => [user.id, user]))
  const publicChannels = readList<SlackChannel>('channels.json')
  const privateChannels = readList<SlackChannel>('groups.json')
  const channelNames = new Map([...publicChannels, ...privateChannels].map((channel) => [channel.id, channel.name]))
  const skippedDms = readList<SlackChannel>('dms.json').length + readList<SlackChannel>('mpims.json').length

  const convert = slackConverter(users, channelNames)

  let skippedFiles = 0
  const toMessage = (message: SlackMessage): MessageImport | undefined => {
    const converted = slackMessage(message, users, convert)
    if (converted !== undefined) skippedFiles += message.files?.length ?? 0
    return converted
  }

  const toChannel = (channel: SlackChannel, isPrivate: boolean): ChannelImport => {
    const dayFiles = [...entries.keys()].filter((path) => path.startsWith(`${channel.name}/`) && path.endsWith('.json'))
    const messages = dayFiles
      .flatMap((path) => readList<SlackMessage>(path))
      .map(toMessage)
      .filter((message): message is MessageImport => message !== undefined)
      .sort((a, b) => a.date - b.date || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    return {
      name: channel.name,
      topic: convert(firstText(channel.topic?.value, channel.purpose?.value)),
      isPrivate,
      isArchived: channel.is_archived ?? false,
      members: (channel.members ?? [])
        .map((id) => users.get(id))
        .filter((user): user is SlackUser => user !== undefined)
        .map(slackPerson),
      messages
    }
  }

  const channels = [
    ...publicChannels.map((channel) => toChannel(channel, false)),
    ...privateChannels.map((channel) => toChannel(channel, true))
  ]
  const warnings: string[] = []
  if (skippedDms > 0) warnings.push(`Skipped ${skippedDms} direct and group direct message conversations`)
  if (skippedFiles > 0) warnings.push(`${skippedFiles} attached files were not imported`)
  return { projects: [], channels, teamspaces: [], warnings }
}

export function slackPerson (user: SlackUser): PersonRef {
  return { name: firstText(user.profile?.real_name, user.real_name, user.name), email: user.profile?.email }
}

export function slackConverter (users: Map<string, SlackUser>, channelNames: Map<string, string>): (text: string) => string {
  const mentionName = (id: string): string | undefined => {
    const user = users.get(id)
    return user === undefined ? undefined : firstText(user.profile?.display_name, slackPerson(user).name)
  }
  return (text) => slackToMarkdown(text, mentionName, (id) => channelNames.get(id))
}

export function slackMessage (
  message: SlackMessage,
  users: Map<string, SlackUser>,
  convert: (text: string) => string
): MessageImport | undefined {
  if (message.type !== 'message') return undefined
  if (message.subtype !== undefined && !KEPT_SUBTYPES.has(message.subtype)) return undefined
  const fileNotes = (message.files ?? []).map((attached) => `[file: ${attached.name ?? attached.title ?? 'untitled'}]`)
  const text = [convert(message.text ?? ''), ...fileNotes].filter((part) => part !== '').join('\n')
  if (text === '') return undefined
  const user = message.user === undefined ? undefined : users.get(message.user)
  const fallbackName = firstText(message.username, message.bot_profile?.name, message.user_profile?.real_name)
  const author = user !== undefined ? slackPerson(user) : fallbackName !== '' ? { name: fallbackName } : undefined
  const threadKey = message.thread_ts !== undefined && message.thread_ts !== message.ts ? message.thread_ts : undefined
  return { key: message.ts, threadKey, author, date: Math.round(parseFloat(message.ts) * 1000), text }
}

function slackToMarkdown (
  text: string,
  mentionName: (userId: string) => string | undefined,
  channelName: (channelId: string) => string | undefined
): string {
  const stash: string[] = []
  const hold = (markdown: string): string => `\uE000${stash.push(markdown) - 1}\uE000`

  const formatted = text
    .replace(/```[\s\S]*?```|`[^`\n]+`/g, (code) => hold(decodeEntities(code)))
    .replace(/<([^<>\n]+)>/g, (_, token: string) => hold(convertToken(token, mentionName, channelName)))
  return decodeEntities(applyEmphasis(formatted)).replace(/\uE000(\d+)\uE000/g, (_, index: string) => stash[Number(index)])
}

function applyEmphasis (text: string): string {
  return text.replace(
    /(^|[\s(])([*_~])([^\s*_~](?:[^\n]*?[^\s])?)\2(?=$|[\s.,!?;:)])/gm,
    (_, lead: string, mark: string, inner: string) => {
      const wrap = mark === '*' ? '**' : mark === '_' ? '*' : '~~'
      return `${lead}${wrap}${applyEmphasis(inner)}${wrap}`
    }
  )
}

function convertToken (
  token: string,
  mentionName: (userId: string) => string | undefined,
  channelName: (channelId: string) => string | undefined
): string {
  const [target, label] = token.split('|', 2)
  const plainLabel = label === undefined ? undefined : decodeEntities(label)
  if (target.startsWith('@')) {
    const id = target.slice(1)
    return `@${mentionName(id) ?? plainLabel ?? id}`
  }
  if (target.startsWith('#')) {
    const id = target.slice(1)
    return `#${plainLabel ?? channelName(id) ?? id}`
  }
  if (target.startsWith('!')) {
    const command = target.slice(1).split('^')[0]
    return BROADCASTS.has(command) ? `@${command}` : plainLabel ?? `@${command}`
  }
  const url = decodeEntities(target)
  return plainLabel === undefined ? url : `[${plainLabel}](${url})`
}

export function firstText (...candidates: Array<string | undefined>): string {
  return candidates.find((candidate) => candidate !== undefined && candidate !== '') ?? ''
}

function decodeEntities (text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
