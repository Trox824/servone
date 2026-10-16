import type { Channel } from '@hcengineering/chunter'
import { AccountRole, type AccountUuid, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { HostRefusedError } from '../../host-guard'
import type { Json } from '../../http-json'
import { Dispatcher } from '../../outgoing/dispatcher'
import type { AttemptOutcome } from '../../outgoing/send'
import { OutgoingHookStore } from '../../outgoing/store'
import { MemoryKv } from '../../tracker-hooks/__tests__/memory-kv'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import { type ChannelAccess, createRequestHandler, MAX_HOOKS_PER_CHANNEL } from '../server'
import { CHANNEL_INDEX, type ChatHookStore, type StoredChatHook } from '../store'
import { CHANNEL, WORKSPACE } from './fixtures'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const FRONT = 'https://app.servone.vn'
const OWNER = 'owner' as AccountUuid
const ARCHIVED = 'channel-old' as Ref<Channel>
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/
const TEST_OUTCOME: AttemptOutcome = { status: 200, durationMs: 12, responseStart: 'ok' }

const callers: Record<string, Caller> = {
  owner: { account: OWNER, workspace: WORKSPACE, role: AccountRole.User },
  member: { account: 'member' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User },
  maintainer: { account: 'boss' as AccountUuid, workspace: WORKSPACE, role: AccountRole.Maintainer },
  stranger: { account: OWNER, workspace: 'ws-2' as WorkspaceUuid, role: AccountRole.Owner }
}

const channels = new Map<Ref<Channel>, ChannelAccess>([
  [CHANNEL, { owners: [OWNER], archived: false }],
  [ARCHIVED, { owners: [OWNER], archived: true }]
])

interface Harness {
  base: string
  store: ChatHookStore
  sealed: Array<{ hookId: string, secret: string }>
  changed: Array<StoredChatHook | undefined>
  close: () => Promise<void>
}

async function start (): Promise<Harness> {
  const store: ChatHookStore = new OutgoingHookStore<StoredChatHook>(new MemoryKv(), CHANNEL_INDEX)
  const sealed: Harness['sealed'] = []
  const changed: Harness['changed'] = []
  const dispatcher = new Dispatcher<StoredChatHook>({
    store,
    send: async () => TEST_OUTCOME,
    notifyDisabled: async () => {},
    onHookChanged: (_id, hook) => { changed.push(hook) },
    now: () => 5_000,
    report: () => {}
  })
  const handler = createRequestHandler({
    store,
    hooks: dispatcher,
    buckets: new TokenBuckets(3, 1 / 10),
    frontUrl: FRONT,
    now: () => 5_000,
    authenticate: async (authorization) => callers[(authorization ?? '').replace('Bearer ', '')],
    findChannel: async (workspace, id) => (workspace === WORKSPACE ? channels.get(id) : undefined),
    resolveHost: async (host) => {
      if (host === 'private.example.com') throw new HostRefusedError('refused_address', 'private')
      return '203.0.113.10'
    },
    sealSecret: (workspace, hookId, secret) => {
      sealed.push({ hookId, secret })
      return { keyId: 'k1', iv: 'iv', tag: 'tag', data: `${workspace}:${hookId}` }
    },
    sendTest: async (hook) => await dispatcher.sendTest(hook, `test-${hook.id}`, '{}'),
    report: () => {}
  })
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    store,
    sealed,
    changed,
    close: async () => { await new Promise<void>((resolve) => server.close(() => { resolve() })) }
  }
}

