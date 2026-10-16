import type { Channel } from '@hcengineering/chunter'
import { AccountRole, type AccountUuid, type Markup, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { HostRefusedError } from '../../host-guard'
import type { Json } from '../../http-json'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import { type AppAnswer, type PostTarget, type RunChannel } from '../run'
import { createRequestHandler, MAX_RESPOND_BYTES } from '../server'
import { CommandStore, MAX_COMMANDS_PER_WORKSPACE, RESPONSE_URL_TTL_MS } from '../store'
import { MemoryKv } from '../../tracker-hooks/__tests__/memory-kv'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const WORKSPACE = 'ws-1' as WorkspaceUuid
const GENERAL = 'chunter:space:General' as Ref<Channel>
const FRONT = 'https://app.servone.vn'

const callers: { [token: string]: Caller } = {
  member: { account: 'acc-member' as AccountUuid, workspace: WORKSPACE, role: AccountRole.User },
  maintainer: { account: 'acc-boss' as AccountUuid, workspace: WORKSPACE, role: AccountRole.Maintainer },
  owner: { account: 'acc-owner' as AccountUuid, workspace: WORKSPACE, role: AccountRole.Owner },
  stranger: { account: 'acc-x' as AccountUuid, workspace: 'ws-2' as WorkspaceUuid, role: AccountRole.Owner }
}

interface Harness {
  base: string
  store: CommandStore
  clock: { now: number }
  answer: { next: AppAnswer }
  sentBodies: string[]
  posts: Array<{ target: PostTarget, commandName: string, message: Markup }>
  close: () => Promise<void>
}

let h: Harness

async function start (): Promise<Harness> {
  const store = new CommandStore(new MemoryKv())
  const clock = { now: 1_000 }
  const answer = { next: { status: 200, error: undefined, body: '' } satisfies AppAnswer }
  const sentBodies: string[] = []
  const posts: Harness['posts'] = []
  const general: RunChannel = { name: 'general', isPrivate: false, isArchived: false, members: [] }
  const handler = createRequestHandler({
    store,
    userBuckets: new TokenBuckets(5, 0.5),
    commandBuckets: new TokenBuckets(60, 1),
    publicUrl: 'https://svc.servone.vn',
    frontUrl: FRONT,
    now: () => clock.now,
    sleep: async () => await new Promise<void>(() => {}),
    authenticate: async (authorization) => callers[(authorization ?? '').replace('Bearer ', '')],
    resolveHost: async (host) => {
      if (host === 'internal.test') throw new HostRefusedError('refused_address', 'private')
      return '203.0.113.5'
    },
    sealSecret: (workspace, commandId, secret) => ({ keyId: 'test', iv: workspace, tag: commandId, data: secret }),
    findChannel: async (_workspace, channel) => (channel === GENERAL ? general : undefined),
    describeRunner: async () => ({ name: 'Ana Lee', email: undefined }),
    send: async (_command, body) => {
      sentBodies.push(body)
      return answer.next
    },
    post: async (_workspace, target, commandName, message) => {
      posts.push({ target, commandName, message })
      return true
    },
    report: () => {}
  })
  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    store,
    clock,
    answer,
    sentBodies,
    posts,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => { resolve() }))
    }
  }
}

beforeEach(async () => {
  h = await start()
})

afterEach(async () => {
  await h.close()
})

async function call (method: string, path: string, who?: string, body?: string): Promise<{ status: number, json: Json }> {
  const headers: { [name: string]: string } = { 'Content-Type': 'application/json' }
  if (who !== undefined) headers.Authorization = `Bearer ${who}`
  const response = await fetch(`${h.base}${path}`, { method, headers, body })
  return { status: response.status, json: (await response.json()) as Json }
}

const draft = (overrides: { [key: string]: string } = {}): string =>
  JSON.stringify({ name: 'deploy', description: 'Deploy a service', usage: '<service> <env>', url: 'https://app.test/deploy', ...overrides })

async function createDeploy (): Promise<string> {
  const created = await call('POST', '/v1/chat/commands', 'maintainer', draft())
  const command = typeof created.json === 'object' && created.json !== null && !Array.isArray(created.json) ? created.json.command : null
  return typeof command === 'object' && command !== null && !Array.isArray(command) && typeof command.id === 'string' ? command.id : ''
}

