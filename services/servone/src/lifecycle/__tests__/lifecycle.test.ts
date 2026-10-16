import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { AccountRole } from '@hcengineering/core'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { createInviteRecordHandler, parseInviteEmails } from '../http'
import { buildMail, COPY, DAY_MS, MAX_LATE_MS, planSteps, type LifecycleMail } from '../plan'
import { type Creator, type LifecycleWorkspace, runWorkspace, type WorkspaceFacts } from '../run'
import { inviteIdOf, type DoneRecord } from '../store'

jest.mock('../../config', () => ({ __esModule: true, default: {} }))

const WORKSPACE: LifecycleWorkspace = { uuid: 'ws-1' as WorkspaceUuid, name: 'Acme', url: 'acme', createdOn: 0 }
const FOUNDER = 'founder@servone.vn'
const FRONT = 'https://app.test'

function memoryStore (): { store: Parameters<typeof runWorkspace>[0]['store'], done: Map<string, DoneRecord>, invites: Array<{ id: string, email: string, at: number }> } {
  const done = new Map<string, DoneRecord>()
  const invites: Array<{ id: string, email: string, at: number }> = []
  return {
    done,
    invites,
    store: {
      isDone: async (workspace, step) => done.has(`${workspace}/${step}`),
      markDone: async (workspace, step, record) => { done.set(`${workspace}/${step}`, record) },
      release: async (workspace, step) => { done.delete(`${workspace}/${step}`) },
      listInvites: async () => invites
    }
  }
}

function setup (overrides: Partial<WorkspaceFacts> = {}, creator: Partial<Creator> = {}): { run: (now: number) => Promise<number>, sent: LifecycleMail[], memory: ReturnType<typeof memoryStore>, fail: { on: boolean } } {
  const memory = memoryStore()
  const sent: LifecycleMail[] = []
  const fail = { on: false }
  const facts: WorkspaceFacts = {
    hasTeammate: async () => false,
    outsideTaskCount: async () => 0,
    hasJoined: async () => false,
    creator: async () => ({ email: 'owner@acme.vn', firstName: 'An', language: 'en', ...creator }),
    ...overrides
  }
  const deps = {
    store: memory.store,
    sendMail: async (mail: LifecycleMail) => { if (fail.on) return false; sent.push(mail); return true },
    frontUrl: FRONT,
    founderEmail: FOUNDER
  }
  return { run: async (now) => await runWorkspace(deps, WORKSPACE, facts, now), sent, memory, fail }
}

