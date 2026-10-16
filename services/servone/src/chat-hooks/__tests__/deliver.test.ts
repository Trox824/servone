import type { PersonId } from '@hcengineering/core'
import { deliveryIdFor } from '../../outgoing/dispatcher'
import { createChatTxHandler } from '../deliver'
import type { AuthorKind } from '../filters'
import type { ChatReader } from '../resolve'
import type { StoredChatHook } from '../store'
import { ANA, CHANNEL, PERSON_MENTION, postMessage, storedChatHook, text, WORKSPACE } from './fixtures'

interface Sent {
  hook: string
  id: string
  event: string
  body: string
}

function harness (hooks: StoredChatHook[], authorKind: AuthorKind = 'person'): { sent: Sent[], reads: number, handle: ReturnType<typeof createChatTxHandler> } {
  const sent: Sent[] = []
  const state = { reads: 0 }
  const reader: ChatReader = {
    channel: async () => {
      state.reads++
      return { name: 'backend' }
    },
    message: async () => undefined,
    attachments: async () => [],
    person: async (id: PersonId) => ({ name: id === ANA ? 'Ana' : 'Other', email: null, kind: authorKind })
  }
  const handle = createChatTxHandler({
    enabledHooks: async () => hooks,
    reader: async () => reader,
    links: async () => ({ frontUrl: 'https://app.servone.vn', workspaceId: WORKSPACE, workspaceUrl: 'servone' }),
    enqueue: async (hook, id, event, body) => { sent.push({ hook: hook.id, id, event, body }) },
    warn: () => {}
  })
  return {
    sent,
    get reads () { return state.reads },
    handle
  }
}

describe('createChatTxHandler', () => {
  it('enqueues one delivery per matching hook with payload v1', async () => {
    const h = harness([storedChatHook('a'), storedChatHook('b', { events: ['thread.reply'] })])
    const tx = postMessage(text('Deploy failed'))
    await h.handle(WORKSPACE, tx)
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ hook: 'a', id: deliveryIdFor('a', tx._id, 'message.posted'), event: 'message.posted' })
    expect(JSON.parse(h.sent[0].body)).toMatchObject({ version: 1, event: 'message.posted', channel: { id: CHANNEL, name: 'backend' } })
  })

  it('reads nothing when no hook wants the event', async () => {
    const h = harness([storedChatHook('a', { mentionsOnly: true })])
    await h.handle(WORKSPACE, postMessage(text('no mention')))
    expect(h.sent).toEqual([])
    expect(h.reads).toBe(0)
  })

  it('sends mentions to a mentions-only hook', async () => {
    const h = harness([storedChatHook('a', { mentionsOnly: true })])
    await h.handle(WORKSPACE, postMessage(PERSON_MENTION))
    expect(h.sent).toHaveLength(1)
  })

  it('skips bot authors for a people-only hook', async () => {
    const h = harness([storedChatHook('a', { peopleOnly: true }), storedChatHook('b')], 'bot')
    await h.handle(WORKSPACE, postMessage(text('reminder')))
    expect(h.sent.map((delivery) => delivery.hook)).toEqual(['b'])
  })

  it('skips hooks of another channel', async () => {
    const h = harness([storedChatHook('a', { channel: 'channel-other' as StoredChatHook['channel'] })])
    await h.handle(WORKSPACE, postMessage(text('x')))
    expect(h.sent).toEqual([])
  })

  it('gives a replayed tx the same delivery id', async () => {
    const h = harness([storedChatHook('a')])
    const tx = postMessage(text('x'))
    await h.handle(WORKSPACE, tx)
    await h.handle(WORKSPACE, tx)
    expect(h.sent[0].id).toBe(h.sent[1].id)
  })
})
