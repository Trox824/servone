import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { TrackerInputError } from '../../tracker/issues'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import { createMailHandler, type MailHttpDeps } from '../http'

const WORKSPACE = 'ws-1' as WorkspaceUuid
const FRONT = 'https://platform.servone.app'
const caller: Caller = { account: 'acc' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User }

function deps (overrides: Partial<MailHttpDeps>): MailHttpDeps {
  return {
    frontUrl: FRONT,
    buckets: new TokenBuckets(5, 1 / 60),
    now: () => 0,
    authenticate: async () => caller,
    checkLogin: async () => ({ isOk: true }),
    connect: async () => ({ account: 'card-1' }),
    reconnect: async () => ({ account: 'card-1' }),
    disconnect: async () => {},
    send: async () => ({ messageId: '<x@y>' }),
    saveDraft: async () => ({ isOk: true }),
    fetchBody: async () => ({ isOk: true }),
    startOAuth: () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' }),
    completeOAuth: async () => ({ isOk: true }),
    setup: async () => {},
    createTask: async () => ({ issue: 'i-1', identifier: 'SRV-1' }),
    report: () => {},
    ...overrides
  }
}

interface Harness {
  base: string
  close: () => Promise<void>
}

async function start (overrides: Partial<MailHttpDeps>): Promise<Harness> {
  const handler = createMailHandler(deps(overrides))
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

async function post (base: string, path: string, body: Record<string, string | boolean>, authorization = 'Bearer token'): Promise<Response> {
  return await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(body)
  })
}

