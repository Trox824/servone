import type { Event } from '@hcengineering/calendar'
import contact, { type Person } from '@hcengineering/contact'
import core, { type AccountUuid, AccountRole, type Class, type Doc, type MeasureContext, MeasureMetricsContext, type Ref, type Tx, TxFactory, type WorkspaceUuid } from '@hcengineering/core'
import hr from '@hcengineering/hr'
import notification from '@hcengineering/notification'
import setting from '@hcengineering/setting'
import task from '@hcengineering/task'
import tracker, { MilestoneStatus, type Issue, type Project } from '@hcengineering/tracker'
import { type MemoryWorkspace, memoryWorkspace } from '../../workflows/__tests__/memory-workspace'
import { isStarterIssueDone, markStarterDone, MEETING_MIXIN, movedStarterIssue, sampleArchived, tickedKey } from '../autotick'
import { inBackground } from '../background'
import { captureBody } from '../../funnel'
import { resolveLanguage } from '../content'
import { focusChanged, parseTeamFocus } from '../focus'
import { seedHolidays, VN_HOLIDAYS } from '../holidays'
import { starterIssueId } from '../ids'
import { type JoinedClient, notifyJoined } from '../joined'
import { reconcileStarter, seedStarter } from '../seed'

jest.mock('../../config', () => ({ __esModule: true, default: {} }))

const CREATOR = { account: 'acc-owner' as AccountUuid, person: 'person-owner' as Ref<Person> }
const collab = { writeMarkdown: async (): Promise<never> => 'blob' as never }
const human = new TxFactory('social-1' as never)
const system = new TxFactory(core.account.System)

function newWorkspace (): MemoryWorkspace {
  const ws = memoryWorkspace()
  ws.seed(tracker.class.IssueStatus, 'st-todo', { name: 'Todo', category: task.statusCategory.ToDo })
  ws.seed(tracker.class.IssueStatus, 'st-done', { name: 'Done', category: task.statusCategory.Won })
  ws.seed(task.class.TaskType, 'kind-issue', { parent: 'type-classic', statuses: ['st-todo', 'st-done'] })
  ws.seed(tracker.class.Project, tracker.project.DefaultProject, {
    name: 'Default', description: 'Default project', identifier: 'TSK', sequence: 0, type: 'type-classic', defaultIssueStatus: 'st-todo'
  })
  ws.seed(hr.class.Department, hr.ids.Head, { name: 'Organization', members: [] })
  return ws
}

const keys = (ws: MemoryWorkspace): string[] => ws.rows(tracker.class.Issue).map((issue) => issue._id.replace('servone:starter:', ''))

describe('starter set per team focus', () => {
  it.each([
    ['projects', ['invite', 'project', 'sprint', 'meeting']],
    ['operations', ['invite', 'managers', 'leave', 'meeting']],
    ['both', ['invite', 'project', 'leave', 'meeting']]
  ] as const)('%s seeds %j', async (focus, expected) => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', focus)
    expect(keys(ws)).toEqual(expected)
    expect((ws.rows(tracker.class.Project)[0] as Project).sequence).toBe(4)
  })

  it('reads a missing or unknown focus as both', () => {
    expect([parseTeamFocus(undefined), parseTeamFocus('nonsense'), parseTeamFocus('operations')]).toEqual(['both', 'both', 'operations'])
  })
})

describe('reconcileStarter', () => {
  it('does nothing before the workspace was seeded', async () => {
    const ws = newWorkspace()
    expect(await reconcileStarter(ws.client, collab, 'en', 'operations')).toBe(false)
    expect(ws.sent).toHaveLength(0)
  })

  it('swaps the open tasks of the old focus for the new focus', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', 'both')
    expect(await reconcileStarter(ws.client, collab, 'en', 'operations')).toBe(true)
    expect(keys(ws).sort()).toEqual(['invite', 'leave', 'managers', 'meeting'])
    expect((ws.rows(tracker.class.Project)[0] as Project).sequence).toBe(5)
  })

  it('keeps a task the team already finished', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', 'both')
    Object.assign(ws.rows(tracker.class.Issue).find((issue) => issue._id === starterIssueId('project')) as Issue, { status: 'st-done' })
    await reconcileStarter(ws.client, collab, 'en', 'operations')
    expect(keys(ws).sort()).toEqual(['invite', 'leave', 'managers', 'meeting', 'project'])
  })

  it('writes nothing when the set already matches', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', 'projects')
    const sent = ws.sent.length
    await reconcileStarter(ws.client, collab, 'en', 'projects')
    expect(ws.sent).toHaveLength(sent)
  })

  it('recognises a focus write on the workspace setting', () => {
    const created = system.createTxCreateDoc(setting.class.WorkspaceSetting, core.space.Workspace, { servoneTeamFocus: 'projects' } as never)
    const iconOnly = system.createTxUpdateDoc(setting.class.WorkspaceSetting, core.space.Workspace, 'ws-setting' as never, { icon: null })
    const focused = system.createTxUpdateDoc(setting.class.WorkspaceSetting, core.space.Workspace, 'ws-setting' as never, { servoneTeamFocus: 'both' } as never)
    expect([focusChanged(created), focusChanged(iconOnly), focusChanged(focused)]).toEqual([true, false, true])
  })
})