async function issueToken (): Promise<string> {
  await createDeploy()
  await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'deploy', text: 'api', channel: GENERAL }))
  const responseUrl = new URLSearchParams(h.sentBodies[h.sentBodies.length - 1]).get('response_url') ?? ''
  return responseUrl.slice(responseUrl.lastIndexOf('/') + 1)
}

describe('management routes', () => {
  it('needs a session', async () => {
    expect((await call('GET', '/v1/chat/commands')).status).toBe(401)
  })

  it('lets Maintainers and Owners create, and shows the secret only once', async () => {
    const created = await call('POST', '/v1/chat/commands', 'owner', draft())
    expect(created.status).toBe(201)
    expect(created.json).toMatchObject({
      command: { name: 'deploy', description: 'Deploy a service', usage: '<service> <env>', url: 'https://app.test/deploy' },
      secret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    })
    const listed = await call('GET', '/v1/chat/commands', 'maintainer')
    expect(JSON.stringify(listed.json)).not.toContain('secret')
  })

  it('refuses members on management routes', async () => {
    expect((await call('POST', '/v1/chat/commands', 'member', draft())).status).toBe(403)
    const id = await createDeploy()
    expect((await call('PATCH', `/v1/chat/commands/${id}`, 'member', '{"description":"x"}')).status).toBe(403)
    expect((await call('DELETE', `/v1/chat/commands/${id}`, 'member')).status).toBe(403)
  })

  it('lists name, description and usage to members, and the URL to managers', async () => {
    await createDeploy()
    const forMember = await call('GET', '/v1/chat/commands', 'member')
    expect(forMember.json).toEqual({
      commands: [{ id: expect.any(String), name: 'deploy', description: 'Deploy a service', usage: '<service> <env>' }]
    })
    const forManager = await call('GET', '/v1/chat/commands', 'maintainer')
    expect(forManager.json).toMatchObject({ commands: [{ url: 'https://app.test/deploy' }] })
  })

  it('refuses built-in, duplicate and badly formed names', async () => {
    expect((await call('POST', '/v1/chat/commands', 'maintainer', draft({ name: 'issue' }))).json).toEqual({ error: 'reserved_name', field: 'name' })
    await createDeploy()
    expect((await call('POST', '/v1/chat/commands', 'maintainer', draft())).json).toEqual({ error: 'name_taken', field: 'name' })
    expect((await call('POST', '/v1/chat/commands', 'maintainer', draft({ name: 'Deploy' }))).json).toEqual({ error: 'invalid_name', field: 'name' })
  })

  it('accepts only public https URLs', async () => {
    expect((await call('POST', '/v1/chat/commands', 'maintainer', draft({ url: 'http://app.test/x' }))).json).toEqual({ error: 'invalid_url', field: 'url' })
    expect((await call('POST', '/v1/chat/commands', 'maintainer', draft({ url: 'https://internal.test/x' }))).json).toEqual({ error: 'refused_address', field: 'url' })
  })

  it('caps a workspace at 50 commands', async () => {
    for (let i = 0; i < MAX_COMMANDS_PER_WORKSPACE; i++) {
      await h.store.saveCommand({
        id: `id${i}`,
        workspace: WORKSPACE,
        name: `cmd-${i}`,
        description: '',
        usage: '',
        url: 'https://app.test/x',
        sealedSecret: { keyId: 'k', iv: '', tag: '', data: '' },
        createdBy: 'acc-boss' as AccountUuid,
        createdOn: 1
      })
    }
    const refused = await call('POST', '/v1/chat/commands', 'maintainer', draft())
    expect(refused).toEqual({ status: 409, json: { error: 'too_many_commands' } })
  })

  it('edits and deletes within the caller workspace only', async () => {
    const id = await createDeploy()
    const edited = await call('PATCH', `/v1/chat/commands/${id}`, 'maintainer', '{"description":"Ship it"}')
    expect(edited.json).toMatchObject({ command: { name: 'deploy', description: 'Ship it' } })
    expect((await call('PATCH', `/v1/chat/commands/${id}`, 'stranger', '{"description":"x"}')).status).toBe(404)
    expect((await call('DELETE', `/v1/chat/commands/${id}`, 'maintainer')).json).toEqual({ ok: true })
    expect((await call('GET', '/v1/chat/commands', 'member')).json).toEqual({ commands: [] })
  })
})