async function api (h: Harness, method: string, path: string, as = 'owner', body?: Json): Promise<Response> {
  return await fetch(`${h.base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

const NEW_HOOK = { channel: CHANNEL, url: 'https://hooks.example.com/in', events: ['message.posted'] }
const listPath = (channel: string = CHANNEL): string => `/v1/chat/hooks?channel=${encodeURIComponent(channel)}`

async function createHook (h: Harness, body: Json = NEW_HOOK): Promise<{ hook: { id: string }, secret: string }> {
  const response = await api(h, 'POST', '/v1/chat/hooks', 'owner', body)
  expect(response.status).toBe(201)
  return await response.json()
}

describe('chat hooks API', () => {
  let h: Harness
  beforeEach(async () => { h = await start() })
  afterEach(async () => { await h.close() })

  it('creates a hook with filters off, returns the secret once and lists it without the secret', async () => {
    const { hook, secret } = await createHook(h)
    expect(secret).toMatch(SECRET_PATTERN)
    expect(h.sealed).toEqual([{ hookId: hook.id, secret }])
    expect(hook).toMatchObject({ channel: CHANNEL, mentionsOnly: false, peopleOnly: false, includeIntegrations: false })

    const listed = await (await api(h, 'GET', listPath())).json()
    expect(listed.hooks).toEqual([
      {
        id: hook.id,
        channel: CHANNEL,
        url: 'https://hooks.example.com/in',
        events: ['message.posted'],
        mentionsOnly: false,
        peopleOnly: false,
        includeIntegrations: false,
        createdBy: OWNER,
        createdOn: 5_000,
        disabledOn: null,
        disabledReason: null,
        consecutiveFailures: 0,
        lastAttempt: null
      }
    ])
    expect(JSON.stringify(listed)).not.toContain(secret)
  })

  it('lets only channel owners and Maintainers manage hooks', async () => {
    expect((await api(h, 'POST', '/v1/chat/hooks', 'member', NEW_HOOK)).status).toBe(403)
    expect((await api(h, 'GET', listPath(), 'member')).status).toBe(403)
    expect((await api(h, 'POST', '/v1/chat/hooks', 'maintainer', NEW_HOOK)).status).toBe(201)
    expect((await api(h, 'GET', listPath(), 'stranger')).status).toBe(404)
    expect((await api(h, 'GET', listPath(), 'nobody')).status).toBe(401)
    const { hook } = await createHook(h)
    expect((await api(h, 'DELETE', `/v1/chat/hooks/${hook.id}`, 'member')).status).toBe(403)
    expect((await api(h, 'DELETE', `/v1/chat/hooks/${hook.id}`, 'stranger')).status).toBe(404)
  })

  it('accepts https receivers only', async () => {
    const response = await api(h, 'POST', '/v1/chat/hooks', 'owner', { ...NEW_HOOK, url: 'http://hooks.example.com/in' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'not_https', field: 'url' })
  })

  it('refuses a private address', async () => {
    const response = await api(h, 'POST', '/v1/chat/hooks', 'owner', { ...NEW_HOOK, url: 'https://private.example.com/in' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'refused_address', field: 'url' })
  })

  it('refuses a PATCH to a private address', async () => {
    const { hook } = await createHook(h)
    const response = await api(h, 'PATCH', `/v1/chat/hooks/${hook.id}`, 'owner', { url: 'https://private.example.com/in' })
    expect(response.status).toBe(400)
    expect(await h.store.getHook(hook.id)).toMatchObject({ url: 'https://hooks.example.com/in' })
  })

  it('refuses an unknown event and an unknown field', async () => {
    expect(await (await api(h, 'POST', '/v1/chat/hooks', 'owner', { ...NEW_HOOK, events: ['channel.joined'] })).json())
      .toEqual({ error: 'unknown_event', field: 'events' })
    expect(await (await api(h, 'POST', '/v1/chat/hooks', 'owner', { ...NEW_HOOK, secret: 'x' })).json())
      .toEqual({ error: 'unknown_field', field: 'secret' })
  })

  it(`caps a channel at ${MAX_HOOKS_PER_CHANNEL} hooks`, async () => {
    for (let n = 0; n < MAX_HOOKS_PER_CHANNEL; n++) await createHook(h)
    const response = await api(h, 'POST', '/v1/chat/hooks', 'owner', NEW_HOOK)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'too_many_hooks' })
  })

  it('refuses an archived or unknown channel', async () => {
    expect((await api(h, 'POST', '/v1/chat/hooks', 'owner', { ...NEW_HOOK, channel: ARCHIVED })).status).toBe(403)
    expect((await api(h, 'POST', '/v1/chat/hooks', 'owner', { ...NEW_HOOK, channel: 'dm-1' })).status).toBe(404)
  })

  it('edits filters and events, and turns a hook off and on', async () => {
    const { hook } = await createHook(h)
    const edited = await (await api(h, 'PATCH', `/v1/chat/hooks/${hook.id}`, 'owner', {
      events: ['message.posted', 'thread.reply'],
      mentionsOnly: true,
      includeIntegrations: true
    })).json()
    expect(edited.hook).toMatchObject({ events: ['message.posted', 'thread.reply'], mentionsOnly: true, peopleOnly: false, includeIntegrations: true })
    const off = await (await api(h, 'PATCH', `/v1/chat/hooks/${hook.id}`, 'owner', { isEnabled: false })).json()
    expect(off.hook).toMatchObject({ disabledReason: 'manual', disabledOn: 5_000 })
    const on = await (await api(h, 'PATCH', `/v1/chat/hooks/${hook.id}`, 'owner', { isEnabled: true })).json()
    expect(on.hook).toMatchObject({ disabledOn: null, disabledReason: null })
  })

  it('deletes a hook with 204', async () => {
    const { hook } = await createHook(h)
    const response = await api(h, 'DELETE', `/v1/chat/hooks/${hook.id}`)
    expect(response.status).toBe(204)
    expect(await h.store.getHook(hook.id)).toBeUndefined()
    expect(h.changed.at(-1)).toBeUndefined()
  })

  it('sends a test event, then rate-limits after 3', async () => {
    const { hook } = await createHook(h)
    for (let n = 0; n < 3; n++) {
      const response = await api(h, 'POST', `/v1/chat/hooks/${hook.id}/test`)
      expect(await response.json()).toEqual({ status: 200, error: null, durationMs: 12, responseStart: 'ok' })
    }
    const limited = await api(h, 'POST', `/v1/chat/hooks/${hook.id}/test`)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('10')
  })

  it('reads the delivery log', async () => {
    const { hook } = await createHook(h)
    await api(h, 'POST', `/v1/chat/hooks/${hook.id}/test`)
    const log = await (await api(h, 'GET', `/v1/chat/hooks/${hook.id}/log`)).json()
    expect(log.attempts).toMatchObject([{ event: 'test', status: 200, error: null }])
  })
})
