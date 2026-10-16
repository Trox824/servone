import type { RestClient } from '@hcengineering/api-client'
import attachment from '@hcengineering/attachment'
import chunter, { type Channel, type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import contact, { formatName, type SocialIdentityRef } from '@hcengineering/contact'
import core, { type Class, type Markup, type PersonId, type Ref } from '@hcengineering/core'
import { FORMS_BOT, WEBHOOKS_BOT } from '../webhooks/bot'
import { findRecipient } from '../workspaces'
import type { ChatEvent } from './events'
import type { AuthorKind } from './filters'
import type { AttachmentFacts, AuthorFacts, PersonFacts, ResolvedChatEvent } from './payload'

// Accounts that post on behalf of another app; the app commands bot belongs here too.
export const INTEGRATION_EMAILS: ReadonlySet<string> = new Set([WEBHOOKS_BOT.email])
const BOT_EMAILS: ReadonlySet<string> = new Set([FORMS_BOT.email])
const SYSTEM: PersonFacts & { kind: AuthorKind } = { name: 'System', email: null, kind: 'bot' }
const UNKNOWN: PersonFacts & { kind: AuthorKind } = { name: 'Unknown', email: null, kind: 'person' }

export interface ChatLinks {
  frontUrl: string
  workspaceId: string
  workspaceUrl: string
}

export interface StoredMessage {
  markup: Markup
  author: PersonId
  threadParent: Ref<ChatMessage> | null
}

export interface ChatReader {
  // Undefined for a direct message or a removed channel.
  channel: (id: Ref<Channel>) => Promise<{ name: string } | undefined>
  message: (id: Ref<ChatMessage>, messageClass: Ref<Class<ChatMessage>>) => Promise<StoredMessage | undefined>
  attachments: (message: Ref<ChatMessage>) => Promise<AttachmentFacts[]>
  person: (socialId: PersonId) => Promise<PersonFacts & { kind: AuthorKind }>
}

export type ChatResolution = { resolved: ResolvedChatEvent, author: AuthorKind } | { skipped: 'no_channel' | 'no_message' }

export function channelUrl (links: ChatLinks, channel: Ref<Channel>): string {
  const id = encodeURIComponent(`${channel}|${chunter.class.Channel}`)
  return `${links.frontUrl}/workbench/${links.workspaceUrl}/chunter/${id}`
}

const messageUrl = (base: string, message: Ref<ChatMessage>, threadParent: Ref<ChatMessage> | null): string =>
  threadParent === null ? `${base}?message=${message}` : `${base}/${threadParent}?message=${message}`

const authorFacts = (person: PersonFacts & { kind: AuthorKind }): AuthorFacts => ({
  name: person.name,
  email: person.email,
  isBot: person.kind !== 'person'
})

interface MessageFacts {
  markup: Markup | null
  author: AuthorFacts | null
  threadParent: Ref<ChatMessage> | null
  hasLink: boolean
}

async function messageFacts (
  reader: ChatReader,
  event: ChatEvent,
  actor: PersonFacts & { kind: AuthorKind }
): Promise<MessageFacts | undefined> {
  switch (event.name) {
    case 'message.posted':
    case 'thread.reply':
      return { markup: event.markup, author: authorFacts(actor), threadParent: event.threadParent, hasLink: true }
    case 'message.updated': {
      const stored = await reader.message(event.message, event.messageClass)
      return { markup: event.markup, author: authorFacts(actor), threadParent: stored?.threadParent ?? null, hasLink: true }
    }
    case 'message.deleted':
      return { markup: null, author: null, threadParent: null, hasLink: false }
    case 'reaction.added': {
      const stored = await reader.message(event.message, event.messageClass)
      if (stored === undefined) return undefined
      return { markup: stored.markup, author: authorFacts(await reader.person(stored.author)), threadParent: stored.threadParent, hasLink: true }
    }
  }
}

export async function resolveChatEvent (reader: ChatReader, event: ChatEvent, links: ChatLinks): Promise<ChatResolution> {
  const channel = await reader.channel(event.channel)
  if (channel === undefined) return { skipped: 'no_channel' }
  const actor = await reader.person(event.actor)
  const facts = await messageFacts(reader, event, actor)
  if (facts === undefined) return { skipped: 'no_message' }
  const base = channelUrl(links, event.channel)
  const attachments = event.name === 'message.deleted' ? [] : await reader.attachments(event.message)
  return {
    author: event.isIntegration ? 'integration' : actor.kind,
    resolved: {
      occurredAt: event.occurredAt,
      workspace: { id: links.workspaceId, url: `${links.frontUrl}/workbench/${links.workspaceUrl}` },
      channel: { id: event.channel, name: channel.name, url: base },
      message: {
        id: event.message,
        url: facts.hasLink ? messageUrl(base, event.message, facts.threadParent) : null,
        markup: facts.markup,
        author: facts.author,
        threadParentId: facts.threadParent,
        attachments
      },
      reaction: event.emoji === null ? null : { emoji: event.emoji, by: { name: actor.name, email: actor.email } }
    }
  }
}

function kindOf (email: string | undefined): AuthorKind {
  if (email !== undefined && INTEGRATION_EMAILS.has(email)) return 'integration'
  if (email !== undefined && BOT_EMAILS.has(email)) return 'bot'
  return 'person'
}

export function restChatReader (client: RestClient): ChatReader {
  return {
    channel: async (id) => {
      const found = await client.findOne(chunter.class.Channel, { _id: id })
      return found === undefined ? undefined : { name: found.name }
    },
    message: async (id, messageClass) => {
      if (messageClass === chunter.class.ThreadMessage) {
        const reply = await client.findOne(chunter.class.ThreadMessage, { _id: id as Ref<ThreadMessage> })
        return reply === undefined
          ? undefined
          : { markup: reply.message, author: reply.createdBy ?? reply.modifiedBy, threadParent: reply.attachedTo as Ref<ChatMessage> }
      }
      const found = await client.findOne(chunter.class.ChatMessage, { _id: id })
      return found === undefined ? undefined : { markup: found.message, author: found.createdBy ?? found.modifiedBy, threadParent: null }
    },
    attachments: async (message) => {
      const files = await client.findAll(attachment.class.Attachment, { attachedTo: message })
      return files.map((file) => ({ name: file.name, size: file.size, type: file.type }))
    },
    person: async (socialId) => {
      if (socialId === core.account.System) return SYSTEM
      // A SocialIdentity _id is the PersonId itself; only the brand differs.
      const identity = await client.findOne(contact.class.SocialIdentity, { _id: socialId as SocialIdentityRef })
      if (identity === undefined) return UNKNOWN
      const person = await client.findOne(contact.class.Person, { _id: identity.attachedTo })
      if (person === undefined) return UNKNOWN
      const email = await findRecipient(client, person._id)
      return { name: formatName(person.name), email: email ?? null, kind: kindOf(email) }
    }
  }
}
