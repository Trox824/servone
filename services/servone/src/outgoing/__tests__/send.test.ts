import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import { createServer, type Server } from 'https'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { HostRefusedError } from '../../host-guard'
import { postJson, RESPONSE_START_CHARS, type Transport } from '../send'

let server: Server
let port: number
let cert: string
let reply: (req: IncomingMessage, res: ServerResponse) => void
let received: Array<{ headers: IncomingMessage['headers'], body: string }>

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'send-test-'))
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    '-subj', '/CN=hooks.test', '-addext', 'subjectAltName=DNS:hooks.test'
  ], { stdio: 'ignore' })
  cert = readFileSync(join(dir, 'cert.pem'), 'utf8')
  const key = readFileSync(join(dir, 'key.pem'), 'utf8')
  rmSync(dir, { recursive: true })
  server = createServer({ key, cert }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
      reply(req, res)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => { resolve() }))
})

beforeEach(() => {
  received = []
})

function transport (overrides: Partial<Transport> = {}): Transport {
  return { resolveHost: async () => '127.0.0.1', timeoutMs: 1_000, ca: cert, ...overrides }
}

const url = (): string => `https://hooks.test:${port}/servone?x=1`

describe('postJson', () => {
  it('posts the body with its headers to the pinned address under the host name', async () => {
    reply = (_req, res) => res.writeHead(204).end()
    const outcome = await postJson(url(), { 'Servone-Event': 'test' }, '{"a":1}', transport())
    expect(outcome).toMatchObject({ status: 204, responseStart: '' })
    expect(outcome.error).toBeUndefined()
    expect(received).toHaveLength(1)
    expect(received[0].body).toBe('{"a":1}')
    expect(received[0].headers).toMatchObject({
      host: `hooks.test:${port}`,
      'servone-event': 'test',
      'content-type': 'application/json',
      'user-agent': 'Servone-Webhooks/1'
    })
  })

  it('keeps a Content-Type the caller sets', async () => {
    reply = (_req, res) => res.writeHead(200).end()
    await postJson(url(), { 'Content-Type': 'application/x-www-form-urlencoded' }, 'command=%2Fdeploy', transport())
    expect(received[0].headers['content-type']).toBe('application/x-www-form-urlencoded')
  })

  it('does not follow a redirect', async () => {
    reply = (_req, res) => res.writeHead(302, { Location: 'https://169.254.169.254/' }).end()
    const outcome = await postJson(url(), {}, '{}', transport())
    expect(outcome).toMatchObject({ status: 302, error: 'redirect' })
    expect(received).toHaveLength(1)
  })

  it('reports a server error answer with the start of its body', async () => {
    reply = (_req, res) => res.writeHead(500).end('x'.repeat(5_000))
    const outcome = await postJson(url(), {}, '{}', transport())
    expect(outcome.status).toBe(500)
    expect(outcome.error).toBeUndefined()
    expect(outcome.responseStart).toBe('x'.repeat(RESPONSE_START_CHARS))
  })

  it('times out a receiver that never answers', async () => {
    reply = () => {}
    const outcome = await postJson(url(), {}, '{}', transport({ timeoutMs: 200 }))
    expect(outcome).toMatchObject({ status: 0, error: 'timeout' })
  })

  it('reports a certificate for another name as a TLS failure', async () => {
    reply = (_req, res) => res.writeHead(200).end()
    const outcome = await postJson(`https://other.test:${port}/`, {}, '{}', transport())
    expect(outcome).toMatchObject({ status: 0, error: 'tls' })
  })

  it('reports a closed port as a connect failure', async () => {
    const outcome = await postJson('https://hooks.test:1/', {}, '{}', transport())
    expect(outcome).toMatchObject({ status: 0, error: 'connect_failed' })
  })

  it('reports a refused host without connecting', async () => {
    const refuse = async (): Promise<string> => {
      throw new HostRefusedError('refused_address', 'private')
    }
    const outcome = await postJson(url(), {}, '{}', transport({ resolveHost: refuse }))
    expect(outcome).toMatchObject({ status: 0, error: 'refused_address' })
    expect(received).toHaveLength(0)
  })

  it('keeps 1 KB of the answer by default', async () => {
    reply = (_req, res) => res.writeHead(200).end('z'.repeat(5_000))
    const outcome = await postJson(url(), {}, '{}', transport())
    expect(outcome.responseBody).toBe('z'.repeat(1024))
  })

  it('reads up to maxResponseBytes of the answer', async () => {
    reply = (_req, res) => res.writeHead(200).end('y'.repeat(10_000))
    const outcome = await postJson(url(), {}, '{}', transport(), 4096)
    expect(outcome.responseBody).toBe('y'.repeat(4096))
    expect(outcome.responseStart).toBe('y'.repeat(RESPONSE_START_CHARS))
  })

  it('has an empty body when nothing answered', async () => {
    const outcome = await postJson('https://hooks.test:1/', {}, '{}', transport())
    expect(outcome.responseBody).toBe('')
  })
})
