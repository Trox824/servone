import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

import { createRouter, type ModuleHandlers, type RequestHandler } from '../router'

function answerAs (moduleName: string): RequestHandler {
  return async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(moduleName)
  }
}

const handlers: ModuleHandlers = {
  mcp: answerAs('mcp'),
  webhooks: answerAs('webhooks'),
  issuesApi: answerAs('issuesApi'),
  trackerHooks: answerAs('trackerHooks'),
  chatHooks: answerAs('chatHooks'),
  chatCommands: answerAs('chatCommands'),
  forms: answerAs('forms'),
  unsubscribe: answerAs('unsubscribe'),
  webPush: answerAs('webPush'),
  mail: answerAs('mail'),
  workflows: answerAs('workflows'),
  approvals: answerAs('approvals'),
  import: answerAs('import'),
  bugReport: answerAs('bugReport'),
  lifecycle: answerAs('lifecycle')
}

let server: Server
let base: string
let clock = 0

beforeAll(async () => {
  const route = createRouter(handlers, () => clock)
  server = createServer((req, res) => {
    void route(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve()
    })
  )
})

async function moduleFor (method: string, path: string): Promise<string> {
  const response = await fetch(`${base}${path}`, { method })
  return await response.text()
}

function statusFor (path: string, headers: Record<string, string>, method = 'GET'): Promise<Response> {
  return fetch(`${base}${path}`, { method, headers })
}

async function drain (path: string, headers: Record<string, string>, count: number, method = 'GET'): Promise<void> {
  for (let i = 0; i < count; i++) await statusFor(path, headers, method)
}

describe('createRouter', () => {
  it.each([
    ['POST', '/v1/hooks/abc/secret', 'webhooks'],
    ['GET', '/v1/channels/chunter:space:General/hooks', 'webhooks'],
    ['DELETE', '/v1/hooks/abc', 'webhooks'],
    ['POST', '/v1/tracker/issues', 'issuesApi'],
    ['PATCH', '/v1/tracker/issues/SRV-12', 'issuesApi'],
    ['POST', '/v1/approvals/req-1/approve', 'approvals'],
    ['POST', '/v1/import', 'import'],
    ['POST', '/v1/bug-report', 'bugReport'],
    ['POST', '/v1/lifecycle/invites', 'lifecycle'],
    ['OPTIONS', '/v1/import', 'import'],
    ['POST', '/v1/tracker/issues/SRV-12/comments', 'issuesApi'],
    ['GET', '/v1/tracker/projects/tracker:project:SRV/hooks', 'trackerHooks'],
    ['PATCH', '/v1/tracker/hooks/abc', 'trackerHooks'],
    ['OPTIONS', '/v1/tracker/hooks/abc/test', 'trackerHooks'],
    ['GET', '/v1/tracker', 'trackerHooks'],
    ['GET', '/v1/chat/hooks?channel=chunter:space:General', 'chatHooks'],
    ['POST', '/v1/chat/hooks', 'chatHooks'],
    ['PATCH', '/v1/chat/hooks/abc', 'chatHooks'],
    ['OPTIONS', '/v1/chat/hooks/abc/test', 'chatHooks'],
    ['GET', '/v1/chat/commands', 'chatCommands'],
    ['POST', '/v1/chat/commands/run', 'chatCommands'],
    ['POST', '/v1/chat/commands/respond/abc', 'chatCommands'],
    ['OPTIONS', '/v1/chat/commands/abc', 'chatCommands'],
    ['GET', '/v1/chat/other', 'webhooks'],
    ['GET', '/forms/abc/secret', 'forms'],
    ['POST', '/forms/abc/secret', 'forms'],
    ['DELETE', '/forms/templates/tpl-1/link', 'forms'],
    ['GET', '/unsubscribe?token=t', 'unsubscribe'],
    ['POST', '/unsubscribe?token=t', 'unsubscribe'],
    ['POST', '/web-push', 'webPush'],
    ['POST', '/mail/connect', 'mail'],
    ['POST', '/mail/send', 'mail'],
    ['POST', '/workflows/setup', 'workflows'],
    ['POST', '/mcp', 'mcp'],
    ['GET', '/.well-known/oauth-protected-resource', 'mcp'],
    ['GET', '/.well-known/oauth-authorization-server', 'mcp'],
    ['POST', '/oauth/register', 'mcp'],
    ['GET', '/health', 'mcp'],
    ['GET', '/', 'mcp'],
    ['GET', '/v1extra', 'mcp']
  ])('%s %s goes to %s', async (method, path, expected) => {
    expect(await moduleFor(method, path)).toBe(expected)
  })
})

describe('per-IP rate limit', () => {
  beforeEach(() => {
    clock += 3_600_000
  })

  it('ignores a spoofed first X-Forwarded-For entry', async () => {
    const real = { 'x-forwarded-for': `${clock}.1.1.1, 9.9.9.9` }
    await drain('/mcp', real, 120)
    const forged = { 'x-forwarded-for': `${clock}.2.2.2, 9.9.9.9` }
    expect((await statusFor('/mcp', forged)).status).toBe(429)
  })

  it('answers 429 with Retry-After once the burst is spent, then recovers', async () => {
    const headers = { 'x-forwarded-for': '10.0.0.1' }
    await drain('/mcp', headers, 120)
    const blocked = await statusFor('/mcp', headers)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('1')
    expect(await blocked.json()).toEqual({ error: 'rate_limited' })
    clock += 1000
    expect((await statusFor('/mcp', headers)).status).toBe(200)
  })

  it('keeps other IPs unaffected', async () => {
    await drain('/mcp', { 'x-forwarded-for': '10.0.0.2' }, 121)
    expect((await statusFor('/mcp', { 'x-forwarded-for': '10.0.0.3' })).status).toBe(200)
  })

  it('limits oauth, unsubscribe and form submits harder, but not form views or form management', async () => {
    const headers = { 'x-forwarded-for': '10.0.0.4' }
    await drain('/oauth/token', headers, 20, 'POST')
    expect((await statusFor('/oauth/token', headers, 'POST')).status).toBe(429)
    await drain('/unsubscribe?token=t', { 'x-forwarded-for': '10.0.0.5' }, 20)
    expect((await statusFor('/unsubscribe?token=t', { 'x-forwarded-for': '10.0.0.5' })).status).toBe(429)
    const submitter = { 'x-forwarded-for': '10.0.0.6' }
    await drain('/forms/abc/secret', submitter, 20, 'POST')
    expect((await statusFor('/forms/abc/secret', submitter, 'POST')).status).toBe(429)
    expect((await statusFor('/forms/abc/secret', submitter)).status).toBe(200)
    expect((await statusFor('/forms/templates/t/link', submitter, 'POST')).status).toBe(200)
  })

  it('never limits /health or /web-push', async () => {
    const headers = { 'x-forwarded-for': '10.0.0.7' }
    await drain('/health', headers, 200)
    await drain('/web-push', headers, 200, 'POST')
    expect((await statusFor('/health', headers)).status).toBe(200)
    expect((await statusFor('/web-push', headers, 'POST')).status).toBe(200)
  })
})
