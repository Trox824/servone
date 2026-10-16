import type { Channel, ChatMessage } from '@hcengineering/chunter'
import { AccountRole, type AccountUuid, type Markup, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import type { Caller } from '../auth'
import type { Delivery, OutgoingPost } from '../post'
import { BURST, RejectedCalls, TokenBuckets } from '../rate'
import { type ChannelAccess, createRequestHandler, MAX_BODY_BYTES } from '../server'
import { HookStore, type StoredHook, THREAD_TTL_MS } from '../store'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const WORKSPACE = 'ws-1' as WorkspaceUuid
const OTHER_WORKSPACE = 'ws-2' as WorkspaceUuid
const CHANNEL = 'chunter:space:General' as Ref<Channel>
const FRONT = 'https://app.servone.vn'
const OWNER = 'owner' as AccountUuid
const MEMBER = 'member' as AccountUuid

class MemoryKv implements KeyValueClient {
  readonly values = new Map<string, string>()

  async setValue<T>(key: string, value: T): Promise<void> {
    this.values.set(key, JSON.stringify(value))
  }

  async getValue<T>(key: string): Promise<T | null> {
    const stored = this.values.get(key)
    return stored === undefined ? null : (JSON.parse(stored) as T)
  }

  async deleteKey (key: string): Promise<void> {
    this.values.delete(key)
  }

  async listKeys (prefix?: string): Promise<ListResult | null> {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(prefix ?? ''))
    return { keys, count: keys.length, namespace: 'test' }
  }
}

const callers: Record<string, Caller> = {
  owner: { account: OWNER, workspace: WORKSPACE, role: AccountRole.User },
  member: { account: MEMBER, workspace: WORKSPACE, role: AccountRole.User },
  maintainer: { account: 'boss' as AccountUuid, workspace: WORKSPACE, role: AccountRole.Maintainer },
  stranger: { account: OWNER, workspace: OTHER_WORKSPACE, role: AccountRole.Owner }
}

interface Harness {
  base: string
  kv: MemoryKv
  delivered: Array<{ hook: StoredHook, message: Markup, post: OutgoingPost }>
  channel: { access: ChannelAccess | undefined }
  deliveryFails: { value: boolean }
  deleted: Set<string>
  events: string[]
  resolvedTokens: string[][]
  clock: { now: number }
  rejected: RejectedCalls
  close: () => Promise<void>
}

async function start (): Promise<Harness> {
  const kv = new MemoryKv()
  const delivered: Harness['delivered'] = []
  const channel: Harness['channel'] = { access: { owners: [OWNER], archived: false } }
  const deliveryFails = { value: false }
  const events: string[] = []
  const deleted = new Set<string>()
  const resolvedTokens: string[][] = []
  const clock = { now: 1000 }
  const rejected = new RejectedCalls()
  let nextMessage = 1
  const posted = new Set<string>()
  const handler = createRequestHandler({
    store: new HookStore(kv),
    buckets: new TokenBuckets(),
    publicUrl: 'https://hooks.servone.vn',
    frontUrl: FRONT,
    now: () => clock.now,
    rejected,
    authenticate: async (authorization) => callers[(authorization ?? '').replace('Bearer ', '')],
    findChannel: async (workspace, id) => (workspace === WORKSPACE && id === CHANNEL ? channel.access : undefined),
    deliver: async (hook, post): Promise<Delivery> => {
      if (deliveryFails.value) throw new Error('transactor down')
      if (channel.access === undefined || channel.access.archived) return { isPosted: false, reason: 'channel_closed' }
      if (post.replyTo !== undefined && (!posted.has(post.replyTo) || deleted.has(post.replyTo))) {
        return { isPosted: false, reason: 'parent_missing' }
      }
      const messageId = `msg-${nextMessage++}` as Ref<ChatMessage>
      posted.add(messageId)
      delivered.push({ hook, message: post.message, post })
      return { isPosted: true, messageId }
    },
    resolveMentions: async (_hook, tokens) => {
      resolvedTokens.push(tokens)
      return new Map()
    },
    report: (event, fields) => {
      events.push(`${event} ${JSON.stringify(fields)}`)
    }
  })
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    kv,
    delivered,
    channel,
    deliveryFails,
    deleted,
    events,
    resolvedTokens,
    clock,
    rejected,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

async function createHook (h: Harness, as = 'owner', name = 'CI'): Promise<{ id: string, url: string, slackUrl: string }> {
  const response = await fetch(`${h.base}/v1/channels/${encodeURIComponent(CHANNEL)}/hooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${as}` },
    body: JSON.stringify({ name })
  })
  expect(response.status).toBe(201)
  return await response.json()
}

