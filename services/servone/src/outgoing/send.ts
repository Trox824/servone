import { request } from 'https'
import { isIP } from 'net'
import { HostRefusedError, resolvePublicHost } from '../host-guard'

export type SendError = 'timeout' | 'connect_failed' | 'tls' | 'redirect' | 'refused_address' | 'unresolvable_host'

export interface AttemptOutcome {
  // 0 when there was no HTTP answer.
  status: number
  error?: SendError
  durationMs: number
  responseStart: string
}

export interface PostOutcome extends AttemptOutcome {
  // The first maxResponseBytes of the answer, decoded as UTF-8.
  responseBody: string
}

export interface Transport {
  // Returns the vetted address to connect to.
  resolveHost: (host: string, port: number) => Promise<string>
  timeoutMs: number
  // Extra trusted CA, for tests against a local server.
  ca?: string
}

export const TIMEOUT_MS = 10_000
// Enough for a log line; app commands pass a larger cap to read the reply they post.
export const DEFAULT_MAX_RESPONSE_BYTES = 1024
export const RESPONSE_START_CHARS = 200
const HTTPS_PORT = 443
export const USER_AGENT = 'Servone-Webhooks/1'

export const publicTransport: Transport = {
  resolveHost: async (host, port) => await resolvePublicHost(host, port, 'any'),
  timeoutMs: TIMEOUT_MS
}

class AttemptTimeout extends Error {}

function isTlsFailure (error: Error): boolean {
  const code = 'code' in error ? String(error.code) : ''
  return code.startsWith('ERR_TLS') || code.startsWith('ERR_SSL') || code.includes('CERT') || code === 'EPROTO'
}

// Redirects are never followed: a 3xx to an internal address is the classic way around the host guard.
export async function postJson (
  url: string,
  headers: Record<string, string>,
  body: string,
  transport: Transport,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<PostOutcome> {
  const startedAt = Date.now()
  const elapsed = (): number => Date.now() - startedAt
  const target = new URL(url)
  const hostname = target.hostname.replace(/^\[|\]$/g, '')
  const port = target.port === '' ? HTTPS_PORT : Number(target.port)

  let address: string
  try {
    address = await transport.resolveHost(hostname, port)
  } catch (error) {
    if (error instanceof HostRefusedError) {
      return { status: 0, error: error.reason, durationMs: elapsed(), responseStart: '', responseBody: '' }
    }
    throw error
  }

  return await new Promise<PostOutcome>((resolve) => {
    let isSettled = false
    const settle = (outcome: Omit<PostOutcome, 'durationMs'>): void => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      outgoing.destroy()
      resolve({ ...outcome, durationMs: elapsed() })
    }

    const outgoing = request(
      {
        host: address,
        port,
        method: 'POST',
        path: `${target.pathname}${target.search}`,
        // SNI and certificate checks use the name; the socket goes to the vetted address.
        servername: isIP(hostname) === 0 ? hostname : undefined,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          Host: target.host,
          'Content-Length': String(Buffer.byteLength(body)),
          'User-Agent': USER_AGENT
        },
        agent: false,
        ca: transport.ca
      },
      (response) => {
        const status = response.statusCode ?? 0
        const chunks: Buffer[] = []
        let size = 0
        const finish = (): void => {
          const responseBody = Buffer.concat(chunks).subarray(0, maxResponseBytes).toString('utf8')
          const responseStart = responseBody.slice(0, RESPONSE_START_CHARS)
          if (status >= 300 && status < 400) settle({ status, error: 'redirect', responseStart, responseBody })
          else settle({ status, responseStart, responseBody })
        }
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          if (size >= maxResponseBytes) finish()
        })
        response.on('end', finish)
        response.on('error', finish)
      }
    )

    const timer = setTimeout(() => {
      outgoing.destroy(new AttemptTimeout())
    }, transport.timeoutMs)

    outgoing.on('error', (error) => {
      if (error instanceof AttemptTimeout) settle({ status: 0, error: 'timeout', responseStart: '', responseBody: '' })
      else settle({ status: 0, error: isTlsFailure(error) ? 'tls' : 'connect_failed', responseStart: '', responseBody: '' })
    })
    outgoing.end(body)
  })
}
