import type { Markup } from '@hcengineering/core'
import { jsonToMarkup, markupToJSON, markupToText, MarkupNodeType } from '@hcengineering/text-core'
import { markupToMarkdown } from '@hcengineering/text-markdown'
import type { Json } from '../http-json'
import type { ChatEventName } from './events'
import type { ChatLinks } from './resolve'

export const PAYLOAD_VERSION = 1
// Same cap as tracker comments: enough for a receiver to act on; the full text stays in Servone.
export const MAX_TEXT_CHARS = 4000
const TEST_MESSAGE_ID = 'test'

export interface PersonFacts {
  name: string
  email: string | null
}

export interface AuthorFacts extends PersonFacts {
  isBot: boolean
}

export interface AttachmentFacts {
  name: string
  size: number
  type: string
}

export interface ResolvedChatEvent {
  occurredAt: number
  workspace: { id: string, url: string }
  channel: { id: string, name: string, url: string }
  message: {
    id: string
    url: string | null
    // Null for message.deleted: a removal carries only ids.
    markup: Markup | null
    author: AuthorFacts | null
    threadParentId: string | null
    attachments: AttachmentFacts[]
  }
  reaction: { emoji: string, by: PersonFacts } | null
}

const personJson = (person: PersonFacts): Json => ({ name: person.name, email: person.email })

export function buildChatPayload (event: ChatEventName | 'test', deliveryId: string, resolved: ResolvedChatEvent): string {
  const { message } = resolved
  const text = message.markup === null ? null : markupToText(message.markup)
  const markdown = message.markup === null ? null : markupToMarkdown(markupToJSON(message.markup))
  const isTruncated = (text?.length ?? 0) > MAX_TEXT_CHARS || (markdown?.length ?? 0) > MAX_TEXT_CHARS
  const payload: { [key: string]: Json } = {
    version: PAYLOAD_VERSION,
    event,
    deliveryId,
    occurredAt: new Date(resolved.occurredAt).toISOString(),
    workspace: { id: resolved.workspace.id, url: resolved.workspace.url },
    channel: { id: resolved.channel.id, name: resolved.channel.name, url: resolved.channel.url },
    message: {
      id: message.id,
      url: message.url,
      text: text?.slice(0, MAX_TEXT_CHARS) ?? null,
      markdown: markdown?.slice(0, MAX_TEXT_CHARS) ?? null,
      truncated: isTruncated,
      author: message.author === null ? null : { name: message.author.name, email: message.author.email, isBot: message.author.isBot },
      threadParentId: message.threadParentId,
      attachments: message.attachments.map((file) => ({ name: file.name, size: file.size, type: file.type }))
    },
    reaction: resolved.reaction === null ? null : { emoji: resolved.reaction.emoji, by: personJson(resolved.reaction.by) }
  }
  return JSON.stringify(payload)
}

export function testChatEvent (links: ChatLinks, channel: { id: string, name: string, url: string }, caller: PersonFacts, now: number): ResolvedChatEvent {
  const markup = jsonToMarkup({
    type: MarkupNodeType.doc,
    content: [{ type: MarkupNodeType.paragraph, content: [{ type: MarkupNodeType.text, text: 'Test event from Servone' }] }]
  })
  return {
    occurredAt: now,
    workspace: { id: links.workspaceId, url: `${links.frontUrl}/workbench/${links.workspaceUrl}` },
    channel,
    message: {
      id: TEST_MESSAGE_ID,
      url: null,
      markup,
      author: { ...caller, isBot: false },
      threadParentId: null,
      attachments: []
    },
    reaction: null
  }
}