describe('auto-tick detection', () => {
  const create = (cls: Ref<Class<Doc>>, attributes: object, factory = human, id = 'new-doc'): Tx =>
    factory.createTxCreateDoc(cls, core.space.Workspace, attributes as never, id as never)

  it('ticks project for a person-made project but not the seed or the default one', () => {
    expect(tickedKey(create(tracker.class.Project, {}))).toBe('project')
    expect(tickedKey(create(tracker.class.Project, {}, system))).toBeUndefined()
    expect(tickedKey(create(tracker.class.Project, {}, human, tracker.project.DefaultProject))).toBeUndefined()
  })

  it('ticks sprint only when a sprint is running', () => {
    const start = human.createTxUpdateDoc(tracker.class.Milestone, core.space.Workspace, 'm' as never, { status: MilestoneStatus.InProgress })
    const plan = human.createTxUpdateDoc(tracker.class.Milestone, core.space.Workspace, 'm' as never, { status: MilestoneStatus.Planned })
    expect([tickedKey(start), tickedKey(plan)]).toEqual(['sprint', undefined])
  })

  it('ticks managers when a department gains one', () => {
    const set = human.createTxUpdateDoc(hr.class.Department, core.space.Workspace, 'd' as never, { managers: ['emp'] as never })
    const push = human.createTxUpdateDoc(hr.class.Department, core.space.Workspace, 'd' as never, { $push: { managers: 'emp' } } as never)
    const clear = human.createTxUpdateDoc(hr.class.Department, core.space.Workspace, 'd' as never, { managers: [] })
    expect([tickedKey(set), tickedKey(push), tickedKey(clear)]).toEqual(['managers', 'managers', undefined])
  })

  it('ticks leave on a request and meeting on the meeting mixin', () => {
    const meeting = human.createTxMixin('e' as Ref<Event>, core.class.Doc as never, core.space.Workspace, MEETING_MIXIN as never, {} as never)
    expect([tickedKey(create(hr.class.Request, {})), tickedKey(meeting), tickedKey(create(contact.class.Person, {}))]).toEqual(['leave', 'meeting', undefined])
  })

  it('spots a starter issue changing status, and the default project being archived', () => {
    const moved = human.createTxUpdateDoc(tracker.class.Issue, core.space.Workspace, starterIssueId('invite'), { status: 'st-done' as never })
    const other = human.createTxUpdateDoc(tracker.class.Issue, core.space.Workspace, 'user-issue' as never, { status: 'st-done' as never })
    const archived = human.createTxUpdateDoc(tracker.class.Project, core.space.Space, tracker.project.DefaultProject, { archived: true })
    expect([movedStarterIssue(moved), movedStarterIssue(other), sampleArchived(archived)]).toEqual([starterIssueId('invite'), undefined, true])
  })
})

describe('markStarterDone', () => {
  it('moves a starter task to Done once', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', 'both')
    await markStarterDone(ws.client, 'leave')
    expect(await isStarterIssueDone(ws.client, starterIssueId('leave'))).toBe(true)
    const sent = ws.sent.length
    await markStarterDone(ws.client, 'leave')
    expect(ws.sent).toHaveLength(sent)
  })

  it('ignores a task the workspace does not have', async () => {
    const ws = newWorkspace()
    await seedStarter(ws.client, collab, CREATOR, 'en', 'projects')
    const sent = ws.sent.length
    await markStarterDone(ws.client, 'managers')
    expect(ws.sent).toHaveLength(sent)
  })
})

