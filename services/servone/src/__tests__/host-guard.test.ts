import { HostRefusedError, HostUnresolvedError, isPrivateAddress, resolvePublicHost, ResolverDownError } from '../host-guard'

const PUBLIC = '203.0.113.9'
const resolvesTo = (...addresses: string[]) => async () => addresses
const failsWith = (code: string) => async (): Promise<string[]> => {
  throw Object.assign(new Error(`getaddrinfo ${code} nope.example`), { code })
}

async function refusal (host: string, resolve = resolvesTo(PUBLIC)): Promise<string> {
  try {
    await resolvePublicHost(host, 443, 'any', resolve)
  } catch (error) {
    if (error instanceof HostRefusedError) return error.reason
    throw error
  }
  return 'allowed'
}

describe('isPrivateAddress', () => {
  it.each([
    '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.5', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '240.0.0.1', '192.0.0.8', '198.18.0.1', '198.19.255.255',
    '::1', '::', '0:0:0:0:0:0:0:1', 'fd00::1', 'fd12::1', 'FD12:0:0:0:0:0:0:1', 'fe80::1', 'fec0::1', 'ff02::1',
    '::ffff:10.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::a00:1', '::7f00:1',
    '64:ff9b::a00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::a00:1', '100::1', '2001:0:4136:e378::1',
    '2002:a00:1::1', '2002:7f00:1::1'
  ])('refuses %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each([
    '142.250.4.108', '52.97.0.1', '2607:f8b0:4004:c1b::6c', '2a00:1450::1', '2a00:1450:4001:82b::200e',
    '::ffff:8.8.8.8', '::ffff:142.250.4.108'
  ])('allows %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false)
  })

  it.each(['not-an-ip', '2130706433', '0x7f000001', '0177.0.0.1'])('refuses %s, which is not a canonical address', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })
})

describe('resolvePublicHost', () => {
  it('returns the first public address', async () => {
    expect(await resolvePublicHost('mail.acme.vn', 993, [143, 993], resolvesTo(PUBLIC))).toBe(PUBLIC)
  })

  it('accepts any port with "any"', async () => {
    expect(await resolvePublicHost('hooks.acme.vn', 8443, 'any', resolvesTo(PUBLIC))).toBe(PUBLIC)
  })

  it('refuses ports outside the list', async () => {
    await expect(resolvePublicHost('mail.acme.vn', 25, [143, 993], resolvesTo(PUBLIC))).rejects.toThrow(HostRefusedError)
  })

  it('refuses a host with one public and one private address', async () => {
    expect(await refusal('evil.example', resolvesTo(PUBLIC, '10.0.0.4'))).toBe('refused_address')
  })

  it.each(['localhost', 'LOCALHOST.', 'app.localhost', 'servone-mcp.railway.internal', 'printer.local'])(
    'refuses %s by name without resolving it',
    async (host) => {
      expect(await refusal(host)).toBe('refused_address')
    }
  )

  it.each([['10.1.2.3'], ['192.168.1.1'], ['169.254.169.254'], ['[::1]'], ['[fd12::1]']])('refuses the literal %s', async (host) => {
    const literal = host.replace(/^\[|\]$/g, '')
    expect(await refusal(host, resolvesTo(literal))).toBe('refused_address')
  })

  it.each(['ENOTFOUND', 'ENODATA'])('reports a name that fails with %s as unresolved', async (code) => {
    const outcome = resolvePublicHost('nope.example', 993, [993], failsWith(code))
    await expect(outcome).rejects.toThrow(HostUnresolvedError)
    await expect(outcome).rejects.toMatchObject({ reason: 'unresolvable_host', code })
  })

  it.each(['EAI_AGAIN', 'ESERVFAIL', 'ETIMEOUT'])('reports %s as a resolver outage, not a refusal', async (code) => {
    const outcome = resolvePublicHost('mail.acme.vn', 993, [993], failsWith(code))
    await expect(outcome).rejects.toThrow(ResolverDownError)
    await expect(outcome).rejects.not.toThrow(HostRefusedError)
  })

  it('rethrows a resolver error it does not recognise', async () => {
    const broken = async (): Promise<string[]> => { throw new Error('resolver crashed') }
    await expect(resolvePublicHost('mail.acme.vn', 993, [993], broken)).rejects.toThrow('resolver crashed')
  })

  it('reports a host with no addresses as unresolvable', async () => {
    expect(await refusal('empty.example', resolvesTo())).toBe('unresolvable_host')
  })
})
