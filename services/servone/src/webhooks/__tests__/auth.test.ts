import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { generateToken } from '@hcengineering/server-token'
import type { Token } from '@hcengineering/server-token'
import { authenticate, canManageHooks, readBearer, tokenIdentity } from '../auth'

const mockGetLoginInfoByToken = jest.fn()
const mockGetAccountClient = jest.fn((_token: string) => ({ getLoginInfoByToken: mockGetLoginInfoByToken }))
jest.mock(
  '@hcengineering/server-client',
  () => ({ getAccountClient: (token: string) => mockGetAccountClient(token) }),
  { virtual: true }
)

const account = 'acc' as AccountUuid
const workspace = 'ws' as WorkspaceUuid

describe('management auth', () => {
  it('reads a bearer token', () => {
    expect(readBearer('Bearer abc.def')).toBe('abc.def')
    expect(readBearer('bearer abc')).toBe('abc')
    expect(readBearer('Basic abc')).toBeUndefined()
    expect(readBearer(undefined)).toBeUndefined()
  })

  it('accepts a workspace user token', () => {
    const token: Token = { account, workspace }
    expect(tokenIdentity(token, 0)).toEqual({ account, workspace })
  })

  it('rejects API tokens, expired tokens and tokens without a workspace', () => {
    expect(tokenIdentity({ account, workspace, extra: { apiTokenId: 't1' } }, 0)).toBeUndefined()
    expect(tokenIdentity({ account, workspace, exp: 10 }, 10_000)).toBeUndefined()
    expect(tokenIdentity({ account, workspace: '' as WorkspaceUuid }, 0)).toBeUndefined()
  })

  it('lets channel owners and maintainers manage hooks', () => {
    const user = { account, workspace, role: AccountRole.User }
    expect(canManageHooks(user, [account])).toBe(true)
    expect(canManageHooks(user, ['other' as AccountUuid])).toBe(false)
    expect(canManageHooks({ ...user, role: AccountRole.Maintainer }, [])).toBe(true)
    expect(canManageHooks({ ...user, role: AccountRole.Owner }, [])).toBe(true)
    expect(canManageHooks({ ...user, role: AccountRole.Guest }, [])).toBe(false)
  })
})

describe('authenticate', () => {
  const uuidAccount = '6f1f6a4e-1f1a-4c1e-9d2a-0a0b0c0d0e01' as AccountUuid
  const uuidWorkspace = '6f1f6a4e-1f1a-4c1e-9d2a-0a0b0c0d0e02' as WorkspaceUuid
  const sessionToken = generateToken(uuidAccount, uuidWorkspace)

  beforeEach(() => {
    mockGetAccountClient.mockClear()
    mockGetLoginInfoByToken.mockReset()
  })

  it('returns the caller with the role from the account service', async () => {
    mockGetLoginInfoByToken.mockResolvedValue({ account: uuidAccount, workspace: uuidWorkspace, role: AccountRole.Maintainer })
    const caller = await authenticate(`Bearer ${sessionToken}`, 0)
    expect(caller).toEqual({ account: uuidAccount, workspace: uuidWorkspace, role: AccountRole.Maintainer })
  })

  it('rejects a revoked session token', async () => {
    mockGetLoginInfoByToken.mockRejectedValue(new PlatformError(new Status(Severity.ERROR, platform.status.Unauthorized, {})))
    expect(await authenticate(`Bearer ${sessionToken}`, 0)).toBeUndefined()
  })

  it('rethrows account service failures other than Unauthorized', async () => {
    mockGetLoginInfoByToken.mockRejectedValue(new Error('account down'))
    await expect(authenticate(`Bearer ${sessionToken}`, 0)).rejects.toThrow('account down')
  })
})
