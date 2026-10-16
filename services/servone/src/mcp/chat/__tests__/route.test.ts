import Anthropic from '@anthropic-ai/sdk'
import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

import { changeRecord, fakeSession } from '../../__tests__/fixtures'
import { CHAT_BUCKET_BURST, createChatLimiter } from '../limiter'
import type { ChatReply } from '../loop'
import { MAX_BODY_BYTES } from '../request'
import { type ChatCaller, type ChatRouteDeps, createChatRoute, type RunChat } from '../route'

const FRONT = 'https://front.servone.vn'
const WORKSPACE = 'ws-1' as WorkspaceUuid

const callers: Record<string, ChatCaller> = {
  admin: { token: 'admin', account: 'acc-admin' as AccountUuid, workspace: WORKSPACE, role: AccountRole.Maintainer },
  member: { token: 'member', account: 'acc-member' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User }
}

const DRAFT = changeRecord({
  summary: 'Xóa trường Ghi chú',
  risk: 'destructive',
  ops: [{ op: 'removeField', type: 'nghi-phep', field: 'ghi-chu' }],
  diff: [
    { text: 'Xóa trường *Ghi chú* khỏi *Đề nghị nghỉ phép*', risk: 'destructive', affected: 42 },
    { text: 'Đổi tên trường *Lý do*', risk: 'safe' }
  ],
  typeKeys: ['nghi-phep'],
  createdOn: 0
})

interface Harness {
  base: string
  sessions: ChatCaller[]
  reports: string[]
  close: () => Promise<void>
}

async function start (runChat: RunChat | undefined, overrides: Partial<ChatRouteDeps> = {}): Promise<Harness> {
  const sessions: ChatCaller[] = []
  const reports: string[] = []
  const route = createChatRoute({
    frontUrl: FRONT,
    authenticate: async (authorization) => callers[(authorization ?? '').replace('Bearer ', '')],
    session: async (caller) => {
      sessions.push(caller)
      return fakeSession()
    },
    runChat,
    limiter: createChatLimiter(),
    now: Date.now,
    report: (event) => {
      reports.push(event)
    },
    ...overrides
  })
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter((part) => part !== '')
    void route(req, res, path).then((isHandled) => {
      if (!isHandled) res.writeHead(404).end('next route')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sessions,
    reports,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

async function post (harness: Harness, token: string | undefined, body: string, signal?: AbortSignal): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: FRONT })
  if (token !== undefined) headers.set('Authorization', `Bearer ${token}`)
  return await fetch(`${harness.base}/studio/chat`, { method: 'POST', headers, body, signal })
}

function deferred<T> (): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const ASK = JSON.stringify({ messages: [{ role: 'user', text: 'Xóa trường Ghi chú' }], typeKey: 'nghi-phep' })
const REPLY: ChatReply = { reply: 'Kế hoạch đã sẵn sàng. Anh bấm "Áp dụng".', stop: 'done', drafts: [DRAFT] }

let harness: Harness | undefined

afterEach(async () => {
  await harness?.close()
  harness = undefined
})

