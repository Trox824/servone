import chunter from '@hcengineering/chunter'
import contact, { type SocialIdentity } from '@hcengineering/contact'
import { type AccountUuid, type Class, type Doc, type MarkupBlobRef, type Ref, SocialIdType, type Space, type WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'
import tags from '@hcengineering/tags'
import { PlatformError, Severity, Status } from '@hcengineering/platform'
import tracker from '@hcengineering/tracker'
import { WAITING_APPROVAL } from '@servone/approvals'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

import { CollabTimeoutError } from '../../mcp/collab'
import { ME_PERSON, ME_SOCIAL } from '../../mcp/__tests__/fixtures'
import type { Caller } from '../../mcp/types'
import { BASE, type Fixture, issueRow, rowsOf, setup } from '../../tracker/__tests__/fixture'
import { TokenBuckets } from '../../webhooks/rate'
import { Idempotency } from '../idempotency'
import { MAX_BODY_BYTES } from '../request'
import { createRequestHandler } from '../server'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const NOW = Date.UTC(2026, 8, 27, 8, 20)
const CALLER: Caller = {
  token: 'good',
  apiTokenId: 'tok-1',
  account: 'acc-me' as AccountUuid,
  workspace: 'ws-1' as WorkspaceUuid,
  expiresAt: NOW + 60_000
}

class MemoryKv implements KeyValueClient {
  readonly values = new Map<string, string>()

  async setValue<T>(key: string, value: T): Promise<void> {
    this.values.set(key, JSON.stringify(value))
  }

  async getValue<T>(key: string): Promise<T | null> {
    const stored = this.values.get(key)
    return stored === undefined ? null : (JSON.parse(stored) as T)
  }

  async deleteKey (key: string): Promise<void> {
    this.values.delete(key)
  }

  async listKeys (prefix?: string): Promise<ListResult | null> {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(prefix ?? ''))
    return { keys, count: keys.length, namespace: 'test' }
  }
}

interface Harness {
  base: string
  f: Fixture
  reports: Array<[string, Record<string, string | number>]>
  close: () => Promise<void>
}

// Stores what the handler writes so later reads in the same test see it, as the transactor would.
function persistWrites (f: Fixture): void {
  f.addCollection.mockImplementation(
    async (cls: Ref<Class<Doc>>, space: Ref<Space>, attachedTo: Ref<Doc>, attachedToClass: Ref<Class<Doc>>, collection: string, attrs: object, id: Ref<Doc>) => {
      const row = { ...BASE, ...attrs, _id: id, _class: cls, space, attachedTo, attachedToClass, collection, createdBy: ME_SOCIAL, createdOn: NOW }
      rowsOf(f.tables, cls).push(row)
      return id
    }
  )
}

