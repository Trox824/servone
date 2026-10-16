import { AccountRole, type AccountUuid, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'
import type { IssueTemplate } from '@hcengineering/tracker'
import type { Answer, FormDefinition } from '@servone/forms'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import { createFormsHandler, type PublicForm, type TemplateAccess } from '../server'
import { FormLinkStore, type StoredFormLink } from '../store'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const WORKSPACE = 'ws-1' as WorkspaceUuid
const TEMPLATE = 'tpl-1' as Ref<IssueTemplate>
const FRONT = 'https://app.servone.vn'

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

const callers: Record<string, Caller> = {
  member: { account: 'member' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User },
  outsider: { account: 'outsider' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User }
}

const definition: FormDefinition = {
  version: 1,
  fields: [
    { id: 'summary', label: 'Summary <b>', isRequired: true, kind: 'text', target: { to: 'title' } },
    { id: 'details', label: 'Details', isRequired: false, kind: 'longText', target: { to: 'description' } }
  ]
}

interface Harness {
  base: string
  submitted: Array<{ link: StoredFormLink, answers: Answer[] }>
  access: { value: TemplateAccess | undefined }
  form: { value: PublicForm | undefined }
  close: () => Promise<void>
}

async function start (): Promise<Harness> {
  const submitted: Harness['submitted'] = []
  const access: Harness['access'] = { value: { canManage: true, isForm: true } }
  const form: Harness['form'] = { value: { title: 'Bug report', definition } }
  const handler = createFormsHandler({
    store: new FormLinkStore(new MemoryKv()),
    viewBuckets: new TokenBuckets(),
    submitBuckets: new TokenBuckets(2, 0.001),
    publicUrl: 'https://svc.servone.vn',
    frontUrl: FRONT,
    now: () => 1000,
    authenticate: async (authorization) => callers[(authorization ?? '').replace('Bearer ', '')],
    templateAccess: async (caller, template) =>
      template !== TEMPLATE ? undefined : caller.account === 'outsider' ? { canManage: false, isForm: true } : access.value,
    loadForm: async (workspace, template) => (workspace === WORKSPACE && template === TEMPLATE ? form.value : undefined),
    submit: async (link, answers) => {
      submitted.push({ link, answers })
      return 'SRV-7'
    },
    report: () => {}
  })
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    submitted,
    access,
    form,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

let harness: Harness

beforeEach(async () => {
  harness = await start()
})

afterEach(async () => {
  await harness.close()
})

async function manage (method: string, caller = 'member'): Promise<Response> {
  return await fetch(`${harness.base}/forms/templates/${TEMPLATE}/link`, {
    method,
    headers: { Authorization: `Bearer ${caller}`, Origin: FRONT }
  })
}

async function createLink (): Promise<string> {
  const response = await manage('POST')
  expect(response.status).toBe(201)
  const body = (await response.json()) as { link: { url: string } }
  return body.link.url.replace('https://svc.servone.vn', harness.base)
}

async function post (url: string, fields: Record<string, string>): Promise<Response> {
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString()
  })
}

describe('link management', () => {
  it('creates, reads back and revokes a link', async () => {
    const url = await createLink()
    const read = (await (await manage('GET')).json()) as { link: { url: string } | null }
    expect(read.link?.url.replace('https://svc.servone.vn', harness.base)).toBe(url)
    expect((await manage('DELETE')).status).toBe(200)
    expect((await fetch(url)).status).toBe(404)
    expect(await (await manage('GET')).json()).toEqual({ link: null })
  })

  it('rotating a link retires the old URL', async () => {
    const first = await createLink()
    const second = await createLink()
    expect((await fetch(first)).status).toBe(404)
    expect((await fetch(second)).status).toBe(200)
  })

  it('rejects anonymous callers, non-members and templates without questions', async () => {
    expect((await manage('POST', 'nobody')).status).toBe(401)
    expect((await manage('POST', 'outsider')).status).toBe(403)
    harness.access.value = { canManage: true, isForm: false }
    expect((await manage('POST')).status).toBe(409)
  })

  it('allows the front origin only', async () => {
    const response = await manage('GET')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONT)
  })
})

describe('public page', () => {
  it('answers not found for a wrong secret', async () => {
    const url = await createLink()
    const wrong = url.slice(0, -1) + (url.endsWith('A') ? 'B' : 'A')
    expect((await fetch(wrong)).status).toBe(404)
  })

  it('renders escaped labels without leaking the URL as referrer', async () => {
    const response = await fetch(await createLink())
    expect(response.status).toBe(200)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    const page = await response.text()
    expect(page).toContain('Summary &lt;b&gt;')
    expect(page).not.toContain('Summary <b>')
  })

  it('shows problems and keeps answers when a required field is empty', async () => {
    const response = await post(await createLink(), { f_details: '<script>x</script>' })
    expect(response.status).toBe(400)
    const page = await response.text()
    expect(page).toContain('This field is required.')
    expect(page).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(harness.submitted).toHaveLength(0)
  })

  it('files the issue and shows its reference', async () => {
    const response = await post(await createLink(), { f_summary: 'Login fails', f_details: 'Steps' })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Reference: SRV-7')
    expect(harness.submitted[0].answers.map((answer) => answer.field.id)).toEqual(['summary', 'details'])
  })

  it('pretends success when the trap field is filled', async () => {
    const response = await post(await createLink(), { f_summary: 'Buy now', website: 'spam.example' })
    expect(response.status).toBe(200)
    expect(harness.submitted).toHaveLength(0)
  })

  it('stops a link that submits too often', async () => {
    const url = await createLink()
    await post(url, { f_summary: 'one' })
    await post(url, { f_summary: 'two' })
    const third = await post(url, { f_summary: 'three' })
    expect(third.status).toBe(429)
    expect(third.headers.get('retry-after')).not.toBeNull()
  })

  it('does not lock other visitors out when one IP exhausts the link', async () => {
    const url = await createLink()
    const submitFrom = async (ip: string): Promise<Response> =>
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip },
        body: new URLSearchParams({ f_summary: 'x' }).toString()
      })
    await submitFrom('1.1.1.1')
    await submitFrom('1.1.1.1')
    expect((await submitFrom('1.1.1.1')).status).toBe(429)
    expect((await submitFrom('2.2.2.2')).status).toBe(200)
  })

  it('answers not found once the template loses its questions', async () => {
    const url = await createLink()
    harness.form.value = undefined
    expect((await fetch(url)).status).toBe(404)
  })
})
