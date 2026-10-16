import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { z } from 'zod'

import { createRequestHandler, type RouteHandler } from '../server'
import { defineTool } from '../tool'
import type { Caller, WorkspaceSession } from '../types'
import { fakeSession } from './fixtures'

const PUBLIC_URL = 'https://mcp.servone.vn'
const GOOD_TOKEN = 'good'

const caller: Caller = {
  token: GOOD_TOKEN,
  apiTokenId: 'api-1',
  account: 'acc-me' as AccountUuid,
  workspace: 'ws-1' as WorkspaceUuid,
  expiresAt: Number.MAX_SAFE_INTEGER
}

const pingTool = defineTool({
  name: 'ping',
  title: 'Ping',
  description: 'Replies pong',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  run: async () => 'pong'
})

interface Harness {
  base: string
  accepted: Set<string>
  sessionCalls: Caller[]
  sessionFails: { value: boolean }
  events: string[]
  extraRoutes: jest.Mock<ReturnType<RouteHandler>, Parameters<RouteHandler>>
  close: () => Promise<void>
}

async function start (): Promise<Harness> {
  const accepted = new Set([GOOD_TOKEN])
  const sessionCalls: Caller[] = []
  const sessionFails = { value: false }
  const events: string[] = []
  const extraRoutes = jest.fn<ReturnType<RouteHandler>, Parameters<RouteHandler>>(async () => false)
  const handler = createRequestHandler({
    publicUrl: PUBLIC_URL,
    tools: [pingTool],
    authenticate: async (authorization) => {
      const token = (authorization ?? '').replace('Bearer ', '')
      return accepted.has(token) ? caller : undefined
    },
    session: async (sessionCaller): Promise<WorkspaceSession> => {
      sessionCalls.push(sessionCaller)
      if (sessionFails.value) throw new Error('transactor down')
      return fakeSession()
    },
    extraRoutes,
    report: (event) => {
      events.push(event)
    }
  })
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    accepted,
    sessionCalls,
    sessionFails,
    events,
    extraRoutes,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

interface RpcReply {
  result?: {
    protocolVersion?: string
    tools?: Array<{ name: string }>
    content?: Array<{ type: string, text: string }>
  }
  error?: { code: number, message: string }
}

async function readReply (response: Response): Promise<RpcReply> {
  const body = await response.text()
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const dataLine = body.split('\n').find((line) => line.startsWith('data:'))
    if (dataLine === undefined) throw new Error(`No data in SSE body: ${body}`)
    return JSON.parse(dataLine.slice('data:'.length)) as RpcReply
  }
  return JSON.parse(body) as RpcReply
}

async function post (base: string, token: string | undefined, message: object, protocolVersion?: string): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' })
  if (token !== undefined) headers.set('Authorization', `Bearer ${token}`)
  if (protocolVersion !== undefined) headers.set('MCP-Protocol-Version', protocolVersion)
  return await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify(message) })
}

const LEGACY_VERSION = '2025-06-18'
const listTools = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }

describe('createRequestHandler', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await start()
  })

  afterEach(async () => {
    await harness.close()
  })

  it('answers /health without auth', async () => {
    const response = await fetch(`${harness.base}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('challenges a request without Authorization', async () => {
    const response = await post(harness.base, undefined, listTools, LEGACY_VERSION)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`
    )
    expect(harness.sessionCalls).toHaveLength(0)
  })

  it('rejects a token authenticate refuses', async () => {
    const response = await post(harness.base, 'forged', listTools, LEGACY_VERSION)
    expect(response.status).toBe(401)
    expect(harness.sessionCalls).toHaveLength(0)
  })

  it('serves a 2025-era client: initialize, tools/list, tools/call', async () => {
    const init = await post(harness.base, GOOD_TOKEN, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: LEGACY_VERSION, capabilities: {}, clientInfo: { name: 'claude-code', version: '1.0.0' } }
    })
    expect(init.status).toBe(200)
    expect((await readReply(init)).result?.protocolVersion).toBe(LEGACY_VERSION)

    const initialized = await post(harness.base, GOOD_TOKEN, { jsonrpc: '2.0', method: 'notifications/initialized' }, LEGACY_VERSION)
    expect(initialized.status).toBe(202)

    const list = await post(harness.base, GOOD_TOKEN, listTools, LEGACY_VERSION)
    expect(list.status).toBe(200)
    expect((await readReply(list)).result?.tools?.map((tool) => tool.name)).toEqual(['ping'])

    const call = await post(
      harness.base,
      GOOD_TOKEN,
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ping', arguments: {} } },
      LEGACY_VERSION
    )
    expect((await readReply(call)).result?.content).toEqual([{ type: 'text', text: 'pong' }])
    expect(harness.sessionCalls).toEqual([caller, caller, caller, caller])
  })

  it('refuses a revoked token even after a successful call', async () => {
    expect((await post(harness.base, GOOD_TOKEN, listTools, LEGACY_VERSION)).status).toBe(200)
    harness.accepted.delete(GOOD_TOKEN)
    expect((await post(harness.base, GOOD_TOKEN, listTools, LEGACY_VERSION)).status).toBe(401)
    expect(harness.sessionCalls).toHaveLength(1)
  })

  it('answers 500 and reports when the session cannot open', async () => {
    harness.sessionFails.value = true
    const response = await post(harness.base, GOOD_TOKEN, listTools, LEGACY_VERSION)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal' })
    expect(harness.events).toEqual(['request failed'])
  })

  it('answers 404 for an unknown path', async () => {
    const response = await fetch(`${harness.base}/nope`)
    expect(response.status).toBe(404)
    expect(harness.extraRoutes).toHaveBeenCalledWith(expect.anything(), expect.anything(), ['nope'])
  })

  it('lets extraRoutes short-circuit routing', async () => {
    harness.extraRoutes.mockImplementation(async (_req, res) => {
      res.writeHead(418)
      res.end()
      return true
    })
    const response = await fetch(`${harness.base}/health`)
    expect(response.status).toBe(418)
  })
})
