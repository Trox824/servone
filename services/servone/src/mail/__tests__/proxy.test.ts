import { MeasureMetricsContext } from '@hcengineering/core'
import { createServer, type IncomingMessage, type Server } from 'http'
import type { AddressInfo } from 'net'
import { createMailProxy } from '../proxy'

async function listen (server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function close (server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => { resolve() }))
}

async function readBody (req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

describe('createMailProxy', () => {
  const ctx = new MeasureMetricsContext('test', {})
  let upstream: Server
  let proxy: Server

  afterEach(async () => {
    await close(proxy)
    if (upstream.listening) await close(upstream)
  })

  it('forwards method, path, auth header and body, and relays the answer', async () => {
    upstream = createServer((req, res) => {
      void readBody(req).then((body) => {
        res.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://front' })
        res.end(JSON.stringify({ method: req.method, url: req.url, auth: req.headers.authorization, body }))
      })
    })
    const target = await listen(upstream)
    const handler = createMailProxy(ctx, target)
    proxy = createServer((req, res) => { void handler(req, res) })
    const base = await listen(proxy)

    const response = await fetch(`${base}/mail/send?x=1`, { method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{"draft":"d1"}' })

    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://front')
    expect(await response.json()).toEqual({ method: 'POST', url: '/mail/send?x=1', auth: 'Bearer t', body: '{"draft":"d1"}' })
  })

  it('answers 502 mail_unavailable when the mail service is down', async () => {
    upstream = createServer()
    const target = await listen(upstream)
    await close(upstream)
    const handler = createMailProxy(ctx, target)
    proxy = createServer((req, res) => { void handler(req, res) })
    const base = await listen(proxy)

    const response = await fetch(`${base}/mail/body`, { method: 'POST', body: '{}' })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'mail_unavailable' })
  })
})
