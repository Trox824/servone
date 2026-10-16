import type { Channel } from '@hcengineering/chunter'
import { AccountRole, type AccountUuid, type Markup, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import type { Caller } from '../../webhooks/auth'
import { TokenBuckets } from '../../webhooks/rate'
import {
  APP_TIMEOUT_MS,
  type AppAnswer,
  type PostTarget,
  respondToCommand,
  RESPOND_PATH,
  runCommand,
  type RunChannel,
  type RunDeps,
  type RunOutcome,
  USER_BURST,
  USER_REFILL_PER_SECOND,
  COMMAND_BURST,
  COMMAND_REFILL_PER_SECOND
} from '../run'
import { CommandStore, type StoredCommand } from '../store'
import { MemoryKv } from '../../tracker-hooks/__tests__/memory-kv'

jest.mock('@hcengineering/server-client', () => ({ getAccountClient: jest.fn() }), { virtual: true })

const WORKSPACE = 'ws-1' as WorkspaceUuid
const GENERAL = 'chunter:space:General' as Ref<Channel>
const SECRET_ROOM = 'chunter:space:Secret' as Ref<Channel>
const DIRECT = 'dm-1' as Ref<Channel>
const ANA = 'acc-ana' as AccountUuid
const member: Caller = { account: ANA, workspace: WORKSPACE, role: AccountRole.User }

const deploy: StoredCommand = {
  id: 'c1',
  workspace: WORKSPACE,
  name: 'deploy',
  description: 'Deploy a service',
  usage: '<service> <env>',
  url: 'https://app.test/deploy',
  sealedSecret: { keyId: 'k', iv: '', tag: '', data: '' },
  createdBy: ANA,
  createdOn: 1
}

const channels = new Map<Ref<Channel>, RunChannel>([
  [GENERAL, { name: 'general', isPrivate: false, isArchived: false, members: [] }],
  [SECRET_ROOM, { name: 'secret', isPrivate: true, isArchived: false, members: ['acc-other' as AccountUuid] }]
])

interface Harness {
  deps: RunDeps
  sentBodies: string[]
  posts: Array<{ target: PostTarget, commandName: string, message: Markup }>
}

function harness (overrides: Partial<RunDeps> & { answer?: AppAnswer } = {}): Harness {
  const sentBodies: string[] = []
  const posts: Harness['posts'] = []
  const answer = overrides.answer ?? { status: 200, error: undefined, body: '' }
  const store = new CommandStore(new MemoryKv())
  void store.saveCommand(deploy)
  const deps: RunDeps = {
    store,
    userBuckets: new TokenBuckets(USER_BURST, USER_REFILL_PER_SECOND),
    commandBuckets: new TokenBuckets(COMMAND_BURST, COMMAND_REFILL_PER_SECOND),
    publicUrl: 'https://svc.servone.vn',
    now: () => 1_000,
    // Never fires unless a test swaps in a timer-backed sleep.
    sleep: async () => await new Promise<void>(() => {}),
    findChannel: async (_workspace, channel) => channels.get(channel),
    describeRunner: async () => ({ name: 'Ana Lee', email: 'ana@company.com' }),
    send: async (_command, body) => {
      sentBodies.push(body)
      return answer
    },
    post: async (_workspace, target, commandName, message) => {
      posts.push({ target, commandName, message })
      return true
    },
    ...overrides
  }
  return { deps, sentBodies, posts }
}

const run = (command = 'deploy', channel = GENERAL): { command: string, text: string, channel: Ref<Channel> } => ({
  command,
  text: 'api staging',
  channel
})

const json = (reply: object): AppAnswer => ({ status: 200, error: undefined, body: JSON.stringify(reply) })

describe('runCommand', () => {
  it('posts an in_channel answer with a used-by line', async () => {
    const h = harness({ answer: json({ response_type: 'in_channel', text: 'Deploying api' }) })
    expect(await runCommand(h.deps, member, run())).toEqual({ shown: 'posted' })
    expect(h.posts).toHaveLength(1)
    expect(h.posts[0].target).toEqual({ kind: 'channel', channel: GENERAL })
    expect(h.posts[0].commandName).toBe('deploy')
    expect(h.posts[0].message).toContain('Deploying api')
    expect(h.posts[0].message).toContain('used by Ana Lee')
  })

  it('returns an ephemeral answer as private markup without posting', async () => {
    const h = harness({ answer: json({ text: 'Only you see this' }) })
    const outcome = await runCommand(h.deps, member, run())
    expect(outcome.shown).toBe('private')
    expect(outcome.shown === 'private' ? outcome.markup : '').toContain('Only you see this')
    expect(h.posts).toEqual([])
  })

  it('shows a plain-text answer privately', async () => {
    const h = harness({ answer: { status: 200, error: undefined, body: 'Queued build 12' } })
    expect(await runCommand(h.deps, member, run())).toMatchObject({ shown: 'private' })
  })

  it('reports an empty 200 as sent', async () => {
    expect(await runCommand(harness().deps, member, run())).toEqual({ shown: 'sent' })
  })

  it('reports an error status as failed', async () => {
    const h = harness({ answer: { status: 500, error: undefined, body: 'boom' } })
    expect(await runCommand(h.deps, member, run())).toEqual({ shown: 'failed', status: 500 })
  })

  it('reports unreachable, private and TLS failures as failed with the error', async () => {
    for (const error of ['connect_failed', 'refused_address', 'tls'] as const) {
      const h = harness({ answer: { status: 0, error, body: '' } })
      expect(await runCommand(h.deps, member, run())).toEqual({ shown: 'failed', error })
    }
  })

  it('reports an unreadable answer as failed', async () => {
    const h = harness({ answer: { status: 200, error: undefined, body: '{bad' } })
    expect(await runCommand(h.deps, member, run())).toEqual({ shown: 'failed', error: 'invalid_reply' })
  })

  it('counts an app that has not answered after 3 s as sent', async () => {
    jest.useFakeTimers()
    try {
      let markSendStarted = (): void => {}
      const sendStarted = new Promise<void>((resolve) => {
        markSendStarted = resolve
      })
      const h = harness({
        sleep: async (ms) => {
          await new Promise<void>((resolve) => setTimeout(resolve, ms))
        },
        send: async () => {
          markSendStarted()
          return await new Promise<AppAnswer>(() => {})
        }
      })
      let outcome: RunOutcome | undefined
      const running = runCommand(h.deps, member, run()).then((settled) => {
        outcome = settled
      })
      await sendStarted
      jest.advanceTimersByTime(APP_TIMEOUT_MS - 1)
      await Promise.resolve()
      expect(outcome).toBeUndefined()
      jest.advanceTimersByTime(1)
      await running
      expect(outcome).toEqual({ shown: 'sent' })
    } finally {
      jest.useRealTimers()
    }
  })

  it('refuses an unknown command', async () => {
    expect(await runCommand(harness().deps, member, run('nope'))).toEqual({ shown: 'unknown_command' })
  })

  it('refuses a private channel the runner is not in and a direct message', async () => {
    const h = harness()
    expect(await runCommand(h.deps, member, run('deploy', SECRET_ROOM))).toEqual({ shown: 'channel_denied' })
    expect(await runCommand(h.deps, member, run('deploy', DIRECT))).toEqual({ shown: 'channel_denied' })
    expect(h.sentBodies).toEqual([])
  })

  it('refuses guests', async () => {
    const guest: Caller = { ...member, role: AccountRole.Guest }
    expect(await runCommand(harness().deps, guest, run())).toEqual({ shown: 'channel_denied' })
  })

  it('limits a runner to 5 in a burst, then 1 per 2 seconds', async () => {
    const h = harness()
    for (let i = 0; i < USER_BURST; i++) expect((await runCommand(h.deps, member, run())).shown).toBe('sent')
    expect(await runCommand(h.deps, member, run())).toEqual({ shown: 'rate_limited', retryAfterSeconds: 2 })
  })

  it('limits a command to 60 runs a minute across runners', async () => {
    const h = harness()
    for (let i = 0; i < COMMAND_BURST; i++) {
      const runner: Caller = { ...member, account: `acc-${i}` as AccountUuid }
      expect((await runCommand(h.deps, runner, run())).shown).toBe('sent')
    }
    expect(await runCommand(h.deps, member, run())).toEqual({ shown: 'rate_limited', retryAfterSeconds: 1 })
  })

  it('sends a signed-ready form body with a working response URL', async () => {
    const h = harness()
    await runCommand(h.deps, member, run())
    const fields = new URLSearchParams(h.sentBodies[0])
    expect(fields.get('command')).toBe('/deploy')
    expect(fields.get('text')).toBe('api staging')
    expect(fields.get('channel_name')).toBe('general')
    expect(fields.get('user_name')).toBe('Ana Lee')
    expect(fields.get('user_email')).toBe('ana@company.com')
    const responseUrl = fields.get('response_url') ?? ''
    expect(responseUrl.startsWith(`https://svc.servone.vn${RESPOND_PATH}`)).toBe(true)
    const token = responseUrl.slice(`https://svc.servone.vn${RESPOND_PATH}`.length)
    expect(await respondToCommand(h.deps, token, '{"response_type":"in_channel","text":"Done"}')).toEqual({ kind: 'posted' })
  })

  it('escapes markdown in the runner name', async () => {
    const h = harness({
      answer: json({ response_type: 'in_channel', text: 'ok' }),
      describeRunner: async () => ({ name: 'Ana [x](https://evil.test)', email: undefined })
    })
    await runCommand(h.deps, member, run())
    expect(h.posts[0].message).not.toContain('"href":"https://evil.test"')
    expect(h.posts[0].message).toContain('used by Ana [x](https://evil.test)')
  })
})

describe('respondToCommand', () => {
  async function issuedToken (h: Harness): Promise<string> {
    await runCommand(h.deps, member, run())
    const responseUrl = new URLSearchParams(h.sentBodies[h.sentBodies.length - 1]).get('response_url') ?? ''
    return responseUrl.slice(responseUrl.lastIndexOf('/') + 1)
  }

  it('posts an in_channel answer in the channel with the used-by line', async () => {
    const h = harness()
    const token = await issuedToken(h)
    expect(await respondToCommand(h.deps, token, '{"response_type":"in_channel","text":"Deployed"}')).toEqual({ kind: 'posted' })
    expect(h.posts[0].target).toEqual({ kind: 'channel', channel: GENERAL })
    expect(h.posts[0].message).toContain('used by Ana Lee')
  })

  it('sends an ephemeral answer to the runner as a direct message', async () => {
    const h = harness()
    const token = await issuedToken(h)
    expect(await respondToCommand(h.deps, token, '{"text":"Only you"}')).toEqual({ kind: 'posted' })
    expect(h.posts[0].target).toEqual({ kind: 'direct', account: ANA })
    expect(h.posts[0].message).not.toContain('used by')
  })

  it('refuses an unknown token, an empty answer and an invalid one', async () => {
    const h = harness()
    const token = await issuedToken(h)
    expect(await respondToCommand(h.deps, 'x'.repeat(43), '{"text":"hi"}')).toEqual({ kind: 'not_found' })
    expect(await respondToCommand(h.deps, token, '')).toEqual({ kind: 'empty' })
    expect(await respondToCommand(h.deps, token, '{bad')).toEqual({ kind: 'invalid' })
  })
})
