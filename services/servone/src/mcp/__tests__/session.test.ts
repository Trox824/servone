import type { WorkspaceSession, Caller } from '../types'
import { createSessionCache, SESSION_CACHE_LIMIT, SESSION_TTL_MS } from '../session'
import { ME_ACCOUNT, WORKSPACE, fakeSession } from './fixtures'

jest.mock('@hcengineering/server-client', () => ({ getTransactorEndpoint: jest.fn() }), { virtual: true })
jest.mock('@hcengineering/api-client', () => ({ createRestClient: jest.fn(), createRestTxOperations: jest.fn() }), {
  virtual: true
})
jest.mock('../../config', () => ({ __esModule: true, default: { mcp: { CollaboratorUrl: 'http://collab' } } }))

function caller (apiTokenId: string): Caller {
  return { token: 't', apiTokenId, account: ME_ACCOUNT, workspace: WORKSPACE, expiresAt: 10_000 }
}

const byApiToken = (it: Caller): string => it.apiTokenId

describe('createSessionCache', () => {
  it('reuses a session for the same API token', async () => {
    const open = jest.fn(async (_: Caller): Promise<WorkspaceSession> => fakeSession())
    const get = createSessionCache(open, byApiToken, () => 0)
    const first = await get(caller('x'))
    const second = await get(caller('x'))
    expect(open).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('opens separate sessions for different API tokens', async () => {
    const open = jest.fn(async (_: Caller): Promise<WorkspaceSession> => fakeSession())
    const get = createSessionCache(open, byApiToken, () => 0)
    await get(caller('x'))
    await get(caller('y'))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('reopens after the TTL', async () => {
    let now = 0
    const open = jest.fn(async (_: Caller): Promise<WorkspaceSession> => fakeSession())
    const get = createSessionCache(open, byApiToken, () => now)
    await get(caller('x'))
    now = SESSION_TTL_MS - 1
    await get(caller('x'))
    expect(open).toHaveBeenCalledTimes(1)
    now = SESSION_TTL_MS + 1
    await get(caller('x'))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('drops a failed open so the next call retries', async () => {
    const open = jest
      .fn(async (_: Caller): Promise<WorkspaceSession> => fakeSession())
      .mockRejectedValueOnce(new Error('transactor down'))
    const get = createSessionCache(open, byApiToken, () => 0)
    await expect(get(caller('x'))).rejects.toThrow('transactor down')
    await expect(get(caller('x'))).resolves.toBeDefined()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('evicts oldest entry beyond SESSION_CACHE_LIMIT', async () => {
    const open = jest.fn(async (_: Caller): Promise<WorkspaceSession> => fakeSession())
    const get = createSessionCache(open, byApiToken, () => 0)
    for (let i = 0; i <= SESSION_CACHE_LIMIT; i++) {
      await get(caller(`t${i}`))
    }
    expect(open).toHaveBeenCalledTimes(SESSION_CACHE_LIMIT + 1)
    await get(caller(`t${SESSION_CACHE_LIMIT}`))
    expect(open).toHaveBeenCalledTimes(SESSION_CACHE_LIMIT + 1)
    await get(caller('t0'))
    expect(open).toHaveBeenCalledTimes(SESSION_CACHE_LIMIT + 2)
  })

  it('keys sessions by the given key', async () => {
    const open = jest.fn(async (_: Caller): Promise<WorkspaceSession> => fakeSession())
    const get = createSessionCache(open, (it: Caller) => it.token, () => 0)
    await get({ ...caller('x'), token: 'same' })
    await get({ ...caller('y'), token: 'same' })
    expect(open).toHaveBeenCalledTimes(1)
  })
})