describe('lifecycle emails', () => {
  it('sends nothing before the first email is due', async () => {
    const { run, sent } = setup()
    expect(await run(DAY_MS - 1)).toBe(0)
    expect(sent).toEqual([])
  })

  it('sends each email once, even across repeated ticks', async () => {
    const { run, sent } = setup()
    await run(DAY_MS)
    await run(DAY_MS + 60_000)
    expect(sent.map((mail) => mail.subject)).toEqual(['Your workspace has one person in it'])
    await run(4 * DAY_MS)
    await run(4 * DAY_MS)
    expect(sent).toHaveLength(2)
  })

  it('skips the teammate email when someone already joined, and does not ask again', async () => {
    let hasTeammate = true
    const { run, sent } = setup({ hasTeammate: async () => hasTeammate })
    await run(DAY_MS)
    hasTeammate = false
    await run(DAY_MS + 60_000)
    expect(sent).toEqual([])
  })

  it('skips the import email at 5 or more tasks outside Getting started', async () => {
    const { run, sent } = setup({ hasTeammate: async () => true, outsideTaskCount: async () => 5 })
    await run(4 * DAY_MS)
    expect(sent).toEqual([])
  })

  it('sends the import email below the threshold with an import link', async () => {
    const { run, sent } = setup({ hasTeammate: async () => true, outsideTaskCount: async () => 4 })
    await run(4 * DAY_MS)
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain(`${FRONT}/workbench/acme/setting/import`)
  })

  it('sends the founder email from a person with Reply-To and signature, in any state', async () => {
    const { run, sent } = setup({ hasTeammate: async () => true, outsideTaskCount: async () => 50 })
    await run(10 * DAY_MS)
    expect(sent).toHaveLength(1)
    expect(sent[0].headers).toEqual({ 'Reply-To': FOUNDER })
    expect(sent[0].text.endsWith('Hung, Servone founder')).toBe(true)
  })

  it('sends one invitee email per pending invitee and skips those who joined', async () => {
    const { run, sent, memory } = setup({ hasTeammate: async () => true, outsideTaskCount: async () => 9, hasJoined: async (email) => email === 'in@acme.vn' })
    memory.invites.push({ id: inviteIdOf('out@acme.vn'), email: 'out@acme.vn', at: DAY_MS }, { id: inviteIdOf('in@acme.vn'), email: 'in@acme.vn', at: DAY_MS })
    await run(4 * DAY_MS)
    await run(4 * DAY_MS + 1000)
    const invitee = sent.filter((mail) => mail.subject.includes('has not joined'))
    expect(invitee.map((mail) => mail.subject)).toEqual(['out@acme.vn has not joined yet'])
    expect(invitee[0].text).toContain(`${FRONT}/workbench/acme/setting/invites`)
  })

  it('drops an email that is more than the lateness limit overdue', async () => {
    const { run, sent } = setup()
    await run(DAY_MS + MAX_LATE_MS + 1)
    expect(sent.map((mail) => mail.subject)).not.toContain('Your workspace has one person in it')
  })

  it('does not plan invitee emails that would land after day 14', () => {
    const ids = planSteps(0, [{ id: 'late', email: 'x@y.z', at: 12 * DAY_MS }]).map((step) => step.id)
    expect(ids).not.toContain('invitee-late')
  })

  it('releases the claim when mail fails so the next tick retries', async () => {
    const { run, sent, fail } = setup()
    fail.on = true
    await expect(run(DAY_MS)).rejects.toThrow('Mail service refused')
    fail.on = false
    await run(DAY_MS + 60_000)
    expect(sent).toHaveLength(1)
  })

  it('skips when the creator has no verified email', async () => {
    const { run, sent, memory } = setup({}, { email: undefined })
    await run(DAY_MS)
    expect(sent).toEqual([])
    expect(memory.done.get('ws-1/teammate-1d')?.outcome).toBe('skipped')
  })

  it('writes copy in the creator language', async () => {
    const { run, sent } = setup({}, { language: 'vi' })
    await run(DAY_MS)
    expect(sent[0].subject).toBe(COPY.vi.teammate.subject({ firstName: '', workspaceName: '', url: '' }))
    expect(buildMail('vi', { id: 'x', kind: 'founder', dueAt: 0 }, { firstName: 'An', workspaceName: 'Acme', frontUrl: FRONT, workspaceUrl: 'acme' }, 'a@b.c', FOUNDER).text).toContain('Hung, Servone founder')
  })
})

describe('invite records', () => {
  it('parses and lowercases emails, rejecting bad bodies', () => {
    expect(parseInviteEmails({ emails: [' An@Acme.vn '] })).toEqual(['an@acme.vn'])
    expect(parseInviteEmails({ emails: [] })).toBeUndefined()
    expect(parseInviteEmails({ emails: ['nope'] })).toBeUndefined()
    expect(parseInviteEmails([])).toBeUndefined()
  })

  let server: Server
  let base: string
  const recorded: string[] = []

  beforeAll(async () => {
    const handler = createInviteRecordHandler({
      frontUrl: FRONT,
      now: () => 7,
      authenticate: async (authorization) => (authorization === 'Bearer good' ? { account: 'a' as AccountUuid, workspace: 'ws-1' as WorkspaceUuid, role: AccountRole.User } : undefined),
      recordInvite: async (workspace, email, at) => { recorded.push(`${workspace}/${email}/${at}`) }
    })
    server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => { server.close() })

  const post = async (auth: string | undefined, body: object): Promise<number> =>
    (await fetch(`${base}/v1/lifecycle/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth === undefined ? {} : { Authorization: auth }) }, body: JSON.stringify(body) })).status

  it('records invites for the caller workspace', async () => {
    expect(await post('Bearer good', { emails: ['an@acme.vn'] })).toBe(200)
    expect(recorded).toEqual(['ws-1/an@acme.vn/7'])
  })

  it('rejects unauthenticated and malformed requests', async () => {
    expect(await post(undefined, { emails: ['an@acme.vn'] })).toBe(401)
    expect(await post('Bearer good', { emails: 'an@acme.vn' })).toBe(400)
  })
})