describe('mail http', () => {
  it('refuses callers without a session token', async () => {
    const h = await start({ authenticate: async () => undefined })
    const response = await post(h.base, '/mail/test', {})
    expect(response.status).toBe(401)
    await h.close()
  })

  it('tests a login and reports an auth failure plainly', async () => {
    const h = await start({ checkLogin: async () => ({ isOk: false, reason: 'auth', detail: 'Invalid credentials' }) })
    const response = await post(h.base, '/mail/test', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ isOk: false, reason: 'auth', detail: 'Invalid credentials' })
    await h.close()
  })

  it('connects only after a successful login check', async () => {
    const connect = jest.fn(async () => ({ account: 'card-1' }))
    const h = await start({ connect, checkLogin: async () => ({ isOk: false, reason: 'network', detail: 'ETIMEDOUT' }) })
    const response = await post(h.base, '/mail/connect', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(200)
    expect(connect).not.toHaveBeenCalled()
    await h.close()
  })

  it('reconnects an existing account without a prior test call', async () => {
    const reconnect = jest.fn(async () => ({ account: 'card-1' }))
    const h = await start({ reconnect })
    const response = await post(h.base, '/mail/reconnect', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ account: 'card-1' })
    expect(reconnect).toHaveBeenCalledWith(caller, expect.objectContaining({ provider: 'gmail', email: 'a@gmail.com' }))
    await h.close()
  })

  it('refuses callers without a session token on reconnect', async () => {
    const h = await start({ authenticate: async () => undefined })
    const response = await post(h.base, '/mail/reconnect', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(401)
    await h.close()
  })

  it('rate limits reconnect attempts on the same bucket as connect', async () => {
    const h = await start({})
    const body = { provider: 'gmail', email: 'a@gmail.com', password: 'x' }
    for (let i = 0; i < 5; i++) await post(h.base, '/mail/reconnect', body)
    const limited = await post(h.base, '/mail/reconnect', body)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    await h.close()
  })

  it('rejects a malformed reconnect body with 400', async () => {
    const h = await start({})
    const response = await post(h.base, '/mail/reconnect', { provider: 'gmail', email: 'not-an-email', password: 'x' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_email' })
    await h.close()
  })

  it('answers 400 for a reconnect whose email does not match the account', async () => {
    const h = await start({ reconnect: async () => ({ error: 'mailbox_mismatch' }) })
    const response = await post(h.base, '/mail/reconnect', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'mailbox_mismatch' })
    await h.close()
  })

  it('answers 404 for a reconnect with no existing account', async () => {
    const h = await start({ reconnect: async () => ({ error: 'not_found' }) })
    const response = await post(h.base, '/mail/reconnect', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
    await h.close()
  })

  it('surfaces a rejected reconnect password as a plain login check', async () => {
    const h = await start({ reconnect: async () => ({ isOk: false, reason: 'auth', detail: 'Invalid credentials' }) })
    const response = await post(h.base, '/mail/reconnect', { provider: 'gmail', email: 'a@gmail.com', password: 'x' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ isOk: false, reason: 'auth', detail: 'Invalid credentials' })
    await h.close()
  })

  it('rate limits login attempts per account', async () => {
    const h = await start({})
    const body = { provider: 'gmail', email: 'a@gmail.com', password: 'x' }
    for (let i = 0; i < 5; i++) await post(h.base, '/mail/test', body)
    const limited = await post(h.base, '/mail/test', body)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    await h.close()
  })

  it('never reports the password', async () => {
    const report = jest.fn()
    const h = await start({ report })
    await post(h.base, '/mail/connect', { provider: 'gmail', email: 'a@gmail.com', password: 'secret-pass' })
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret-pass')
    await h.close()
  })

  it('allows CORS only from the front origin', async () => {
    const h = await start({})
    const allowed = await fetch(`${h.base}/mail/test`, { method: 'OPTIONS', headers: { Origin: FRONT } })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(FRONT)
    await h.close()
  })

  it('disconnects and reports without leaking the body', async () => {
    const disconnect = jest.fn(async () => {})
    const h = await start({ disconnect })
    const response = await post(h.base, '/mail/disconnect', { deleteMail: false })
    expect(response.status).toBe(200)
    expect(disconnect).toHaveBeenCalledWith(caller, false)
    await h.close()
  })

  it('sends a draft and reports not_found for a missing account', async () => {
    const h = await start({ send: async () => ({ error: 'not_found' }) })
    const response = await post(h.base, '/mail/send', { draft: 'card-1' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
    await h.close()
  })

  it('rate limits sends per account', async () => {
    const send = jest.fn(async () => ({ messageId: '<x@y>' }))
    const h = await start({ send })
    for (let i = 0; i < 10; i++) expect((await post(h.base, '/mail/send', { draft: 'card-1' })).status).toBe(200)
    const limited = await post(h.base, '/mail/send', { draft: 'card-1' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    expect(send).toHaveBeenCalledTimes(10)
    await h.close()
  })

  it('answers 500 with a code when a dependency throws, without echoing the error', async () => {
    const report = jest.fn()
    const h = await start({ report, connect: async () => { throw new Error('LOGIN linh secret-pass') } })
    const response = await post(h.base, '/mail/connect', { provider: 'gmail', email: 'a@gmail.com', password: 'secret-pass' })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret-pass')
    await h.close()
  })

  it('rejects an unknown path', async () => {
    const h = await start({})
    const response = await post(h.base, '/mail/unknown', {})
    expect(response.status).toBe(404)
    await h.close()
  })

  it('returns the consent url to an authenticated caller', async () => {
    const h = await start({})
    const response = await post(h.base, '/mail/oauth/start', { provider: 'gmail' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' })
    await h.close()
  })

  it('answers 404 when no Google client is configured', async () => {
    const h = await start({ startOAuth: () => ({ error: 'oauth_unavailable' }) })
    const response = await post(h.base, '/mail/oauth/start', { provider: 'gmail' })
    expect(response.status).toBe(404)
    await h.close()
  })

  it('redirects the oauth callback back to the app with the outcome', async () => {
    const completeOAuth = jest.fn(async () => ({ isOk: true as const }))
    const h = await start({ completeOAuth, authenticate: async () => undefined })
    const response = await fetch(`${h.base}/mail/oauth/callback?state=st&code=cd`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`${FRONT}/?mail=connected`)
    expect(completeOAuth).toHaveBeenCalledWith('st', 'cd')
    await h.close()
  })

  it('reports a denied consent without exchanging anything', async () => {
    const completeOAuth = jest.fn(async () => ({ isOk: true as const }))
    const h = await start({ completeOAuth })
    const response = await fetch(`${h.base}/mail/oauth/callback?error=access_denied&state=st`, { redirect: 'manual' })
    expect(response.headers.get('location')).toBe(`${FRONT}/?mail=denied`)
    expect(completeOAuth).not.toHaveBeenCalled()
    await h.close()
  })

  it('saves a draft to the provider', async () => {
    const saveDraft = jest.fn(async () => ({ isOk: true as const }))
    const h = await start({ saveDraft })
    const response = await post(h.base, '/mail/draft', { draft: 'd-1' })
    expect(response.status).toBe(200)
    expect(saveDraft).toHaveBeenCalledWith(caller, 'd-1')
    await h.close()
  })

  it('rejects a draft call without an id', async () => {
    const h = await start({})
    const response = await post(h.base, '/mail/draft', {})
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_draft' })
    await h.close()
  })

  it('fetches a body on demand and answers 404 for a message outside the mailbox', async () => {
    const h = await start({ fetchBody: async () => ({ error: 'not_found' as const }) })
    const response = await post(h.base, '/mail/body', { message: 'm-9' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
    await h.close()
  })

  it('creates a task from a message as the caller', async () => {
    const createTask = jest.fn(async () => ({ issue: 'i-1', identifier: 'SRV-12' }))
    const h = await start({ createTask })
    const response = await post(h.base, '/mail/task', { message: 'm-1', project: 'SRV', title: 'Báo giá' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ issue: 'i-1', identifier: 'SRV-12' })
    expect(createTask).toHaveBeenCalledWith(caller, 'Bearer token', { message: 'm-1', project: 'SRV', title: 'Báo giá' })
    await h.close()
  })

  it('rejects a task without a title', async () => {
    const h = await start({})
    const response = await post(h.base, '/mail/task', { message: 'm-1', project: 'SRV', title: '  ' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_task' })
    await h.close()
  })

  it('answers 404 for a message outside the mailbox', async () => {
    const h = await start({ createTask: async () => ({ error: 'not_found' }) })
    const response = await post(h.base, '/mail/task', { message: 'm-9', project: 'SRV', title: 'x' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
    await h.close()
  })

  it('answers 400 for a draft message', async () => {
    const h = await start({ createTask: async () => ({ error: 'invalid_message' }) })
    const response = await post(h.base, '/mail/task', { message: 'm-1', project: 'SRV', title: 'x' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_message' })
    await h.close()
  })

  it('rate limits /mail/task on its own bucket, not the login bucket', async () => {
    const h = await start({})
    const loginBody = { provider: 'gmail', email: 'a@gmail.com', password: 'x' }
    for (let i = 0; i < 5; i++) await post(h.base, '/mail/test', loginBody)
    expect((await post(h.base, '/mail/test', loginBody)).status).toBe(429)
    const response = await post(h.base, '/mail/task', { message: 'm-1', project: 'SRV', title: 'x' })
    expect(response.status).toBe(200)
    await h.close()
  })

  it('rate limits autosave on its own bucket, not the send bucket', async () => {
    const h = await start({})
    for (let i = 0; i < 10; i++) await post(h.base, '/mail/send', { draft: 'd-1' })
    expect((await post(h.base, '/mail/send', { draft: 'd-1' })).status).toBe(429)
    const response = await post(h.base, '/mail/draft', { draft: 'd-1' })
    expect(response.status).toBe(200)
    await h.close()
  })

  it('answers 400 with the tracker field for an unresolved project', async () => {
    const h = await start({
      createTask: async () => { throw new TrackerInputError('Project XYZ not found. Known: SRV', 'project', 'not_found') }
    })
    const response = await post(h.base, '/mail/task', { message: 'm-1', project: 'XYZ', title: 'x' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'not_found', field: 'project', message: 'Project XYZ not found. Known: SRV' })
    await h.close()
  })

  it('installs the mail app for any signed-in member', async () => {
    const setup = jest.fn(async () => {})
    const h = await start({ setup })
    const response = await post(h.base, '/mail/setup', {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ isOk: true })
    expect(setup).toHaveBeenCalledWith(caller)
    await h.close()
  })
})
