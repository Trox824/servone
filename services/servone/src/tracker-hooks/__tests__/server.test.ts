import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { HostRefusedError } from '../../host-guard'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import { Dispatcher } from '../dispatcher'
import type { AttemptOutcome } from '../../outgoing/send'
import {
  createNotConfiguredHandler,
  createRequestHandler,
  MAX_HOOKS_PER_PROJECT,
  type ProjectAccess
} from '../server'
import { type StoredTrackerHook, TrackerHookStore } from '../store'
import { PROJECT, storedHook, WORKSPACE } from './fixtures'
import { MemoryKv } from './memory-kv'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const FRONT = 'https://app.servone.vn'
const OWNER = 'owner' as AccountUuid
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/

const callers: Record<string, Caller> = {
  owner: { account: OWNER, workspace: WORKSPACE, role: AccountRole.User },
  member: { account: 'member' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User },
  maintainer: { account: 'boss' as AccountUuid, workspace: WORKSPACE, role: AccountRole.Maintainer },
  stranger: { account: OWNER, workspace: 'ws-2' as WorkspaceUuid, role: AccountRole.Owner }
}

interface Harness {
  base: string
  store: TrackerHookStore
  sealed: Array<{ hookId: string, secret: string }>
  tested: StoredTrackerHook[]
  changed: Array<StoredTrackerHook | undefined>
  close: () => Promise<void>
}

const TEST_OUTCOME: AttemptOutcome = { status: 500, durationMs: 12, responseStart: 'nope' }

