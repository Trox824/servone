import { lookup } from 'dns/promises'
import { BlockList } from 'net'
import { z } from 'zod'

export const CIMD_TIMEOUT_MS = 5_000 // Claude gives discovery 10s total
export const CIMD_MAX_BYTES = 64 * 1024

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const clientMetadataSchema = z.object({
  client_id: z.string(),
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string()).min(1)
})

export type ClientMetadata = z.infer<typeof clientMetadataSchema>

export class ClientMetadataError extends Error {}

// Node checks IPv4-mapped IPv6 addresses against the IPv4 rules too.
const blockedAddresses = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6')
}

function parseUrl (raw: string): URL | undefined {
  return URL.canParse(raw) ? new URL(raw) : undefined
}

function isLoopbackHttp (url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

export function isAllowedRedirectUri (raw: string): boolean {
  const url = parseUrl(raw)
  if (url === undefined || url.hash !== '' || url.username !== '' || url.password !== '') return false
  return url.protocol === 'https:' || isLoopbackHttp(url)
}

// RFC 8252 section 7.3: native apps pick a free port at run time, so a loopback uri matches on any port.
export function matchesRedirectUri (registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true
  const asked = parseUrl(requested)
  if (asked === undefined || !isLoopbackHttp(asked)) return false
  return registered.some((uri) => {
    const allowed = parseUrl(uri)
    return (
      allowed !== undefined &&
      isLoopbackHttp(allowed) &&
      allowed.hostname === asked.hostname &&
      allowed.pathname === asked.pathname &&
      allowed.search === asked.search
    )
  })
}

// DNS rebinding between this check and fetch's own lookup is still possible; the size cap and timeout bound the damage.
async function assertPublicHost (hostname: string): Promise<void> {
  let addresses
  try {
    // URL keeps the brackets of an IPv6 literal; lookup wants the bare address.
    addresses = await lookup(hostname.replace(/^\[(.*)\]$/, '$1'), { all: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error) throw new ClientMetadataError(`${hostname} does not resolve`)
    throw error
  }
  if (addresses.length === 0) throw new ClientMetadataError(`${hostname} does not resolve`)
  for (const { address, family } of addresses) {
    if (blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4')) {
      throw new ClientMetadataError(`${hostname} resolves to a private address`)
    }
  }
}

async function readCapped (response: Response): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > CIMD_MAX_BYTES) {
    throw new ClientMetadataError('client metadata document is too large')
  }
  if (response.body === null) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body.getReader()
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength
    if (size > CIMD_MAX_BYTES) {
      await reader.cancel()
      throw new ClientMetadataError('client metadata document is too large')
    }
    chunks.push(chunk.value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function download (url: URL): Promise<string> {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new ClientMetadataError(`client metadata answered ${response.status}`)
    return await readCapped(response)
  } catch (error) {
    // fetch reports network failures and refused redirects as TypeError, timeouts as a DOMException.
    if (error instanceof TypeError || error instanceof DOMException) {
      throw new ClientMetadataError(`client metadata fetch failed: ${error.message}`)
    }
    throw error
  }
}

function parseDocument (text: string): ClientMetadata {
  let document
  try {
    document = clientMetadataSchema.safeParse(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError) throw new ClientMetadataError('client metadata is not JSON')
    throw error
  }
  if (!document.success) throw new ClientMetadataError('client metadata has no client_id or redirect_uris')
  return document.data
}

export async function fetchClientMetadata (clientId: string): Promise<ClientMetadata> {
  const url = parseUrl(clientId)
  if (url?.protocol !== 'https:' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw new ClientMetadataError('client_id must be an https url')
  }
  await assertPublicHost(url.hostname)
  const document = parseDocument(await download(url))
  if (document.client_id !== clientId) throw new ClientMetadataError('client metadata client_id does not match its url')
  return document
}