describe('studio chat route', () => {
  it('answers the preflight for the Studio origin only', async () => {
    harness = await start(jest.fn())
    const fromFront = await fetch(`${harness.base}/studio/chat`, { method: 'OPTIONS', headers: { Origin: FRONT } })
    expect(fromFront.status).toBe(204)
    expect(fromFront.headers.get('access-control-allow-origin')).toBe(FRONT)
    expect(fromFront.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type')
    const fromElsewhere = await fetch(`${harness.base}/studio/chat`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    expect(fromElsewhere.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('leaves other paths to the next route', async () => {
    harness = await start(jest.fn())
    const response = await fetch(`${harness.base}/mcp`, { method: 'POST' })
    expect(await response.text()).toBe('next route')
  })

  it('refuses a missing or unknown token', async () => {
    harness = await start(jest.fn())
    expect((await post(harness, undefined, ASK)).status).toBe(401)
    const forged = await post(harness, 'forged', ASK)
    expect(forged.status).toBe(401)
    expect(await forged.json()).toEqual({ error: 'unauthorized' })
  })

  it('keeps non-maintainers away from the model', async () => {
    const runChat = jest.fn()
    harness = await start(runChat)
    const response = await post(harness, 'member', ASK)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
    expect(runChat).not.toHaveBeenCalled()
    expect(harness.sessions).toEqual([])
  })

  it('says when the assistant is not configured', async () => {
    harness = await start(undefined)
    const response = await post(harness, 'admin', ASK)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'not_configured' })
  })

  it('refuses bad bodies before opening a session', async () => {
    harness = await start(jest.fn())
    const broken = await post(harness, 'admin', '{')
    expect(await broken.json()).toEqual({ error: 'invalid_json' })
    const lastFromAssistant = await post(harness, 'admin', JSON.stringify({ messages: [{ role: 'assistant', text: 'a' }] }))
    expect(await lastFromAssistant.json()).toEqual({ error: 'invalid_request' })
    const huge = await post(harness, 'admin', JSON.stringify({ messages: [{ role: 'user', text: 'a'.repeat(MAX_BODY_BYTES) }] }))
    expect(huge.status).toBe(400)
    expect(await huge.json()).toEqual({ error: 'too_large' })
    expect(harness.sessions).toEqual([])
  })

  it('returns the reply and drafts, and nothing else', async () => {
    const runChat = jest.fn<Promise<ChatReply>, Parameters<RunChat>>(async () => REPLY)
    harness = await start(runChat)
    const response = await post(harness, 'admin', ASK)
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
    expect(await response.json()).toEqual({
      reply: REPLY.reply,
      stop: 'done',
      drafts: [
        {
          id: 'change-1',
          summary: 'Xóa trường Ghi chú',
          risk: 'destructive',
          diff: [
            { text: 'Xóa trường *Ghi chú* khỏi *Đề nghị nghỉ phép*', risk: 'destructive', affected: 42 },
            { text: 'Đổi tên trường *Lý do*', risk: 'safe', affected: null }
          ]
        }
      ]
    })
    expect(harness.sessions).toEqual([callers.admin])
    expect(runChat.mock.calls[0][1]).toEqual({ turns: [{ role: 'user', text: 'Xóa trường Ghi chú' }], typeKey: 'nghi-phep' })
  })

  it.each([
    ['a rate limit', new Anthropic.RateLimitError(429, undefined, 'rate limited', new Headers()), 429, 'rate_limited'],
    ['a connection failure', new Anthropic.APIConnectionError({ message: 'socket hang up' }), 502, 'model_unavailable'],
    ['a server error', new Anthropic.InternalServerError(500, undefined, 'overloaded', new Headers()), 502, 'model_unavailable']
  ])('maps model errors: %s', async (_, error, status, code) => {
    harness = await start(async () => {
      throw error
    })
    const response = await post(harness, 'admin', ASK)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
  })

  it('reports unexpected failures as internal, with CORS', async () => {
    harness = await start(async () => {
      throw new Error('bug')
    })
    const response = await post(harness, 'admin', ASK)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal' })
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
    expect(harness.reports).toEqual(['studio chat failed'])
  })

  it('refuses other methods', async () => {
    harness = await start(jest.fn())
    const response = await fetch(`${harness.base}/studio/chat`, { method: 'GET', headers: { Origin: FRONT } })
    expect(response.status).toBe(405)
  })

  it('keeps a second chat for the same account waiting instead of spending on it', async () => {
    const gate = deferred<void>()
    const called = deferred<void>()
    const runChat = jest.fn<Promise<ChatReply>, Parameters<RunChat>>(async () => {
      called.resolve()
      await gate.promise
      return REPLY
    })
    harness = await start(runChat)
    const first = post(harness, 'admin', ASK)
    await called.promise
    const second = await post(harness, 'admin', ASK)
    expect(second.status).toBe(429)
    expect(await second.json()).toEqual({ error: 'rate_limited' })
    gate.resolve()
    expect((await first).status).toBe(200)
    expect(runChat).toHaveBeenCalledTimes(1)
  })

  it('limits chat calls per account with a token bucket', async () => {
    const runChat = jest.fn<Promise<ChatReply>, Parameters<RunChat>>(async () => REPLY)
    harness = await start(runChat)
    for (let i = 0; i < CHAT_BUCKET_BURST; i++) {
      const response = await post(harness, 'admin', ASK)
      expect(response.status).toBe(200)
    }
    const limited = await post(harness, 'admin', ASK)
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
    expect(runChat).toHaveBeenCalledTimes(CHAT_BUCKET_BURST)
  })

  it('stops the chat when the client leaves, without reporting it or holding the slot', async () => {
    const started = deferred<AbortSignal>()
    const stopped = deferred<void>()
    const runChat = jest.fn<Promise<ChatReply>, Parameters<RunChat>>(async () => REPLY)
    runChat.mockImplementationOnce(async (_session, _request, signal) => {
      started.resolve(signal)
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          resolve()
        })
      })
      stopped.resolve()
      throw new Anthropic.APIUserAbortError()
    })
    harness = await start(runChat)
    const client = new AbortController()
    const leaving = post(harness, 'admin', ASK, client.signal)
    const signal = await started.promise
    expect(signal.aborted).toBe(false)
    client.abort()
    await expect(leaving).rejects.toThrow()
    await stopped.promise
    const next = await post(harness, 'admin', ASK)
    expect(next.status).toBe(200)
    expect(harness.reports).toEqual([])
  })
})
