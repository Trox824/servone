import { z } from 'zod'
import { parseDate } from '../tracker/bundle'
import type { ApiCall, ChannelImport, Connector, Json, MessageImport, PersonRef, ScopeOption } from '../types'
import { ConnectorError, callApi } from './api'
import { htmlToMarkdown } from './html'

const GRAPH_BASE = 'https://graph.microsoft.com'
const MESSAGE_PAGE = 50
const SCOPE_SEPARATOR = '/'
const GUEST_PRINCIPAL = '#EXT#'
const HIDDEN_STATUSES = new Set([403, 404])

const nextLink = { '@odata.nextLink': z.string().optional() }

const team = z.object({ id: z.string(), displayName: z.string() })
const channel = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().nullish(),
  membershipType: z.string().nullish(),
  isArchived: z.boolean().nullish()
})
const message = z.object({
  id: z.string(),
  replyToId: z.string().nullish(),
  messageType: z.string(),
  createdDateTime: z.string(),
  deletedDateTime: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.object({ contentType: z.string(), content: z.string().nullish() }),
  from: z.object({
    user: z.object({ id: z.string().nullish(), displayName: z.string().nullish() }).nullish(),
    application: z.object({ displayName: z.string().nullish() }).nullish()
  }).nullish(),
  attachments: z.array(z.object({ contentType: z.string().nullish(), name: z.string().nullish() })).optional()
})
const member = z.object({ displayName: z.string().nullish(), userId: z.string().nullish(), email: z.string().nullish() })
const graphUser = z.object({ mail: z.string().nullish(), userPrincipalName: z.string().nullish() })

const teamsPage = z.object({ value: z.array(team), ...nextLink })
const channelsPage = z.object({ value: z.array(channel), ...nextLink })
const messagesPage = z.object({ value: z.array(message), ...nextLink })
const membersPage = z.object({ value: z.array(member), ...nextLink })

type TeamsMessage = z.infer<typeof message>

interface TeamsChannel {
  teamId: string
  teamName: string
  id: string
  name: string
  topic: string
  isPrivate: boolean
  isArchived: boolean
}

function scopeId (teamsChannel: TeamsChannel): string {
  return `${teamsChannel.teamId}${SCOPE_SEPARATOR}${teamsChannel.id}`
}

async function pagedValues<T> (
  api: ApiCall,
  path: string,
  query: Array<[string, string]>,
  parse: (body: Json) => { value: T[], '@odata.nextLink'?: string },
  signal: AbortSignal
): Promise<T[]> {
  const values: T[] = []
  let request: { path: string, query: Array<[string, string]> } | undefined = { path, query }
  while (request !== undefined) {
    const response = parse(await callApi(api, { method: 'GET', ...request }, signal))
    values.push(...response.value)
    const next = response['@odata.nextLink']
    request = next === undefined ? undefined : nextRequest(new URL(next, GRAPH_BASE))
  }
  return values
}

function nextRequest (url: URL): { path: string, query: Array<[string, string]> } {
  const query: Array<[string, string]> = []
  url.searchParams.forEach((param, name) => { query.push([name, param]) })
  return { path: url.pathname, query }
}

async function listChannels (api: ApiCall, signal: AbortSignal, teamIds?: Set<string>): Promise<TeamsChannel[]> {
  const channels: TeamsChannel[] = []
  const teams = await pagedValues(api, '/v1.0/me/joinedTeams', [], (body) => teamsPage.parse(body), signal)
  for (const joined of teams) {
    if (teamIds !== undefined && !teamIds.has(joined.id)) continue
    const teamChannels = await pagedValues(api, `/v1.0/teams/${joined.id}/channels`, [], (body) => channelsPage.parse(body), signal)
    channels.push(...teamChannels.map((teamChannel) => ({
      teamId: joined.id,
      teamName: joined.displayName,
      id: teamChannel.id,
      name: teamChannel.displayName,
      topic: teamChannel.description ?? '',
      isPrivate: (teamChannel.membershipType ?? 'standard') !== 'standard',
      isArchived: teamChannel.isArchived ?? false
    })))
  }
  return channels
}

function messageText (teamsMessage: TeamsMessage): { text: string, attachments: number } {
  const content = teamsMessage.body.content ?? ''
  const body = teamsMessage.body.contentType === 'html'
    ? htmlToMarkdown(content
      .replace(/<at\b[^>]*>([\s\S]*?)<\/at>/g, '@$1')
      .replace(/<emoji\b[^>]*?alt="([^"]*)"[^>]*>(?:<\/emoji>)?/g, '$1')
      .replace(/<attachment\b[^>]*>(?:<\/attachment>)?/g, ''))
    : content.trim()
  const files = (teamsMessage.attachments ?? [])
    .filter((attachment) => attachment.contentType !== 'messageReference')
    .map((attachment) => `[file: ${attachment.name ?? 'attachment'}]`)
  const subject = teamsMessage.subject === null || teamsMessage.subject === undefined || teamsMessage.subject === '' ? [] : [`**${teamsMessage.subject}**`]
  const images = (content.match(/<img\b/g) ?? []).length
  return { text: [...subject, body, ...files].filter((part) => part !== '').join('\n\n'), attachments: files.length + images }
}

