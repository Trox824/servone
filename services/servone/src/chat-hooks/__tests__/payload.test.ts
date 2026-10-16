import type { Json } from '../../http-json'
import type { ChatEventName } from '../events'
import { buildChatPayload, MAX_TEXT_CHARS, type ResolvedChatEvent } from '../payload'
import { text } from './fixtures'

const RESOLVED: ResolvedChatEvent = {
  occurredAt: Date.UTC(2026, 8, 27, 10, 15),
  workspace: { id: 'ws-1', url: 'https://app.servone.vn/workbench/servone' },
  channel: { id: 'channel-backend', name: 'backend', url: 'https://app.servone.vn/workbench/servone/chunter/c' },
  message: {
    id: 'message-1',
    url: 'https://app.servone.vn/workbench/servone/chunter/c?message=message-1',
    markup: text('Deploy failed on main'),
    author: { name: 'Ana Lee', email: 'ana@company.com', isBot: false },
    threadParentId: null,
    attachments: [{ name: 'log.txt', size: 2048, type: 'text/plain' }]
  },
  reaction: null
}

const parse = (body: string): { [key: string]: Json } => JSON.parse(body)

describe('buildChatPayload', () => {
  it('writes payload v1', () => {
    expect(parse(buildChatPayload('message.posted', 'd1', RESOLVED))).toEqual({
      version: 1,
      event: 'message.posted',
      deliveryId: 'd1',
      occurredAt: '2026-09-27T10:15:00.000Z',
      workspace: { id: 'ws-1', url: 'https://app.servone.vn/workbench/servone' },
      channel: { id: 'channel-backend', name: 'backend', url: 'https://app.servone.vn/workbench/servone/chunter/c' },
      message: {
        id: 'message-1',
        url: 'https://app.servone.vn/workbench/servone/chunter/c?message=message-1',
        text: 'Deploy failed on main',
        markdown: 'Deploy failed on main',
        truncated: false,
        author: { name: 'Ana Lee', email: 'ana@company.com', isBot: false },
        threadParentId: null,
        attachments: [{ name: 'log.txt', size: 2048, type: 'text/plain' }]
      },
      reaction: null
    })
  })

  it.each(['message.posted', 'message.updated', 'thread.reply', 'reaction.added'] as ChatEventName[])('names %s', (event) => {
    expect(parse(buildChatPayload(event, 'd1', RESOLVED)).event).toBe(event)
  })

  it('sends only ids for message.deleted', () => {
    const deleted: ResolvedChatEvent = {
      ...RESOLVED,
      message: { id: 'message-1', url: null, markup: null, author: null, threadParentId: null, attachments: [] }
    }
    expect(parse(buildChatPayload('message.deleted', 'd1', deleted)).message).toEqual({
      id: 'message-1',
      url: null,
      text: null,
      markdown: null,
      truncated: false,
      author: null,
      threadParentId: null,
      attachments: []
    })
  })

  it('describes the reaction for reaction.added', () => {
    const reacted: ResolvedChatEvent = { ...RESOLVED, reaction: { emoji: '👍', by: { name: 'Hung', email: null } } }
    expect(parse(buildChatPayload('reaction.added', 'd1', reacted)).reaction).toEqual({ emoji: '👍', by: { name: 'Hung', email: null } })
  })

  it('caps text and markdown and marks the message truncated', () => {
    const long: ResolvedChatEvent = { ...RESOLVED, message: { ...RESOLVED.message, markup: text('x'.repeat(MAX_TEXT_CHARS + 10)) } }
    const message = parse(buildChatPayload('message.posted', 'd1', long)).message
    expect(message).toMatchObject({ text: 'x'.repeat(MAX_TEXT_CHARS), markdown: 'x'.repeat(MAX_TEXT_CHARS), truncated: true })
  })

  it('sends a null email for a person without one', () => {
    const noEmail: ResolvedChatEvent = {
      ...RESOLVED,
      message: { ...RESOLVED.message, author: { name: 'Guest', email: null, isBot: false } }
    }
    expect(parse(buildChatPayload('message.posted', 'd1', noEmail)).message).toMatchObject({ author: { name: 'Guest', email: null, isBot: false } })
  })
})
