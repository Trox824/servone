// Keeps hosts that users type in (webhook URLs, mail servers) off our private network and cloud metadata.
import { lookup } from 'dns/promises'
import { BlockList, isIP } from 'net'
import { types } from 'util'

export type HostRefusal = 'refused_address' | 'unresolvable_host'

export class HostRefusedError extends Error {
  constructor (readonly reason: HostRefusal, message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// The name does not exist; mail's login check reports it as a network problem with the DNS code.
export class HostUnresolvedError extends HostRefusedError {
  constructor (readonly code: string, host: string) {
    super('unresolvable_host', `${host} did not resolve (${code})`)
  }
}

// The resolver itself failed, so the name may be fine: webhook delivery retries without counting an attempt.
export class ResolverDownError extends Error {
  constructor (readonly code: string, host: string) {
    super(`${host} could not be looked up (${code})`)
    Object.setPrototypeOf(this, ResolverDownError.prototype)
  }
}

export type Resolve = (host: string) => Promise<string[]>

const defaultResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address)

const MISSING_NAME_CODES = new Set(['ENOTFOUND', 'ENODATA'])
const RESOLVER_DOWN_CODES = new Set(['EAI_AGAIN', 'EAI_FAIL', 'ESERVFAIL', 'ETIMEOUT', 'ECONNREFUSED'])

// Railway private DNS is *.railway.internal; the others never name a public host.
const PRIVATE_NAME = /(^|\.)(localhost|internal|local)$/

// Loopback, RFC 1918, CGNAT, link-local (cloud metadata), IETF protocol, benchmarking, multicast and reserved.
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]
// ::/96 (unspecified, loopback, IPv4-compatible), NAT64, discard, Teredo and 6to4 can all reach an IPv4 host;
// then ULA (Railway private network is fd12::/16), link-local, site-local and multicast.
const BLOCKED_V6: Array<[string, number]> = [
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]
]

// BlockList also checks IPv4-mapped IPv6 (::ffff:a.b.c.d, ::ffff:7f00:1) against the IPv4 rules.
const blocked = new BlockList()
for (const [network, prefix] of BLOCKED_V4) blocked.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of BLOCKED_V6) blocked.addSubnet(network, prefix, 'ipv6')

// Anything isIP rejects (including decimal, octal and hex IPv4 spellings) counts as private.
export function isPrivateAddress (address: string): boolean {
  const family = isIP(address)
  if (family === 0) return true
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

async function resolveAll (host: string, resolve: Resolve): Promise<string[]> {
  try {
    return await resolve(host)
  } catch (error) {
    // isNativeError: dns errors come from another realm under jest, so instanceof fails.
    const code = types.isNativeError(error) ? Reflect.get(error, 'code') : undefined
    if (typeof code !== 'string') throw error
    if (MISSING_NAME_CODES.has(code)) throw new HostUnresolvedError(code, host)
    if (RESOLVER_DOWN_CODES.has(code)) throw new ResolverDownError(code, host)
    throw error
  }
}

// Resolves once and returns the address to connect to, so a second DNS answer (rebinding) is never used.
export async function resolvePublicHost (
  host: string,
  port: number,
  allowedPorts: readonly number[] | 'any',
  resolve: Resolve = defaultResolve
): Promise<string> {
  if (allowedPorts !== 'any' && !allowedPorts.includes(port)) {
    throw new HostRefusedError('refused_address', `Port ${port} is not allowed`)
  }
  const name = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (PRIVATE_NAME.test(name)) throw new HostRefusedError('refused_address', `${name} is an internal name`)
  const addresses = await resolveAll(name, resolve)
  if (addresses.length === 0) throw new HostRefusedError('unresolvable_host', `${name} does not resolve`)
  if (addresses.some(isPrivateAddress)) throw new HostRefusedError('refused_address', `${name} resolves to a private address`)
  return addresses[0]
}