async function call (url: string, body: string): Promise<Response> {
  return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

async function flush (): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('webhook service', () => {
  let h: Harness
  beforeEach(async () => {
    h = await start()
  })
  afterEach(async () => {
    await h.close()
  })

  it('posts a message through a new hook and logs the call', async () => {
    const { url, id } = await createHook(h)
    expect(url).toMatch(/^https:\/\/hooks\.servone\.vn\/v1\/hooks\/[A-Za-z0-9]{12}\/[A-Za-z0-9_-]{43}$/)
    const path = new URL(url).pathname

    const response = await call(`${h.base}${path}`, JSON.stringify({ text: 'Deploy **done**' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, messageId: 'msg-1' })
    expect(h.delivered).toHaveLength(1)
    expect(h.delivered[0].hook.name).toBe('CI')

    await flush()
    const log = await fetch(`${h.base}/v1/hooks/${id}/log`, { headers: { Authorization: 'Bearer owner' } })
    expect(await log.json()).toEqual({ calls: [{ at: 1000, status: 200 }] })
  })

  it('stores only the secret hash', async () => {
    const { url, id } = await createHook(h)
    const secret = url.split('/').pop() ?? ''
    const stored = [...h.kv.values.values()].join('\n')
    expect(stored).not.toContain(secret)
    expect(stored).toContain(id)
  })

  it('answers 404 alike for an unknown hook and a wrong secret', async () => {
    const { id } = await createHook(h)
    const wrongSecret = await call(`${h.base}/v1/hooks/${id}/${'A'.repeat(43)}`, '{"text":"x"}')
    const unknownHook = await call(`${h.base}/v1/hooks/${'B'.repeat(12)}/${'A'.repeat(43)}`, '{"text":"x"}')
    expect(wrongSecret.status).toBe(404)
    expect(unknownHook.status).toBe(404)
    expect(await wrongSecret.json()).toEqual(await unknownHook.json())
    expect(h.delivered).toHaveLength(0)
  })

  it('rejects bad payloads with the failing field', async () => {
    const { url } = await createHook(h)
    const path = new URL(url).pathname
    const bad = await call(`${h.base}${path}`, JSON.stringify({ text: 'hi', color: 'red' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid_color', field: 'color' })
    const notJson = await call(`${h.base}${path}`, 'text=hi')
    expect(await notJson.json()).toEqual({ error: 'invalid_json', field: 'body' })
  })

  it('rejects bodies over 16 KB before touching the store', async () => {
    const { url } = await createHook(h)
    const reads = jest.spyOn(h.kv, 'getValue')
    const response = await call(`${h.base}${new URL(url).pathname}`, JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'too_large', field: 'body' })
    expect(reads).not.toHaveBeenCalled()
  })

  it('rate limits per hook with Retry-After', async () => {
    const { url } = await createHook(h)
    const target = `${h.base}${new URL(url).pathname}`
    for (let i = 0; i < BURST; i++) {
      expect((await call(target, '{"text":"x"}')).status).toBe(200)
    }
    const limited = await call(target, '{"text":"x"}')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('1')
  })

  it('answers 403 once revoked', async () => {
    const { url, id } = await createHook(h)
    const revoke = await fetch(`${h.base}/v1/hooks/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
    expect(revoke.status).toBe(200)
    const response = await call(`${h.base}${new URL(url).pathname}`, '{"text":"x"}')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'revoked' })
  })

  it('answers 403 when the channel is archived and 502 when the transactor fails', async () => {
    const { url } = await createHook(h)
    const target = `${h.base}${new URL(url).pathname}`
    h.deliveryFails.value = true
    expect((await call(target, '{"text":"x"}')).status).toBe(502)
    h.deliveryFails.value = false
    h.channel.access = { owners: [OWNER], archived: true }
    expect((await call(target, '{"text":"x"}')).status).toBe(403)
  })

  it('never reports the secret', async () => {
    const { url } = await createHook(h)
    const secret = url.split('/').pop() ?? ''
    h.deliveryFails.value = true
    await call(`${h.base}${new URL(url).pathname}`, '{"text":"x"}')
    await call(`${h.base}${new URL(url).pathname}`, '{"text":1}')
    expect(h.events.join('\n')).not.toContain(secret)
  })

  it('lets owners and maintainers manage hooks, not members or other workspaces', async () => {
    expect((await createHook(h, 'maintainer')).id).toHaveLength(12)
    const byMember = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`, {
      method: 'POST',
      headers: { Authorization: 'Bearer member' },
      body: JSON.stringify({ name: 'x' })
    })
    expect(byMember.status).toBe(403)
    const { id } = await createHook(h)
    const listByMember = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`, { headers: { Authorization: 'Bearer member' } })
    expect(listByMember.status).toBe(403)
    const revokeByStranger = await fetch(`${h.base}/v1/hooks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer stranger' }
    })
    expect(revokeByStranger.status).toBe(404)
    const noToken = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`)
    expect(noToken.status).toBe(401)
  })

  it('lists hooks with creator and last call, newest first, without secrets', async () => {
    const first = await createHook(h, 'owner', 'First')
    await call(`${h.base}${new URL(first.url).pathname}`, '{"text":"x"}')
    await flush()
    const response = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`, { headers: { Authorization: 'Bearer owner' } })
    const body = await response.json()
    expect(body).toEqual({
      hooks: [
        {
          id: first.id,
          name: 'First',
          createdBy: OWNER,
          createdOn: 1000,
          revokedOn: null,
          allowMentions: false,
          rateLimitedOn: null,
          lastCall: { at: 1000, status: 200 }
        }
      ]
    })
  })

  it('validates the hook name', async () => {
    const response = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner' },
      body: JSON.stringify({ name: '  ' })
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'empty', field: 'name' })
  })

  it('allows CORS only from the front origin', async () => {
    const allowed = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`, { method: 'OPTIONS', headers: { Origin: FRONT } })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(FRONT)
    const other = await fetch(`${h.base}/v1/channels/${CHANNEL}/hooks`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' }
    })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
  it('posts Slack bodies on the /slack address and answers plain ok', async () => {
    const { url } = await createHook(h)
    const path = `${new URL(url).pathname}/slack`

    const response = await call(`${h.base}${path}`, JSON.stringify({ text: 'Build *green*' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe('ok')
    expect(h.delivered).toHaveLength(1)
  })

  it('answers Slack-style text errors on /slack', async () => {
    const { url, id } = await createHook(h)
    const path = `${new URL(url).pathname}/slack`

    const bad = await call(`${h.base}${path}`, '{nope')
    expect([bad.status, await bad.text()]).toEqual([400, 'invalid_payload'])
    const empty = await call(`${h.base}${path}`, JSON.stringify({ username: 'x' }))
    expect([empty.status, await empty.text()]).toEqual([400, 'no_text'])
    const wrong = await call(`${h.base}/v1/hooks/${id}/${'A'.repeat(43)}/slack`, '{"text":"x"}')
    expect([wrong.status, await wrong.text()]).toEqual([404, 'no_service'])
    const huge = await call(`${h.base}${path}`, JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES) }))
    expect([huge.status, await huge.text()]).toEqual([413, 'request_too_large'])

    await fetch(`${h.base}/v1/hooks/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
    const revoked = await call(`${h.base}${path}`, '{"text":"x"}')
    expect(revoked.headers.get('content-type')).toContain('text/plain')
    expect([revoked.status, await revoked.text()]).toEqual([410, 'no_service'])
  })

  it('answers channel_is_archived on /slack for a closed channel', async () => {
    const { url } = await createHook(h)
    if (h.channel.access !== undefined) h.channel.access.archived = true
    const response = await call(`${h.base}${new URL(url).pathname}/slack`, '{"text":"x"}')
    expect([response.status, await response.text()]).toEqual([403, 'channel_is_archived'])
  })

  it('returns the Slack URL when a hook is created', async () => {
    const created: { url: string, slackUrl: string } = await createHook(h)
    expect(created.slackUrl).toBe(`${created.url}/slack`)
  })

  it('passes the color from both endpoints', async () => {
    const { url } = await createHook(h)
    const path = new URL(url).pathname
    await call(`${h.base}${path}`, JSON.stringify({ text: 'a', color: 'good' }))
    await call(`${h.base}${path}/slack`, JSON.stringify({ text: 'b', attachments: [{ color: 'danger' }] }))
    expect(h.delivered.map((d) => d.post.color)).toEqual(['good', 'danger'])
  })

  it('threads follow-ups with the same thread_key and broadcasts on request', async () => {
    const { url } = await createHook(h)
    const path = new URL(url).pathname
    await call(`${h.base}${path}`, JSON.stringify({ text: 'started', thread_key: 'b-1' }))
    await call(`${h.base}${path}`, JSON.stringify({ text: 'step', thread_key: 'b-1' }))
    await call(`${h.base}${path}/slack`, JSON.stringify({ text: 'failed', thread_key: 'b-1', reply_broadcast: true }))
    await call(`${h.base}${path}`, JSON.stringify({ text: 'other', thread_key: 'b-2' }))

    expect(h.delivered.map((d) => [d.post.replyTo ?? null, d.post.broadcastOf ?? null])).toEqual([
      [null, null],
      ['msg-1', null],
      ['msg-1', null],
      [null, 'msg-1'],
      [null, null]
    ])
  })

  it('starts a new thread when the parent is gone', async () => {
    const { url } = await createHook(h)
    const path = new URL(url).pathname
    await call(`${h.base}${path}`, JSON.stringify({ text: 'first', thread_key: 'k' }))
    h.deleted.add('msg-1')
    await call(`${h.base}${path}`, JSON.stringify({ text: 'second', thread_key: 'k' }))
    await call(`${h.base}${path}`, JSON.stringify({ text: 'third', thread_key: 'k' }))
    expect(h.delivered.map((d) => d.post.replyTo ?? null)).toEqual([null, null, 'msg-2'])
  })

  it('never shares thread keys between hooks', async () => {
    const one = new URL((await createHook(h, 'owner', 'One')).url).pathname
    const two = new URL((await createHook(h, 'owner', 'Two')).url).pathname
    await call(`${h.base}${one}`, JSON.stringify({ text: 'a', thread_key: 'same' }))
    await call(`${h.base}${two}`, JSON.stringify({ text: 'b', thread_key: 'same' }))
    expect(h.delivered.map((d) => d.post.replyTo ?? null)).toEqual([null, null])
  })

  it('resolves mentions only when the hook allows them', async () => {
    const { url, id } = await createHook(h)
    const path = new URL(url).pathname
    await call(`${h.base}${path}`, JSON.stringify({ text: 'hi <!here>' }))
    expect(h.resolvedTokens).toEqual([])

    const patched = await fetch(`${h.base}/v1/hooks/${id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner' },
      body: JSON.stringify({ allowMentions: true })
    })
    expect(patched.status).toBe(200)
    await call(`${h.base}${path}`, JSON.stringify({ text: 'hi <!here>' }))
    expect(h.resolvedTokens).toEqual([['<!here>']])

    const list = await fetch(`${h.base}/v1/channels/${encodeURIComponent(CHANNEL)}/hooks`, {
      headers: { Authorization: 'Bearer owner' }
    })
    expect((await list.json()).hooks[0].allowMentions).toBe(true)
  })

  it('never changes settings of a revoked hook', async () => {
    const { id } = await createHook(h)
    await fetch(`${h.base}/v1/hooks/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
    const response = await fetch(`${h.base}/v1/hooks/${id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner' },
      body: JSON.stringify({ allowMentions: true })
    })
    expect(response.status).toBe(403)
    const stored = await new HookStore(h.kv).getHook(id)
    expect(stored?.revokedOn).toBeDefined()
    expect(stored?.allowMentions).toBeUndefined()
  })

  it('lets only managers change hook settings, with a strict body', async () => {
    const { id } = await createHook(h)
    const patch = async (as: string, body: string): Promise<number> =>
      (await fetch(`${h.base}/v1/hooks/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${as}` }, body }))
        .status
    expect(await patch('member', '{"allowMentions":true}')).toBe(403)
    expect(await patch('stranger', '{"allowMentions":true}')).toBe(404)
    expect(await patch('owner', '{"allowMentions":"yes"}')).toBe(400)
    expect(await patch('owner', '{"allowMentions":true,"x":1}')).toBe(400)
    expect(await patch('maintainer', '{"allowMentions":false}')).toBe(200)
  })

  it('logs rate-limited calls of a known hook with the next accepted call', async () => {
    const { url, id } = await createHook(h)
    const path = new URL(url).pathname
    for (let i = 0; i < BURST + 3; i++) await call(`${h.base}${path}`, '{"text":"x"}')
    await flush()
    h.clock.now = 11_000
    await call(`${h.base}${path}`, '{"text":"after"}')
    await flush()

    const log = await fetch(`${h.base}/v1/hooks/${id}/log`, { headers: { Authorization: 'Bearer owner' } })
    const { calls } = await log.json()
    expect(calls.slice(0, 2)).toEqual([
      { at: 11_000, status: 200 },
      { at: 11_000, status: 429, count: 3 }
    ])
    const list = await fetch(`${h.base}/v1/channels/${encodeURIComponent(CHANNEL)}/hooks`, { headers: { Authorization: 'Bearer owner' } })
    const [summary] = (await list.json()).hooks
    expect(summary.rateLimitedOn).toBe(11_000)
    expect(summary.lastCall).toEqual({ at: 11_000, status: 200 })
  })

  it('never logs rate-limited calls for unknown ids or wrong secrets', async () => {
    const { id } = await createHook(h)
    for (let i = 0; i < BURST + 3; i++) await call(`${h.base}/v1/hooks/${id}/${'A'.repeat(43)}`, '{"text":"x"}')
    expect(h.rejected.drain()).toEqual([])
  })

  it('never logs rate-limited wrong-secret calls after the hook was used once', async () => {
    const { url, id } = await createHook(h)
    expect((await call(`${h.base}${new URL(url).pathname}`, '{"text":"ok"}')).status).toBe(200)
    for (let i = 0; i < BURST + 3; i++) await call(`${h.base}/v1/hooks/${id}/${'A'.repeat(43)}`, '{"text":"x"}')
    expect(h.rejected.drain()).toEqual([])
  })

  it('answers a failed Slack call as plain text', async () => {
    const { url } = await createHook(h)
    jest.spyOn(h.kv, 'getValue').mockRejectedValueOnce(new Error('kvs down'))
    const response = await call(`${h.base}${new URL(url).pathname}/slack`, '{"text":"x"}')
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe('internal_error')
  })

  it('removes expired thread entries on lookup and in the sweep', async () => {
    const store = new HookStore(h.kv)
    const threadKeys = (): string[] => [...h.kv.values.keys()].filter((key) => key.startsWith('thread/'))
    await store.saveThread('hook-1', 'build-1', 'msg-1' as Ref<ChatMessage>, 0)
    await store.saveThread('hook-1', 'build-2', 'msg-2' as Ref<ChatMessage>, 0)
    await store.saveThread('hook-1', 'build-3', 'msg-3' as Ref<ChatMessage>, THREAD_TTL_MS)
    expect(await store.findThread('hook-1', 'build-1', THREAD_TTL_MS)).toBeUndefined()
    expect(threadKeys()).toHaveLength(2)
    await store.sweepExpiredThreads(THREAD_TTL_MS)
    expect(threadKeys()).toHaveLength(1)
    expect(await store.findThread('hook-1', 'build-3', THREAD_TTL_MS)).toBe('msg-3')
  })

  it('answers PATCH in the CORS preflight', async () => {
    const response = await fetch(`${h.base}/v1/hooks/x`, { method: 'OPTIONS', headers: { Origin: FRONT } })
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
  })
})
