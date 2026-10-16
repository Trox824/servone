import type { Person } from '@hcengineering/contact'
import { type AccountUuid, MeasureMetricsContext, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { attachSignupCalendar, CALENDAR_SCOPES, createCalendarConnector, parseSignupGrant, type SignupCalendarDeps, type SignupGrant } from '../signup-calendar'

jest.mock('@hcengineering/server-token', () => ({ generateToken: () => 'service-token' }), { virtual: true })
jest.mock('@hcengineering/server-client', () => ({ getAccountClient: () => ({}) }), { virtual: true })

const WORKSPACE = 'ws-1' as WorkspaceUuid
const ACCOUNT = 'acc-1' as AccountUuid
const PERSON = 'person-1' as Ref<Person>
const ctx = new MeasureMetricsContext('test', {})
const grantWith = (...scopes: string[]): SignupGrant => ({ account: ACCOUNT, refreshToken: 'rt', scope: ['openid', 'email', ...scopes].join(' ') })

function depsFor (grant: SignupGrant | undefined): SignupCalendarDeps & { connectCalendar: jest.Mock } {
  return { loadGrant: async () => grant, connectCalendar: jest.fn(async () => 'connected' as const) }
}

function respondWith (status: number, body: object): void {
  global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status })) as jest.Mock
}

describe('attachSignupCalendar', () => {
  it('connects nothing without a grant', async () => {
    const deps = depsFor(undefined)
    await attachSignupCalendar(deps, WORKSPACE, PERSON)
    expect(deps.connectCalendar).not.toHaveBeenCalled()
  })

  it('connects calendar when every calendar scope was granted', async () => {
    const deps = depsFor(grantWith(...CALENDAR_SCOPES))
    await attachSignupCalendar(deps, WORKSPACE, PERSON)
    expect(deps.connectCalendar).toHaveBeenCalledWith({ workspace: WORKSPACE, account: ACCOUNT, refreshToken: 'rt' })
  })

  it('skips calendar when one of its scopes was unticked', async () => {
    const deps = depsFor(grantWith(...CALENDAR_SCOPES.slice(1)))
    await attachSignupCalendar(deps, WORKSPACE, PERSON)
    expect(deps.connectCalendar).not.toHaveBeenCalled()
  })
})

describe('createCalendarConnector', () => {
  const connect = createCalendarConnector(ctx, 'http://calendar', 'servone-starter')
  const request = { workspace: WORKSPACE, account: ACCOUNT, refreshToken: 'rt' }

  it('reports connected on 200', async () => {
    respondWith(200, { status: 'connected' })
    expect(await connect(request)).toBe('connected')
  })

  it('skips a revoked grant', async () => {
    respondWith(400, { error: 'invalid_grant' })
    expect(await connect(request)).toBe('skipped')
  })

  it('skips a grant without calendar scopes', async () => {
    respondWith(400, { error: 'missing_scope' })
    expect(await connect(request)).toBe('skipped')
  })

  it('throws on a server error', async () => {
    respondWith(503, {})
    await expect(connect(request)).rejects.toThrow('503')
  })
})

describe('parseSignupGrant', () => {
  it('reads the stored secret', () => {
    expect(parseSignupGrant(ACCOUNT, JSON.stringify({ refresh_token: 'rt', scope: 'email' }))).toEqual({ account: ACCOUNT, refreshToken: 'rt', scope: 'email' })
  })

  it('rejects a secret without a refresh token', () => {
    expect(parseSignupGrant(ACCOUNT, JSON.stringify({ scope: 'email' }))).toBeUndefined()
  })
})