export const teamsConnector: Connector = {
  async listScopes (api) {
    const channels = await listChannels(api, new AbortController().signal)
    return channels.map((teamsChannel): ScopeOption => ({
      id: scopeId(teamsChannel),
      name: teamsChannel.name,
      kind: 'channel',
      parentName: teamsChannel.teamName,
      isSelected: !teamsChannel.isPrivate && !teamsChannel.isArchived
    }))
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const selected = new Set(scopeIds)
    const teamIds = new Set(scopeIds.map((id) => id.slice(0, id.indexOf(SCOPE_SEPARATOR))))
    const channels = (await listChannels(api, signal, teamIds)).filter((teamsChannel) => selected.has(scopeId(teamsChannel)))
    const nameCounts = new Map<string, number>()
    for (const teamsChannel of channels) nameCounts.set(teamsChannel.name, (nameCounts.get(teamsChannel.name) ?? 0) + 1)

    const emails = new Map<string, string | undefined>()
    const emailOf = async (userId: string): Promise<string | undefined> => {
      if (emails.has(userId)) return emails.get(userId)
      let email: string | undefined
      try {
        const found = graphUser.parse(await callApi(api, { method: 'GET', path: `/v1.0/users/${userId}`, query: [['$select', 'mail,userPrincipalName']] }, signal))
        const principal = found.userPrincipalName ?? undefined
        email = found.mail ?? (principal?.includes(GUEST_PRINCIPAL) === false ? principal : undefined)
      } catch (error) {
        if (!(error instanceof ConnectorError) || !HIDDEN_STATUSES.has(error.status)) throw error
      }
      emails.set(userId, email)
      return email
    }
    const authorOf = async (teamsMessage: TeamsMessage): Promise<PersonRef | undefined> => {
      const sender = teamsMessage.from?.user
      if (sender !== null && sender !== undefined) {
        return { name: sender.displayName ?? undefined, email: sender.id === null || sender.id === undefined ? undefined : await emailOf(sender.id) }
      }
      const appName = teamsMessage.from?.application?.displayName
      return appName === null || appName === undefined ? undefined : { name: appName }
    }

    let attachments = 0
    let hiddenMemberLists = 0
    const imported: ChannelImport[] = []
    for (const teamsChannel of channels) {
      const channelPath = `/v1.0/teams/${teamsChannel.teamId}/channels/${teamsChannel.id}`
      let members: PersonRef[] | undefined
      try {
        const listed = await pagedValues(api, `${channelPath}/members`, [], (body) => membersPage.parse(body), signal)
        members = listed.map((channelMember) => ({ name: channelMember.displayName ?? undefined, email: channelMember.email ?? undefined }))
        for (const { userId, email } of listed) {
          if (typeof userId === 'string' && typeof email === 'string') emails.set(userId, email)
        }
      } catch (error) {
        if (!(error instanceof ConnectorError) || error.status !== 403) throw error
        hiddenMemberLists++
      }

      const messages: MessageImport[] = []
      const add = async (teamsMessage: TeamsMessage, threadKey?: string): Promise<boolean> => {
        const isDeleted = teamsMessage.deletedDateTime !== null && teamsMessage.deletedDateTime !== undefined
        if (teamsMessage.messageType !== 'message' || isDeleted) return false
        const { text, attachments: skipped } = messageText(teamsMessage)
        attachments += skipped
        const date = parseDate(teamsMessage.createdDateTime)
        if (text === '' || date === undefined) return false
        messages.push({ key: teamsMessage.id, threadKey, author: await authorOf(teamsMessage), date, text })
        return true
      }
      const roots = await pagedValues(api, `${channelPath}/messages`, [['$top', String(MESSAGE_PAGE)]], (body) => messagesPage.parse(body), signal)
      for (const root of roots) {
        const isThreadKept = await add(root)
        const replies = await pagedValues(api, `${channelPath}/messages/${root.id}/replies`, [['$top', String(MESSAGE_PAGE)]], (body) => messagesPage.parse(body), signal)
        for (const reply of replies) await add(reply, isThreadKept ? root.id : undefined)
        onProgress({ label: teamsChannel.name, count: messages.length })
      }
      messages.sort((a, b) => a.date !== b.date ? a.date - b.date : a.key.localeCompare(b.key))

      const authors = new Map(messages.flatMap((posted) => posted.author === undefined ? [] : [[posted.author.email ?? posted.author.name, posted.author]]))
      imported.push({
        name: (nameCounts.get(teamsChannel.name) ?? 0) > 1 ? `${teamsChannel.teamName} - ${teamsChannel.name}` : teamsChannel.name,
        topic: teamsChannel.topic,
        isPrivate: teamsChannel.isPrivate,
        isArchived: teamsChannel.isArchived,
        members: members ?? [...authors.values()],
        messages
      })
    }

    const warnings: string[] = []
    if (attachments > 0) warnings.push(`${attachments} attached files and images were not imported`)
    if (hiddenMemberLists > 0) warnings.push(`Member lists of ${hiddenMemberLists} channels could not be read, so message authors were added as members`)
    return { projects: [], channels: imported, teamspaces: [], warnings }
  }
}