async function start (buckets = new TokenBuckets(30, 1)): Promise<Harness> {
  const f = setup()
  persistWrites(f)
  const me: Doc & Pick<SocialIdentity, 'attachedTo' | 'type' | 'value'> = {
    ...BASE,
    _id: 'social-me' as Ref<SocialIdentity>,
    _class: contact.class.SocialIdentity,
    attachedTo: ME_PERSON,
    type: SocialIdType.EMAIL,
    value: 'hung@servone.vn'
  }
  rowsOf(f.tables, contact.class.SocialIdentity).push(me)
  rowsOf(f.tables, tracker.class.Issue).push(issueRow(12))
  const reports: Harness['reports'] = []
  const handler = createRequestHandler({
    authenticate: async (authorization) => (authorization === 'Bearer good' ? CALLER : undefined),
    session: async () => f.session,
    buckets,
    idempotency: new Idempotency(new MemoryKv(), () => NOW),
    now: () => NOW,
    report: (event, fields) => {
      reports.push([event, fields])
    }
  })
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    f,
    reports,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

let h: Harness

afterEach(async () => {
  await h.close()
})

async function call (method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<Response> {
  return await fetch(`${h.base}${path}`, {
    method,
    headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json', ...headers },
    body
  })
}

const NEW_ISSUE = JSON.stringify({ project: 'SRV', title: 'Login fails', priority: 'high', labels: ['bug'], dueDate: '2026-10-01' })

describe('routing and auth', () => {
  it.each([
    ['GET', '/v1/tracker/issues/SRV-12/other'],
    ['GET', '/v1/tracker/issues/%E0%A4%A'],
    ['GET', '/v1/tracker/projects']
  ])('%s %s is not found', async (method, path) => {
    h = await start()
    const response = await call(method, path)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })

  it.each([
    ['DELETE', '/v1/tracker/issues/SRV-12', 'GET, PATCH'],
    ['GET', '/v1/tracker/issues', 'POST'],
    ['GET', '/v1/tracker/issues/SRV-12/comments', 'POST']
  ])('%s %s answers 405', async (method, path, allow) => {
    h = await start()
    const response = await call(method, path)
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe(allow)
  })

  it('answers 401 with a bearer challenge', async () => {
    h = await start()
    const response = await call('GET', '/v1/tracker/issues/SRV-12', undefined, { Authorization: 'Bearer revoked' })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('rate limits per token', async () => {
    h = await start(new TokenBuckets(1, 1))
    expect((await call('GET', '/v1/tracker/issues/SRV-12')).status).toBe(200)
    const limited = await call('GET', '/v1/tracker/issues/SRV-12')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('1')
  })
})

describe('POST /v1/tracker/issues', () => {
  it('creates the issue and points at it', async () => {
    h = await start()
    const response = await call('POST', '/v1/tracker/issues', NEW_ISSUE)
    expect(response.status).toBe(201)
    expect(response.headers.get('location')).toBe('/v1/tracker/issues/SRV-13')
    expect(await response.json()).toEqual({
      identifier: 'SRV-13',
      project: 'SRV',
      title: 'Login fails',
      description: '',
      status: 'Backlog',
      priority: 'high',
      assignee: null,
      labels: ['Bug'],
      dueDate: '2026-10-01',
      createdOn: '2026-09-27T08:20:00.000Z',
      modifiedOn: '1970-01-01T00:00:00.000Z',
      comments: []
    })
  })

  it('creates one issue for a repeated key and marks the replay', async () => {
    h = await start()
    const first = await call('POST', '/v1/tracker/issues', NEW_ISSUE, { 'Idempotency-Key': 'zap-1' })
    const again = await call('POST', '/v1/tracker/issues', NEW_ISSUE, { 'Idempotency-Key': 'zap-1' })
    expect([first.status, again.status]).toEqual([201, 201])
    expect(first.headers.get('idempotent-replayed')).toBeNull()
    expect(again.headers.get('idempotent-replayed')).toBe('true')
    expect((await again.json()).identifier).toBe('SRV-13')
    expect(h.f.updateDoc).toHaveBeenCalledTimes(1)
  })

  it('refuses a key reused for another body', async () => {
    h = await start()
    await call('POST', '/v1/tracker/issues', NEW_ISSUE, { 'Idempotency-Key': 'zap-1' })
    const response = await call('POST', '/v1/tracker/issues', JSON.stringify({ project: 'SRV', title: 'Other' }), { 'Idempotency-Key': 'zap-1' })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: 'idempotency_key_reused' })
  })

  it('answers 409 while the same key is still running', async () => {
    h = await start()
    let release = (): void => {}
    h.f.updateDoc.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { object: { sequence: 13 } }
    })
    const first = call('POST', '/v1/tracker/issues', NEW_ISSUE, { 'Idempotency-Key': 'zap-1' })
    while (h.f.updateDoc.mock.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await call('POST', '/v1/tracker/issues', NEW_ISSUE, { 'Idempotency-Key': 'zap-1' })
    expect(second.status).toBe(409)
    expect(second.headers.get('retry-after')).toBe('1')
    release()
    expect((await first).status).toBe(201)
  })

  it.each([
    ['{', 400, { error: 'invalid_json' }],
    [JSON.stringify({ project: 'SRV', title: 'A', priority: 'p1' }), 400, { error: 'invalid', field: 'priority' }],
    [JSON.stringify({ project: 'XYZ', title: 'A' }), 404, { error: 'not_found', field: 'project' }],
    [JSON.stringify({ project: 'SRV', title: 'A', labels: ['nope'] }), 400, { error: 'invalid', field: 'labels' }],
    [JSON.stringify({ project: 'SRV', title: 'A', assignee: 'ghost@servone.vn' }), 400, { error: 'invalid', field: 'assignee' }]
  ])('maps %s to %i', async (body, status, expected) => {
    h = await start()
    const response = await call('POST', '/v1/tracker/issues', body)
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject(expected)
  })

  it('rejects a bad key before reading the body', async () => {
    h = await start()
    const response = await call('POST', '/v1/tracker/issues', NEW_ISSUE, { 'Idempotency-Key': 'has space' })
    expect(await response.json()).toMatchObject({ error: 'invalid', field: 'Idempotency-Key' })
  })

  it('rejects a body over the cap', async () => {
    h = await start()
    const response = await call('POST', '/v1/tracker/issues', JSON.stringify({ project: 'SRV', title: 'A', description: 'x'.repeat(MAX_BODY_BYTES) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'too_large', field: 'body' })
  })
})

describe('GET and PATCH /v1/tracker/issues/{identifier}', () => {
  it('reads an issue by a forgiving identifier', async () => {
    h = await start()
    const response = await call('GET', '/v1/tracker/issues/srv-12')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ identifier: 'SRV-12', status: 'In Progress', assignee: { name: 'An Tran', email: 'an@servone.vn' } })
  })

  it('answers 404 for an unknown issue', async () => {
    h = await start()
    const response = await call('GET', '/v1/tracker/issues/SRV-99')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found', field: 'identifier', message: 'Issue SRV-99 not found' })
  })

  it('patches and returns the fresh issue', async () => {
    h = await start()
    h.f.update.mockImplementation(async (issue: Doc, update: object) => {
      Object.assign(issue, update)
      return {}
    })
    const response = await call('PATCH', '/v1/tracker/issues/SRV-12', JSON.stringify({ status: 'backlog', assignee: null }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ identifier: 'SRV-12', status: 'Backlog', assignee: null })
  })

  it('lists known statuses for an unknown one', async () => {
    h = await start()
    const response = await call('PATCH', '/v1/tracker/issues/SRV-12', JSON.stringify({ status: 'Doing' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'invalid',
      field: 'status',
      message: 'Status "Doing" not found. Known: Backlog, In Progress'
    })
  })

  it('answers 503 when the editor service is stuck', async () => {
    h = await start()
    rowsOf(h.f.tables, tracker.class.Issue).push(issueRow(14, { description: 'blob-1' as MarkupBlobRef }))
    h.f.readMarkdown.mockRejectedValue(new CollabTimeoutError())
    const response = await call('GET', '/v1/tracker/issues/SRV-14')
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.json()).toMatchObject({ error: 'unavailable' })
  })

  it('answers 409 waiting_approval when the approval guard refuses the change', async () => {
    h = await start()
    h.f.update.mockRejectedValue(new PlatformError(new Status(Severity.ERROR, WAITING_APPROVAL, {})))
    const response = await call('PATCH', '/v1/tracker/issues/SRV-12', JSON.stringify({ status: 'backlog' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'waiting_approval' })
  })

  it('hides internal failures', async () => {
    h = await start()
    h.f.findOne.mockRejectedValue(new Error('connection to db-7 refused'))
    const response = await call('GET', '/v1/tracker/issues/SRV-12')
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('db-7')
    expect(h.reports).toEqual([['issues api failed', { route: 'issue', error: 'Error: connection to db-7 refused' }]])
  })
})

describe('POST /v1/tracker/issues/{identifier}/comments', () => {
  it('posts once per key and returns the comment', async () => {
    h = await start()
    const first = await call('POST', '/v1/tracker/issues/SRV-12/comments', '{"text":"Deployed to staging"}', { 'Idempotency-Key': 'c-1' })
    const again = await call('POST', '/v1/tracker/issues/srv-12/comments', '{"text":"Deployed to staging"}', { 'Idempotency-Key': 'c-1' })
    expect([first.status, again.status]).toEqual([201, 201])
    const comment = await first.json()
    expect(comment).toEqual({
      id: expect.any(String),
      issue: 'SRV-12',
      author: 'Hung Nguyen',
      createdOn: '2026-09-27T08:20:00.000Z',
      text: 'Deployed to staging'
    })
    expect((await again.json()).id).toBe(comment.id)
    expect(again.headers.get('idempotent-replayed')).toBe('true')
    expect(rowsOf(h.f.tables, chunter.class.ChatMessage)).toHaveLength(1)
  })

  it('rejects an empty comment', async () => {
    h = await start()
    const response = await call('POST', '/v1/tracker/issues/SRV-12/comments', '{"text":" "}')
    expect(await response.json()).toMatchObject({ error: 'invalid', field: 'text' })
  })
})