describe('notifyJoined', () => {
  const OWNER = 'acc-owner' as AccountUuid
  const ADMIN = 'acc-admin' as AccountUuid
  const NEWCOMER = 'acc-new' as AccountUuid
  const people = [
    { _id: 'p-owner', name: 'Smith,John', personUuid: OWNER },
    { _id: 'p-admin', name: 'Nguyen,Binh', personUuid: ADMIN },
    { _id: 'p-new', name: 'Lee,Ann', personUuid: NEWCOMER }
  ]

  function fakeClient (): { client: JoinedClient, created: Array<{ id?: string, attrs: Record<string, unknown> }> } {
    const created: Array<{ id?: string, attrs: Record<string, unknown> }> = []
    const client = {
      findOne: async (cls: string, query: Record<string, string>) => {
        if (cls === contact.class.Person) return people.find((it) => (query._id !== undefined ? it._id === query._id : it.personUuid === query.personUuid))
        if (cls === contact.class.PersonSpace) return { _id: `space-${query.person}` }
        if (cls === notification.class.CommonInboxNotification) return created.find((it) => it.id === query._id)
        return undefined
      },
      createDoc: async (_cls: string, _space: string, attrs: Record<string, unknown>, id?: string) => {
        created.push({ id, attrs })
        return id ?? 'context'
      }
    } as unknown as JoinedClient
    return { client, created }
  }

  const accounts = (createdBy: AccountUuid): Parameters<typeof notifyJoined>[1] => ({
    workspaceInfo: async () => ({ name: 'Acme', createdBy }),
    members: async () => [
      { person: OWNER, role: AccountRole.Owner, disabled: false },
      { person: ADMIN, role: AccountRole.Owner, disabled: false },
      { person: NEWCOMER, role: AccountRole.User, disabled: false }
    ],
    locale: async (account) => (account === ADMIN ? 'vi' : null)
  })
  const notices = (created: Array<{ attrs: Record<string, unknown> }>): Array<[unknown, unknown]> =>
    created.filter((it) => it.attrs.message !== undefined).map((it) => [it.attrs.user, it.attrs.message])

  it('tells the creator and each owner in their own language', async () => {
    const { client, created } = fakeClient()
    const outcome = await notifyJoined(client, accounts(OWNER), 'p-new' as Ref<Person>)
    expect(outcome).toEqual({ newcomer: NEWCOMER, isCreator: false })
    expect(notices(created)).toEqual([
      [OWNER, 'embedded:embedded:Ann Lee joined Acme'],
      [ADMIN, 'embedded:embedded:Ann Lee đã tham gia Acme']
    ])
  })

  it('sends nothing twice for the same newcomer', async () => {
    const { client, created } = fakeClient()
    await notifyJoined(client, accounts(OWNER), 'p-new' as Ref<Person>)
    const sent = created.length
    await notifyJoined(client, accounts(OWNER), 'p-new' as Ref<Person>)
    expect(created).toHaveLength(sent)
  })

  it('stays quiet when the creator is the one who joined', async () => {
    const { client, created } = fakeClient()
    expect(await notifyJoined(client, accounts(NEWCOMER), 'p-new' as Ref<Person>)).toEqual({ newcomer: NEWCOMER, isCreator: true })
    expect(created).toHaveLength(0)
  })
})

describe('seedHolidays', () => {
  it('adds the Vietnam holidays once', async () => {
    const ws = newWorkspace()
    await seedHolidays(ws.client)
    await seedHolidays(ws.client)
    const holidays = ws.rows(hr.class.PublicHoliday)
    expect(holidays).toHaveLength(VN_HOLIDAYS.length)
    expect(holidays.find((it) => it._id === ('servone:holiday:vn:2027-2-6' as never))).toMatchObject({ title: 'Tết Nguyên đán (mùng 1)', date: { year: 2027, month: 1, day: 6 } })
  })
})

describe('language and funnel', () => {
  it('prefers the stored locale and falls back to a guess', () => {
    expect([resolveLanguage('en', 'Công ty', 'Lê,An'), resolveLanguage(null, 'Công ty', 'Lê,An'), resolveLanguage('fr', 'Acme', 'Smith,John')]).toEqual(['en', 'vi', 'en'])
  })

  it('groups an event by workspace and keeps anonymous ones off person profiles', () => {
    const workspace = 'ws-1' as WorkspaceUuid
    const anonymous = JSON.parse(captureBody({ event: 'sample_archived', workspace }, 'phc_key'))
    expect(anonymous).toMatchObject({ api_key: 'phc_key', event: 'sample_archived', distinct_id: 'workspace:ws-1', properties: { $groups: { company: 'ws-1' }, $process_person_profile: false } })
    const person = JSON.parse(captureBody({ event: 'workspace_created', workspace, account: 'acc-1', properties: { team_focus: 'both' } }, 'phc_key'))
    expect(person).toMatchObject({ distinct_id: 'acc-1', properties: { team_focus: 'both', $process_person_profile: true } })
  })
})

describe('inBackground', () => {
  const ctx = new MeasureMetricsContext('test', {}) as MeasureContext

  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('retries a failing job and logs once it gives up', async () => {
    const error = jest.spyOn(ctx, 'error').mockImplementation(() => {})
    const work = jest.fn(async () => { throw new Error('transactor down') })
    inBackground(ctx, 'job', { workspace: 'ws-1' }, work)
    await jest.runAllTimersAsync()
    expect(work).toHaveBeenCalledTimes(3)
    expect(error).toHaveBeenCalledWith('job failed', { workspace: 'ws-1', error: 'transactor down' })
  })

  it('stops retrying after a success', async () => {
    const work = jest.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValue(undefined)
    inBackground(ctx, 'job', {}, work)
    await jest.runAllTimersAsync()
    expect(work).toHaveBeenCalledTimes(2)
  })
})
