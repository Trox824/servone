import { type ChatEvent, readChatEvent } from '../events'
import { acceptsAuthor, type ChatHookFilters, wantsEvent } from '../filters'
import { CHANNEL, PERSON_MENTION, postMessage, react, removeMessage, text } from './fixtures'

function eventOf (tx: Parameters<typeof readChatEvent>[0]): ChatEvent {
  const event = readChatEvent(tx)
  if (event === undefined) throw new Error('not a chat event')
  return event
}

const hook = (overrides: Partial<ChatHookFilters> = {}): ChatHookFilters => ({
  events: ['message.posted', 'message.deleted', 'reaction.added'],
  mentionsOnly: false,
  peopleOnly: false,
  includeIntegrations: false,
  ...overrides
})

describe('wantsEvent', () => {
  it('takes only the events the hook chose', () => {
    expect(wantsEvent(hook({ events: ['message.posted'] }), eventOf(postMessage(text('x'))))).toBe(true)
    expect(wantsEvent(hook({ events: ['thread.reply'] }), eventOf(postMessage(text('x'))))).toBe(false)
  })

  it('with mentions only, takes messages that mention someone', () => {
    expect(wantsEvent(hook({ mentionsOnly: true }), eventOf(postMessage(PERSON_MENTION)))).toBe(true)
    expect(wantsEvent(hook({ mentionsOnly: true }), eventOf(postMessage(text('x'))))).toBe(false)
  })

  it('with mentions only, still takes events that carry no text', () => {
    expect(wantsEvent(hook({ mentionsOnly: true }), eventOf(removeMessage()))).toBe(true)
    expect(wantsEvent(hook({ mentionsOnly: true }), eventOf(react('👍')))).toBe(true)
  })

  it('skips integration messages unless the hook includes them', () => {
    const fromWebhook = eventOf(postMessage(text('build ok'), CHANNEL, { servoneWebhookName: 'CI' }))
    expect(wantsEvent(hook(), fromWebhook)).toBe(false)
    expect(wantsEvent(hook({ includeIntegrations: true }), fromWebhook)).toBe(true)
    expect(wantsEvent(hook({ includeIntegrations: true, peopleOnly: true }), fromWebhook)).toBe(false)
  })
})

describe('acceptsAuthor', () => {
  it.each([
    [{}, 'person', true],
    [{}, 'bot', true],
    [{}, 'integration', false],
    [{ includeIntegrations: true }, 'integration', true],
    [{ peopleOnly: true }, 'person', true],
    [{ peopleOnly: true }, 'bot', false],
    [{ peopleOnly: true, includeIntegrations: true }, 'integration', false]
  ] as const)('%j and a %s author: %s', (overrides, author, expected) => {
    expect(acceptsAuthor(hook(overrides), author)).toBe(expected)
  })
})
