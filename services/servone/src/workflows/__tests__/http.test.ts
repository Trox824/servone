import { AccountRole, type AccountUuid, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import type { Project } from '@hcengineering/tracker'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import { createWorkflowsHandler, type WorkflowsHttpDeps } from '../http'

const FRONT = 'https://platform.servone.app'
const caller: Caller = { account: 'acc' as AccountUuid, workspace: 'ws-1' as WorkspaceUuid, role: AccountRole.User }

async function post (deps: Partial<WorkflowsHttpDeps>, path: string, body?: string): Promise<Response> {
  const handler = createWorkflowsHandler({
    frontUrl: FRONT,
    buckets: new TokenBuckets(1, 1 / 60),
    now: () => 0,
    authenticate: async () => caller,
    setup: async () => {},
    create: async () => ({ project: 'p-1' as Ref<Project> }),
    ...deps
  })
  const server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { Authorization: 'Bearer t' }, body })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const postSetup = async (deps: Partial<WorkflowsHttpDeps>): Promise<Response> => await post(deps, '/workflows/setup')

describe('workflows http', () => {
  it('refuses a caller without a session token', async () => {
    const setup = jest.fn(async () => {})
    const response = await postSetup({ authenticate: async () => undefined, setup })
    expect(response.status).toBe(401)
    expect(setup).not.toHaveBeenCalled()
  })

  it('sets up the caller workspace', async () => {
    const setup = jest.fn(async () => {})
    const response = await postSetup({ setup })
    expect(response.status).toBe(200)
    expect(setup).toHaveBeenCalledWith(caller)
  })

  it('answers 429 once the caller runs out of setup attempts', async () => {
    const buckets = new TokenBuckets(1, 1 / 60)
    await postSetup({ buckets })
    const response = await postSetup({ buckets })
    expect(response.status).toBe(429)
  })
  it('creates a workflow from the posted body for the caller', async () => {
    const create = jest.fn(async () => ({ project: 'p-7' as Ref<Project> }))
    const body = { name: 'Mua hàng', department: 'dept-sales', template: 'mua-hang', language: 'vi' }
    const response = await post({ create }, '/workflows', JSON.stringify(body))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ project: 'p-7' })
    expect(create).toHaveBeenCalledWith(caller, body)
  })

  it('answers 400 with the refusal code', async () => {
    const response = await post({ create: async () => ({ error: 'unknown_template' }) }, '/workflows', '{}')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'unknown_template' })
  })

  it('refuses a guest', async () => {
    const create = jest.fn(async () => ({ project: 'p-7' as Ref<Project> }))
    const response = await post({ create, authenticate: async () => ({ ...caller, role: AccountRole.Guest }) }, '/workflows', '{}')
    expect(response.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })
})
