import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createServer } from 'http'
import type { AddressInfo } from 'net'

import type { Caller } from '../../webhooks/auth'
import { createImportHandler, type ImportHttpDeps } from '../http'
import { MAX_IMPORT_BODY_BYTES } from '../request'
import { ImportRefError } from '../write'

const FRONT = 'https://platform.servone.app'
const owner: Caller = { account: 'acc' as AccountUuid, workspace: 'ws-1' as WorkspaceUuid, role: AccountRole.Owner }

async function call (deps: Partial<ImportHttpDeps>, init: RequestInit & { path?: string } = {}): Promise<Response> {
  const handler = createImportHandler({
    frontUrl: FRONT,
    authenticate: async () => owner,
    run: async () => ({ id: 'p-1', identifier: 'MOB' }),
    report: () => {},
    ...deps
  })
  const server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    return await fetch(`http://127.0.0.1:${port}${init.path ?? '/v1/import'}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', Origin: FRONT, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'project', name: 'Mobile' }),
      ...init
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('import http', () => {
  it('answers the browser preflight', async () => {
    const response = await call({}, { method: 'OPTIONS', body: undefined })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
    expect(response.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type')
  })

  it('runs the parsed request for the caller', async () => {
    const run = jest.fn(async () => ({ id: 'p-1', identifier: 'MOB' }))
    const response = await call({ run })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
    expect(await response.json()).toEqual({ id: 'p-1', identifier: 'MOB' })
    expect(run).toHaveBeenCalledWith(owner, { op: 'project', name: 'Mobile' })
  })

  it('refuses a caller without a session', async () => {
    const response = await call({ authenticate: async () => undefined })
    expect(response.status).toBe(401)
  })

  it.each([AccountRole.User, AccountRole.Guest])('refuses a %s', async (role) => {
    const run = jest.fn()
    const response = await call({ run, authenticate: async () => ({ ...owner, role }) })
    expect(response.status).toBe(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('lets a maintainer import', async () => {
    const response = await call({ authenticate: async () => ({ ...owner, role: AccountRole.Maintainer }) })
    expect(response.status).toBe(200)
  })

  it('answers 400 for a body outside the contract', async () => {
    const response = await call({}, { body: JSON.stringify({ op: 'project', name: '' }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid', field: 'name' })
  })

  it('answers 413 past the body cap', async () => {
    const response = await call({}, { body: 'x'.repeat(MAX_IMPORT_BODY_BYTES + 1) })
    expect(response.status).toBe(413)
  })

  it('answers 400 for an unknown target', async () => {
    const response = await call({ run: async () => { throw new ImportRefError('project') } })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'not_found', field: 'project' })
  })

  it('reports a failed write and answers 500', async () => {
    const report = jest.fn()
    const response = await call({ report, run: async () => { throw new Error('transactor down') } })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal' })
    expect(report).toHaveBeenCalledWith('import failed', { op: 'project', error: 'transactor down' })
  })

  it('answers 404 elsewhere', async () => {
    const response = await call({}, { path: '/v1/import/extra' })
    expect(response.status).toBe(404)
  })
})