async function listen (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Promise<{ base: string, close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

async function start (): Promise<Harness> {
  const store = new TrackerHookStore(new MemoryKv())
  const sealed: Harness['sealed'] = []
  const tested: StoredTrackerHook[] = []
  const changed: Harness['changed'] = []
  const project: ProjectAccess = { owners: [OWNER] }
  const dispatcher = new Dispatcher({
    store,
    send: async () => TEST_OUTCOME,
    notifyDisabled: async () => {},
    onHookChanged: (_id, hook) => {
      changed.push(hook)
    },
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
    findProject: async (workspace, id) => (workspace === WORKSPACE && id === PROJECT ? project : undefined),
    resolveHost: async (host) => {
      if (host === 'private.example.com') throw new HostRefusedError('refused_address', 'private')
      if (host === 'missing.example.com') throw new HostRefusedError('unresolvable_host', 'missing')
      return '203.0.113.10'
    },
    sealSecret: (workspace, hookId, secret) => {
      sealed.push({ hookId, secret })
      return { keyId: 'k1', iv: 'iv', tag: 'tag', data: `${workspace}:${hookId}` }
    },
    sendTest: async (hook) => {
      tested.push(hook)
      return await dispatcher.sendTest(hook, `test-${tested.length}`, '{}')
    },
    report: () => {}
  })
  const { base, close } = await listen(handler)
  return { base, store, sealed, tested, changed, close }
}

const hooksPath = (project: string = PROJECT): string => `/v1/tracker/projects/${encodeURIComponent(project)}/hooks`

async function api (h: Harness, method: string, path: string, as = 'owner', body?: object | string): Promise<Response> {
  return await fetch(`${h.base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  })
}

async function createHook (h: Harness, as = 'owner'): Promise<{ id: string, secret: string }> {
  const response = await api(h, 'POST', hooksPath(), as, { url: 'https://hooks.example.com/in', events: ['issue.created'] })
  expect(response.status).toBe(201)
  return await response.json()
}

describe('tracker hooks API', () => {
  let h: Harness
  beforeEach(async () => {
    h = await start()
  })
  afterEach(async () => {
    await h.close()
  })

  it('creates a hook, returns its secret once and lists it without the secret', async () => {
    const { id, secret } = await createHook(h)
    expect(secret).toMatch(SECRET_PATTERN)
    expect(h.sealed).toEqual([{ hookId: id, secret }])
    expect(h.changed.map((hook) => hook?.id)).toEqual([id])

    const response = await api(h, 'GET', hooksPath())
    expect(response.status).toBe(200)
    const listed = await response.json()
    expect(listed).toEqual({
      hooks: [
        {
          id,
          url: 'https://hooks.example.com/in',
          events: ['issue.created'],
          createdBy: OWNER,
          createdOn: 5_000,
          disabledOn: null,
          disabledReason: null,
          consecutiveFailures: 0,
          lastAttempt: null
        }
      ]
    })
    expect(JSON.stringify(listed)).not.toContain(secret)
  })

  it('refuses a caller without a session token', async () => {
    const response = await api(h, 'GET', hooksPath(), 'api-token')
    expect(response.status).toBe(401)
  })

  it('refuses a plain member', async () => {
    expect((await api(h, 'GET', hooksPath(), 'member')).status).toBe(403)
    const { id } = await createHook(h)
    expect((await api(h, 'DELETE', `/v1/tracker/hooks/${id}`, 'member')).status).toBe(403)
  })

  it('lets a Maintainer who is not an owner manage hooks', async () => {
    await createHook(h, 'maintainer')
    expect((await api(h, 'GET', hooksPath(), 'maintainer')).status).toBe(200)
  })

  it('answers 404 for a project or hook of another workspace', async () => {
    const { id } = await createHook(h)
    expect((await api(h, 'GET', hooksPath(), 'stranger')).status).toBe(404)
    expect((await api(h, 'GET', `/v1/tracker/hooks/${id}/log`, 'stranger')).status).toBe(404)
    expect((await api(h, 'GET', hooksPath('tracker:project:Other'))).status).toBe(404)
  })

  it.each([
    [{ url: 'http://hooks.example.com/in', events: ['issue.created'] }, 'not_https', 'url'],
    [{ url: 'https://user:pass@hooks.example.com/in', events: ['issue.created'] }, 'has_credentials', 'url'],
    [{ url: `https://hooks.example.com/${'a'.repeat(2048)}`, events: ['issue.created'] }, 'too_long', 'url'],
    [{ url: 'not a url', events: ['issue.created'] }, 'invalid_url', 'url'],
    [{ url: 'https://hooks.example.com/in', events: [] }, 'empty', 'events'],
    [{ url: 'https://hooks.example.com/in', events: ['issue.moved'] }, 'unknown_event', 'events'],
    [{ url: 'https://hooks.example.com/in' }, 'missing_field', 'events'],
    [{ url: 'https://hooks.example.com/in', events: ['issue.created'], secret: 'x' }, 'unknown_field', 'secret'],
    [{ url: 'https://private.example.com/in', events: ['issue.created'] }, 'refused_address', 'url'],
    [{ url: 'https://missing.example.com/in', events: ['issue.created'] }, 'unresolvable_host', 'url']
  ])('refuses %j with %s', async (body, error, field) => {
    const response = await api(h, 'POST', hooksPath(), 'owner', body)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error, field })
    expect(await h.store.listProjectHooks(WORKSPACE, PROJECT)).toEqual([])
  })

  it('refuses a body that is not JSON', async () => {
    const response = await api(h, 'POST', hooksPath(), 'owner', '{')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_json', field: 'body' })
  })

  it(`stops at ${MAX_HOOKS_PER_PROJECT} hooks per project`, async () => {
    for (let n = 0; n < MAX_HOOKS_PER_PROJECT; n++) await createHook(h)
    const response = await api(h, 'POST', hooksPath(), 'owner', { url: 'https://hooks.example.com/in', events: ['issue.created'] })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'too_many_hooks' })
  })

  it('edits events and turns a hook off and back on with a clean count', async () => {
    const { id } = await createHook(h)
    let response = await api(h, 'PATCH', `/v1/tracker/hooks/${id}`, 'owner', { events: ['issue.deleted'], isEnabled: false })
    expect(response.status).toBe(200)
    expect((await response.json()).hook).toMatchObject({ events: ['issue.deleted'], disabledReason: 'manual', disabledOn: 5_000 })

    const current = await h.store.getHook(id)
    if (current === undefined) throw new Error('hook missing')
    await h.store.saveHook({ ...current, consecutiveFailures: 7 })
    response = await api(h, 'PATCH', `/v1/tracker/hooks/${id}`, 'owner', { isEnabled: true })
    expect(response.status).toBe(200)
    expect((await response.json()).hook).toMatchObject({ disabledOn: null, disabledReason: null, consecutiveFailures: 0 })
  })

  it('refuses a PATCH that tries to change the URL', async () => {
    const { id } = await createHook(h)
    const response = await api(h, 'PATCH', `/v1/tracker/hooks/${id}`, 'owner', { url: 'https://other.example.com/' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'unknown_field', field: 'url' })
  })

  it('deletes a hook with its log', async () => {
    const { id } = await createHook(h)
    await api(h, 'POST', `/v1/tracker/hooks/${id}/test`)
    const response = await api(h, 'DELETE', `/v1/tracker/hooks/${id}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(await h.store.getHook(id)).toBeUndefined()
    expect(await h.store.readLog(id)).toEqual([])
    expect((await api(h, 'GET', `/v1/tracker/hooks/${id}/log`)).status).toBe(404)
  })

  it('sends a test event, logs it and limits test sends per hook', async () => {
    const { id } = await createHook(h)
    await api(h, 'PATCH', `/v1/tracker/hooks/${id}`, 'owner', { isEnabled: false })
    const response = await api(h, 'POST', `/v1/tracker/hooks/${id}/test`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 500, error: null, durationMs: 12, responseStart: 'nope' })

    const log = await (await api(h, 'GET', `/v1/tracker/hooks/${id}/log`)).json()
    expect(log.attempts).toMatchObject([{ event: 'test', status: 500 }])
    const listed = await (await api(h, 'GET', hooksPath())).json()
    expect(listed.hooks[0].lastAttempt).toEqual({ at: 5_000, status: 500, error: null })

    await api(h, 'POST', `/v1/tracker/hooks/${id}/test`)
    await api(h, 'POST', `/v1/tracker/hooks/${id}/test`)
    const limited = await api(h, 'POST', `/v1/tracker/hooks/${id}/test`)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('10')
    expect(h.tested).toHaveLength(3)
  })

  it('answers a CORS preflight from the front with PATCH allowed', async () => {
    const response = await fetch(`${h.base}${hooksPath()}`, { method: 'OPTIONS', headers: { Origin: FRONT } })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(FRONT)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE')
  })

  it('answers 404 for an unknown path', async () => {
    expect((await api(h, 'GET', '/v1/tracker/nothing')).status).toBe(404)
  })

  it('reports the last attempt of a hook from its log', async () => {
    const hook = storedHook('AAAAAAAAAAAA', { createdOn: 1 })
    await h.store.saveHook(hook)
    await h.store.appendLog(hook.id, {
      at: 9,
      deliveryId: 'd',
      event: 'issue.created',
      attempt: 2,
      status: 0,
      error: 'timeout',
      durationMs: 10_000,
      responseStart: ''
    })
    const listed = await (await api(h, 'GET', hooksPath())).json()
    expect(listed.hooks[0].lastAttempt).toEqual({ at: 9, status: 0, error: 'timeout' })
  })
})

describe('tracker hooks API without TRACKER_HOOKS_KEYS', () => {
  it('answers 503 not_configured with CORS', async () => {
    const { base, close } = await listen(createNotConfiguredHandler(FRONT))
    try {
      const response = await fetch(`${base}${hooksPath()}`, { headers: { Origin: FRONT } })
      expect(response.status).toBe(503)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(FRONT)
      expect(await response.json()).toEqual({ error: 'not_configured' })
      const preflight = await fetch(`${base}${hooksPath()}`, { method: 'OPTIONS', headers: { Origin: FRONT } })
      expect(preflight.status).toBe(204)
    } finally {
      await close()
    }
  })
})
