import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { generateToken, type Token } from '@hcengineering/server-token'

import { authenticate, callerFromToken, readBearer } from '../auth'

const mockGetLoginInfoByToken = jest.fn()
const mockGetAccountClient = jest.fn((_token: string) => ({ getLoginInfoByToken: mockGetLoginInfoByToken }))
jest.mock(
  '@hcengineering/server-client',
  () => ({ getAccountClient: (token: string) => mockGetAccountClient(token) }),
  { virtual: true }
)

const account = '6f1f6a4e-1f1a-4c1e-9d2a-0a0b0c0d0e01' as AccountUuid
const workspace = '6f1f6a4e-1f1a-4c1e-9d2a-0a0b0c0d0e02' as WorkspaceUuid
const EXP_SEC = 2_000_000_000

function token (fields: Partial<Token>): Token {
  return { account, workspace, exp: EXP_SEC, ...fields }
}

describe('readBearer', () => {
  it('reads a bearer token', () => {
    expect(readBearer('Bearer abc')).toBe('abc')
  })
  it('rejects other schemes', () => {
    expect(readBearer('Basic abc')).toBeUndefined()
  })
  it('rejects missing header', () => {
    expect(readBearer(undefined)).toBeUndefined()
  })
})

describe('callerFromToken', () => {
  it('accepts an API token', () => {
    const caller = callerFromToken(token({ extra: { apiTokenId: 't1' } }), 'raw', 0)
    expect(caller).toEqual({ token: 'raw', apiTokenId: 't1', account, workspace, expiresAt: EXP_SEC * 1000 })
  })
  it('rejects a session token without apiTokenId', () => {
    expect(callerFromToken(token({ extra: {} }), 'raw', 0)).toBeUndefined()
  })
  it('rejects a token without workspace', () => {
    expect(callerFromToken(token({ workspace: '' as WorkspaceUuid, extra: { apiTokenId: 't1' } }), 'raw', 0)).toBeUndefined()
  })
  it('rejects an expired API token', () => {
    expect(callerFromToken(token({ exp: 10, extra: { apiTokenId: 't1' } }), 'raw', 10_000)).toBeUndefined()
  })
  it('rejects an API token without expiry', () => {
    expect(callerFromToken(token({ exp: undefined, extra: { apiTokenId: 't1' } }), 'raw', 0)).toBeUndefined()
  })
})

describe('authenticate', () => {
  const apiToken = generateToken(account, workspace, { apiTokenId: 't1' }, undefined, { exp: EXP_SEC })

  beforeEach(() => {
    mockGetAccountClient.mockClear()
    mockGetLoginInfoByToken.mockReset()
  })

  it('returns the caller when the account service confirms the workspace', async () => {
    mockGetLoginInfoByToken.mockResolvedValue({ account, workspace })
    const caller = await authenticate(`Bearer ${apiToken}`, 0)
    expect(caller).toMatchObject({ apiTokenId: 't1', workspace, token: apiToken })
    expect(mockGetAccountClient).toHaveBeenCalledWith(apiToken)
  })

  it('rejects a malformed token without calling the account service', async () => {
    expect(await authenticate('Bearer not-a-jwt', 0)).toBeUndefined()
    expect(mockGetAccountClient).not.toHaveBeenCalled()
  })

  it('rejects a session token without calling the account service', async () => {
    const sessionToken = generateToken(account, workspace)
    expect(await authenticate(`Bearer ${sessionToken}`, 0)).toBeUndefined()
    expect(mockGetAccountClient).not.toHaveBeenCalled()
  })

  it('rejects a revoked API token', async () => {
    mockGetLoginInfoByToken.mockRejectedValue(new PlatformError(new Status(Severity.ERROR, platform.status.Unauthorized, {})))
    expect(await authenticate(`Bearer ${apiToken}`, 0)).toBeUndefined()
  })

  it('rejects when the account service reports another workspace', async () => {
    mockGetLoginInfoByToken.mockResolvedValue({ account, workspace: 'other' })
    expect(await authenticate(`Bearer ${apiToken}`, 0)).toBeUndefined()
  })

  it('rethrows account service failures other than Unauthorized', async () => {
    mockGetLoginInfoByToken.mockRejectedValue(new Error('account down'))
    await expect(authenticate(`Bearer ${apiToken}`, 0)).rejects.toThrow('account down')
  })
})