describe('run route', () => {
  it('posts an in_channel answer', async () => {
    await createDeploy()
    h.answer.next = { status: 200, error: undefined, body: '{"response_type":"in_channel","text":"Deploying"}' }
    const ran = await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'deploy', text: 'api', channel: GENERAL }))
    expect(ran).toEqual({ status: 200, json: { shown: 'posted' } })
  })

  it('answers 404 for a deleted command and 429 with Retry-After when limited', async () => {
    const unknown = await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'deploy', text: '', channel: GENERAL }))
    expect(unknown).toEqual({ status: 404, json: { error: 'unknown_command' } })
    for (let i = 0; i < 4; i++) {
      await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'deploy', text: '', channel: GENERAL }))
    }
    const response = await fetch(`${h.base}/v1/chat/commands/run`, {
      method: 'POST',
      headers: { Authorization: 'Bearer member' },
      body: JSON.stringify({ command: 'deploy', text: '', channel: GENERAL })
    })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('2')
  })

  it('runs a command typed with capitals, as Slack ignores case', async () => {
    await createDeploy()
    const ran = await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'Deploy', text: 'api', channel: GENERAL }))
    expect(ran).toEqual({ status: 200, json: { shown: 'sent' } })
    expect(new URLSearchParams(h.sentBodies[0]).get('command')).toBe('/deploy')
  })

  it('refuses a command that is not a valid name', async () => {
    const ran = await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'x'.repeat(33), text: '', channel: GENERAL }))
    expect(ran).toEqual({ status: 400, json: { error: 'invalid_name', field: 'command' } })
  })

  it('answers 403 for a channel the runner cannot use', async () => {
    await createDeploy()
    const denied = await call('POST', '/v1/chat/commands/run', 'member', JSON.stringify({ command: 'deploy', text: '', channel: 'dm-1' }))
    expect(denied).toEqual({ status: 403, json: { error: 'channel_denied' } })
  })
})

describe('respond route', () => {
  it('posts through a response URL without a session', async () => {
    const token = await issueToken()
    const answered = await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"response_type":"in_channel","text":"Done"}')
    expect(answered).toEqual({ status: 200, json: { ok: true } })
    expect(h.posts[0].target).toEqual({ kind: 'channel', channel: GENERAL })
  })

  it('turns an ephemeral answer into a direct message to the runner', async () => {
    const token = await issueToken()
    await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"text":"Only you"}')
    expect(h.posts[0].target).toEqual({ kind: 'direct', account: 'acc-member' })
  })

  it('allows five uses', async () => {
    const token = await issueToken()
    for (let use = 0; use < 5; use++) {
      expect((await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"text":"x"}')).status).toBe(200)
    }
    expect((await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"text":"x"}')).status).toBe(404)
  })

  it('expires after 30 minutes', async () => {
    const token = await issueToken()
    h.clock.now += RESPONSE_URL_TTL_MS
    expect((await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"text":"x"}')).status).toBe(404)
  })

  it('respond still works after the command is deleted', async () => {
    const token = await issueToken()
    const [command] = await h.store.listCommands(WORKSPACE)
    await h.store.deleteCommand(WORKSPACE, command.id)
    const answered = await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"response_type":"in_channel","text":"Done"}')
    expect(answered.status).toBe(200)
    expect(h.posts[0].commandName).toBe('deploy')
  })

  it('refuses bad tokens, empty and oversized bodies', async () => {
    expect((await call('POST', '/v1/chat/commands/respond/short', undefined, '{"text":"x"}')).status).toBe(404)
    const token = await issueToken()
    expect((await call('POST', `/v1/chat/commands/respond/${token}`, undefined, '{"response_type":"in_channel"}')).json).toEqual({ error: 'no_text' })
    const huge = JSON.stringify({ text: 'x'.repeat(MAX_RESPOND_BYTES) })
    expect((await call('POST', `/v1/chat/commands/respond/${token}`, undefined, huge)).json).toEqual({ error: 'too_large', field: 'body' })
  })
})
