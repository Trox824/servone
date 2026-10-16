import type { LookupAddress, LookupAllOptions } from 'dns'

import {
  CIMD_MAX_BYTES,
  ClientMetadataError,
  fetchClientMetadata,
  isAllowedRedirectUri,
  matchesRedirectUri
} from '../oauth/clients'

const mockLookup = jest.fn<Promise<LookupAddress[]>, [string, LookupAllOptions]>()
jest.mock('dns/promises', () => ({
  lookup: async (hostname: string, options: LookupAllOptions) => await mockLookup(hostname, options)
}))

const CLIENT_URL = 'https://claude.ai/oauth/mcp-client.json'
const PUBLIC_ADDRESS = { address: '160.79.104.10', family: 4 }

let fetchMock: jest.SpiedFunction<typeof fetch>

function metadataResponse (body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', ...headers } })
}

const goodDocument = JSON.stringify({
  client_id: CLIENT_URL,
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback']
})

beforeEach(() => {
  mockLookup.mockReset()
  mockLookup.mockResolvedValue([PUBLIC_ADDRESS])
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(metadataResponse(goodDocument))
})

afterEach(() => {
  fetchMock.mockRestore()
})

describe('fetchClientMetadata', () => {
  it('returns the parsed document', async () => {
    await expect(fetchClientMetadata(CLIENT_URL)).resolves.toEqual({
      client_id: CLIENT_URL,
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback']
    })
    expect(mockLookup).toHaveBeenCalledWith('claude.ai', { all: true })
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error')
  })

  it('rejects http urls without fetching', async () => {
    await expect(fetchClientMetadata('http://claude.ai/client.json')).rejects.toThrow(ClientMetadataError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['loopback', '127.0.0.1'],
    ['private 10/8', '10.1.2.3'],
    ['private 192.168/16', '192.168.0.4'],
    ['link-local', '169.254.169.254'],
    ['ipv6 loopback', '::1'],
    ['ipv6 unique local', 'fd00::1'],
    ['ipv4-mapped loopback', '::ffff:127.0.0.1']
  ])('rejects a host resolving to %s', async (_label, address) => {
    mockLookup.mockResolvedValue([PUBLIC_ADDRESS, { address, family: address.includes(':') ? 6 : 4 }])
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized body announced by content-length', async () => {
    fetchMock.mockResolvedValue(metadataResponse(goodDocument, { 'Content-Length': String(CIMD_MAX_BYTES + 1) }))
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
  })

  it('rejects an oversized streamed body', async () => {
    fetchMock.mockResolvedValue(metadataResponse(' '.repeat(CIMD_MAX_BYTES + 1) + goodDocument))
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
  })

  it('rejects a document whose client_id is another url', async () => {
    fetchMock.mockResolvedValue(
      metadataResponse(JSON.stringify({ client_id: 'https://evil.example/client.json', redirect_uris: ['https://evil.example/cb'] }))
    )
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
  })

  it('rejects a non-200 answer and malformed json', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }))
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
    fetchMock.mockResolvedValueOnce(metadataResponse('{'))
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
  })

  it('turns a network failure into a metadata error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(fetchClientMetadata(CLIENT_URL)).rejects.toThrow(ClientMetadataError)
  })
})

describe('redirect uris', () => {
  it('allows https and http loopback only', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isAllowedRedirectUri('http://127.0.0.1:3334/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://example.com/callback')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai/cb#frag')).toBe(false)
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isAllowedRedirectUri('not a url')).toBe(false)
  })

  it('matches exactly, except the port of a loopback uri', () => {
    const registered = ['https://claude.ai/cb', 'http://127.0.0.1/callback']
    expect(matchesRedirectUri(registered, 'https://claude.ai/cb')).toBe(true)
    expect(matchesRedirectUri(registered, 'https://claude.ai/cb/')).toBe(false)
    expect(matchesRedirectUri(registered, 'https://claude.ai:8443/cb')).toBe(false)
    expect(matchesRedirectUri(registered, 'http://127.0.0.1:51234/callback')).toBe(true)
    expect(matchesRedirectUri(registered, 'http://127.0.0.1:51234/other')).toBe(false)
    expect(matchesRedirectUri(registered, 'http://localhost:51234/callback')).toBe(false)
  })
})
