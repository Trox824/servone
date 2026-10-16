import chunter, { type ChatMessage } from '@hcengineering/chunter'
import type { PersonId, Ref } from '@hcengineering/core'
import { type ChatEvent, readChatEvent } from '../events'
import type { AuthorKind } from '../filters'
import type { AttachmentFacts, PersonFacts } from '../payload'
import { type ChatLinks, type ChatReader, resolveChatEvent, type StoredMessage } from '../resolve'
import { ANA, CHANNEL, editMessage, MESSAGE, postMessage, react, removeMessage, REPLY, text } from './fixtures'

const LINKS: ChatLinks = { frontUrl: 'https://app.servone.vn', workspaceId: 'ws-1', workspaceUrl: 'servone' }
const CHANNEL_URL = `https://app.servone.vn/workbench/servone/chunter/${encodeURIComponent(`${CHANNEL}|chunter:class:Channel`)}`
const BOB = 'social-bob' as PersonId

function eventOf (tx: Parameters<typeof readChatEvent>[0]): ChatEvent {
  const event = readChatEvent(tx)
  if (event === undefined) throw new Error('not a chat event')
  return event
}

function reader (overrides: Partial<ChatReader> = {}): ChatReader {
  const people = new Map<PersonId, PersonFacts & { kind: AuthorKind }>([
    [ANA, { name: 'Ana Lee', email: 'ana@company.com', kind: 'person' }],
    [BOB, { name: 'Bob', email: null, kind: 'person' }]
  ])
  const attachments: AttachmentFacts[] = [{ name: 'log.txt', size: 2048, type: 'text/plain' }]
  const stored: StoredMessage = { markup: text('Deploy failed'), author: BOB, threadParent: null }
  return {
    channel: async (id) => (id === CHANNEL ? { name: 'backend' } : undefined),
    message: async () => stored,
    attachments: async () => attachments,
    person: async (id) => people.get(id) ?? { name: 'Unknown', email: null, kind: 'person' },
    ...overrides
  }
}

describe('resolveChatEvent', () => {
  it('resolves a posted message with author, links and attachments', async () => {
    const resolution = await resolveChatEvent(reader(), eventOf(postMessage(text('Deploy failed'))), LINKS)
    expect(resolution).toEqual({
      author: 'person',
      resolved: {
        occurredAt: 1_000,
        workspace: { id: 'ws-1', url: 'https://app.servone.vn/workbench/servone' },
        channel: { id: CHANNEL, name: 'backend', url: CHANNEL_URL },
        message: {
          id: MESSAGE,
          url: `${CHANNEL_URL}?message=${MESSAGE}`,
          markup: text('Deploy failed'),
          author: { name: 'Ana Lee', email: 'ana@company.com', isBot: false },
          threadParentId: null,
          attachments: [{ name: 'log.txt', size: 2048, type: 'text/plain' }]
        },
        reaction: null
      }
    })
  })

  it('links an edited thread reply to its thread', async () => {
    const parent = 'parent-1' as Ref<ChatMessage>
    const resolution = await resolveChatEvent(
      reader({ message: async () => ({ markup: text('old'), author: ANA, threadParent: parent }) }),
      eventOf(editMessage(text('new'), chunter.class.ThreadMessage)),
      LINKS
    )
    if ('skipped' in resolution) throw new Error('skipped')
    expect(resolution.resolved.message).toMatchObject({
      threadParentId: parent,
      url: `${CHANNEL_URL}/${parent}?message=${REPLY}`,
      markup: text('new')
    })
  })

  it('sends only ids for a deleted message', async () => {
    const resolution = await resolveChatEvent(reader(), eventOf(removeMessage()), LINKS)
    if ('skipped' in resolution) throw new Error('skipped')
    expect(resolution.resolved.message).toEqual({ id: MESSAGE, url: null, markup: null, author: null, threadParentId: null, attachments: [] })
  })

  it('describes a reaction with the message it is on and who reacted', async () => {
    const resolution = await resolveChatEvent(reader(), eventOf(react('👍')), LINKS)
    if ('skipped' in resolution) throw new Error('skipped')
    expect(resolution.resolved.reaction).toEqual({ emoji: '👍', by: { name: 'Ana Lee', email: 'ana@company.com' } })
    expect(resolution.resolved.message).toMatchObject({ markup: text('Deploy failed'), author: { name: 'Bob', isBot: false } })
  })

  it('judges the actor, not the message author', async () => {
    const bot = reader({ person: async () => ({ name: 'Servone Forms', email: 'forms@servone.vn', kind: 'bot' }) })
    expect(await resolveChatEvent(bot, eventOf(react('👍')), LINKS)).toMatchObject({ author: 'bot' })
  })

  it('treats a message stamped by a webhook as an integration author', async () => {
    const event = eventOf(postMessage(text('build ok'), CHANNEL, { servoneWebhookName: 'CI' }))
    expect(await resolveChatEvent(reader(), event, LINKS)).toMatchObject({ author: 'integration' })
  })

  it('skips an event whose channel is gone', async () => {
    expect(await resolveChatEvent(reader({ channel: async () => undefined }), eventOf(postMessage(text('x'))), LINKS)).toEqual({ skipped: 'no_channel' })
  })

  it('skips a reaction whose message is gone', async () => {
    expect(await resolveChatEvent(reader({ message: async () => undefined }), eventOf(react('👍')), LINKS)).toEqual({ skipped: 'no_message' })
  })
})
