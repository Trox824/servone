import type { ScopeOption, Source } from '@servone/import'
import { ServiceApiError } from '../../../chunter-resources/webhooks/api'
import { ConnectFailure, groupScopes, isAccessLost, parseApiResponse, parseConnectable, readConnectReply } from '../connect'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))
jest.mock('@hcengineering/platform', () => ({ ...jest.requireActual('@hcengineering/platform'), getMetadata: () => 'token' }))
jest.mock('@servone/import', () => ({
  ConnectorError: class ConnectorError extends Error {
    constructor (readonly status: number, readonly path: string) {
      super(`${path} answered ${status}`)
    }
  }
}), { virtual: true })

const { ConnectorError } = jest.requireMock('@servone/import')

const ORIGIN = 'https://servone.example.com'

function reply (data: object, origin = ORIGIN, source: MessageEventSource | null = window): MessageEvent {
  return new MessageEvent('message', { data, origin, source })
}

describe('readConnectReply', () => {
  const ok = { type: 'servone-import-connect', source: 'slack', connection: 'c1' }

  it('accepts a connection from the service origin and popup', () => {
    expect(readConnectReply(reply(ok), ORIGIN, window, 'slack')).toEqual({ connection: 'c1' })
  })

  it('ignores other origins, windows, sources and message types', () => {
    expect(readConnectReply(reply(ok, 'https://evil.example.com'), ORIGIN, window, 'slack')).toBeUndefined()
    expect(readConnectReply(reply(ok, ORIGIN, null), ORIGIN, window, 'slack')).toBeUndefined()
    expect(readConnectReply(reply(ok), ORIGIN, window, 'notion')).toBeUndefined()
    expect(readConnectReply(reply({ ...ok, type: 'other' }), ORIGIN, window, 'slack')).toBeUndefined()
    expect(readConnectReply(new MessageEvent('message', { data: 'text', origin: ORIGIN, source: window }), ORIGIN, window, 'slack')).toBeUndefined()
  })

  it('maps errors to failure reasons', () => {
    const reason = (error: string): string | undefined => {
      const result = readConnectReply(reply({ type: 'servone-import-connect', source: 'slack', error }), ORIGIN, window, 'slack')
      return result !== undefined && 'failure' in result ? result.failure.reason : undefined
    }
    expect(reason('denied')).toBe('denied')
    expect(reason('expired')).toBe('expired')
    expect(reason('boom')).toBe('failed')
  })
})

describe('service replies', () => {
  const known = [{ id: 'slack' }, { id: 'notion' }] as Source[]

  it('keeps only known connectable sources', () => {
    expect([...parseConnectable({ sources: ['slack', 'unknown'] }, known)]).toEqual(['slack'])
    expect(() => parseConnectable({ sources: 'slack' }, known)).toThrow(ServiceApiError)
  })

  it('parses a wrapped vendor response', () => {
    expect(parseApiResponse({ status: 429, body: null, retryAfterSeconds: 3 })).toEqual({ status: 429, body: null, retryAfterSeconds: 3 })
    expect(parseApiResponse({ status: 200, body: { ok: true } })).toMatchObject({ status: 200, body: { ok: true } })
    expect(() => parseApiResponse({ body: null })).toThrow(ServiceApiError)
    expect(() => parseApiResponse({ status: 200, body: null, retryAfterSeconds: 'soon' })).toThrow(ServiceApiError)
  })
})

describe('isAccessLost', () => {
  it('flags revoked vendor access and a dropped connection', () => {
    expect(isAccessLost(new ConnectorError(401, '/x'))).toBe(true)
    expect(isAccessLost(new ConnectorError(403, '/x'))).toBe(true)
    expect(isAccessLost(new ConnectorError(500, '/x'))).toBe(false)
    expect(isAccessLost(new ServiceApiError(404, 'not_connected'))).toBe(true)
    expect(isAccessLost(new ServiceApiError(500, 'unknown'))).toBe(false)
    expect(isAccessLost(new ConnectFailure('denied'))).toBe(false)
  })
})

describe('groupScopes', () => {
  it('groups by parent name in first-seen order', () => {
    const scope = (id: string, parentName?: string): ScopeOption => ({ id, name: id, kind: 'channel', parentName, isSelected: true })
    const groups = groupScopes([scope('a', 'Team 1'), scope('b'), scope('c', 'Team 1'), scope('d', 'Team 2')])
    expect(groups.map((group) => [group.parentName, group.scopes.map((entry) => entry.id)])).toEqual([
      ['Team 1', ['a', 'c']],
      [undefined, ['b']],
      ['Team 2', ['d']]
    ])
  })
})
