//
// Seeds a workspace with a lived-in demo Scrum project (~14 weeks, see ./scenario.ts) plus the demo teammates.
//
//   SERVER_SECRET=… dev/railway/node_modules/.bin/tsx dev/servone-tracker-seed/seed.ts \
//     --workspace servone [--member you@example.com] [--dry-run | --wipe]
//
// Past dates need the system account: the transactor overwrites `modifiedOn` for any other account
// (foundations/server/packages/middleware/src/modified.ts), so this signs a system token with SERVER_SECRET.
//
// A missing Scrum type is created as "Set up sprints" would (sprints/scrum-spec.ts).
//
import { parseArgs } from 'node:util'
import {
  ISSUE_POINTS,
  PROJECT,
  SCRUM_TYPE_ID,
  SPRINT,
  TASK_TYPE_IDS
} from '../../packages/servone-ui/src/plugins/tracker-resources/sprints/scrum-spec'
import { DEMO_DOMAIN } from './content'
import { buildScenario, type IssueFields, type Scenario, type SeedEvent } from './scenario'
import {
  AvatarType,
  chunter,
  combineName,
  connect,
  contact,
  core,
  defaultAccountsUrl,
  ensureScrum,
  generateId,
  makeRank,
  MilestoneStatus,
  TimeReportDayType,
  tracker
} from './workspace'

const SCRUM_TYPE = SCRUM_TYPE_ID
const TASK_TYPE = TASK_TYPE_IDS

/** Marks the seeded project, so --wipe and re-runs can find it and nothing else. */
const MARKER = 'Demo data from dev/servone-tracker-seed. Remove with --wipe.'
const IDENTIFIER = 'APP'

function readArgs (): { workspace: string, members: string[], dryRun: boolean, wipe: boolean, seed: number, accounts: string } {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string', default: '' },
      member: { type: 'string', multiple: true, default: [] },
      'dry-run': { type: 'boolean', default: false },
      wipe: { type: 'boolean', default: false },
      seed: { type: 'string', default: '7' },
      accounts: { type: 'string', default: '' }
    }
  })
  return {
    workspace: values.workspace,
    members: values.member,
    dryRun: values['dry-run'],
    wipe: values.wipe,
    seed: Number(values.seed),
    accounts: values.accounts === '' ? defaultAccountsUrl() : values.accounts
  }
}

function markup (text: string): string {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
}

async function wipe (client: any): Promise<void> {
  const projects = (await client.findAll(tracker.class.Project, {})).filter((p: any) => p.description === MARKER)
  for (const project of projects) {
    const issues = await client.findAll(tracker.class.Issue, { space: project._id })
    const messages = await client.findAll(chunter.class.ChatMessage, { space: project._id })
    for (const m of messages) await client.remove(m)
    // Children before their epics.
    for (const it of issues.sort((a: any, b: any) => (a.attachedTo === tracker.ids.NoParent ? 1 : 0) - (b.attachedTo === tracker.ids.NoParent ? 1 : 0))) {
      await client.remove(it)
    }
    for (const m of await client.findAll(tracker.class.Milestone, { space: project._id })) await client.remove(m)
    await client.remove(project)
    console.log(`removed project ${project.identifier}: ${issues.length} issues, ${messages.length} comments`)
  }
  const socialIds = (await client.findAll(contact.class.SocialIdentity, {})).filter((s: any) =>
    String(s.value).endsWith(`@${DEMO_DOMAIN}`)
  )
  const people = new Set<string>(socialIds.map((s: any) => s.attachedTo))
  for (const s of socialIds) await client.remove(s)
  for (const p of await client.findAll(contact.class.Person, { _id: { $in: [...people] } })) await client.remove(p)
  console.log(`removed ${people.size} demo people`)
}

/** Demo teammates are created (or found) as Employees with an email social id; members are looked up. */
async function resolvePeople (
  client: any,
  scenario: Scenario,
  members: Map<string, { person: string, socialId: string }>
): Promise<Map<string, { person: string, socialId: string }>> {
  const out = new Map(members)
  for (const p of scenario.people) {
    if (p.real === true) continue
    const email = `${p.first}.${p.last}@${DEMO_DOMAIN}`.toLowerCase()
    const existing = await client.findOne(contact.class.SocialIdentity, { key: `email:${email}` })
    if (existing !== undefined) {
      out.set(p.key, { person: existing.attachedTo, socialId: existing._id })
      continue
    }
    const person = generateId()
    const socialId = generateId()
    const t = scenario.projectCreated - 60 * 60 * 1000
    await client.createDoc(
      contact.class.Person,
      contact.space.Contacts,
      { name: combineName(p.first, p.last), city: '', avatarType: AvatarType.COLOR },
      person,
      t
    )
    await client.createMixin(person, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
      active: true,
      position: { pm: 'Product manager', dev: 'Software engineer', qa: 'QA engineer', design: 'Product designer' }[p.role]
    })
    await client.addCollection(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      person,
      contact.class.Person,
      'socialIds',
      { type: 'email', value: email, key: `email:${email}`, verifiedOn: t, isDeleted: false },
      socialId,
      t
    )
    out.set(p.key, { person, socialId })
  }
  return out
}

async function findMembers (client: any, emails: string[]): Promise<Array<{ key: string, first: string, last: string, person: string, socialId: string }>> {
  const out = []
  for (const [i, email] of emails.entries()) {
    const sid = await client.findOne(contact.class.SocialIdentity, { key: `email:${email.toLowerCase()}` })
    if (sid === undefined) throw new Error(`no member with email ${email}`)
    const person = await client.findOne(contact.class.Person, { _id: sid.attachedTo })
    const [last, first] = String(person?.name ?? 'Member,').split(',')
    out.push({ key: `member${i}`, first: first ?? '', last: last ?? '', person: sid.attachedTo, socialId: sid._id })
  }
  return out
}

function sprintUpdate (patch: Extract<SeedEvent, { op: 'sprint.update' }>['patch']): Record<string, unknown> {
  // Same shape as the sprint screens write (sprints/data.ts#patchToUpdate).
  const status =
    patch.state === 'active' ? MilestoneStatus.InProgress : patch.state === 'closed' ? MilestoneStatus.Completed : MilestoneStatus.Planned
  const u: Record<string, unknown> = { status, [SPRINT.state]: patch.state }
  if (patch.label !== undefined) u.label = patch.label
  if (patch.startDate !== undefined) u.startDate = patch.startDate
  if (patch.targetDate !== undefined) u.targetDate = patch.targetDate
  if ('goal' in patch) u[SPRINT.goal] = patch.goal ?? ''
  if (patch.committedPoints !== undefined) u[SPRINT.committedPoints] = patch.committedPoints
  if (patch.committedCount !== undefined) u[SPRINT.committedCount] = patch.committedCount
  if (patch.completedPoints !== undefined) u[SPRINT.completedPoints] = patch.completedPoints
  if (patch.completedCount !== undefined) u[SPRINT.completedCount] = patch.completedCount
  if (patch.rolledOver !== undefined) u[SPRINT.rolledOver] = patch.rolledOver
  if (patch.completedAt !== undefined) u[SPRINT.completedAt] = patch.completedAt
  return u
}

async function main (): Promise<void> {
  const args = readArgs()
  if (args.workspace === '') throw new Error('--workspace is required')
  if (args.dryRun && args.wipe) throw new Error('--dry-run cannot preview --wipe; run --wipe alone')

  if (args.dryRun) {
    const s = buildScenario({ now: Date.now(), seed: args.seed, members: args.members.map((_, i) => ({ key: `member${i}`, first: 'Member', last: String(i) })) })
    const counts: Record<string, number> = {}
    for (const ev of s.events) counts[ev.op] = (counts[ev.op] ?? 0) + 1
    console.log(`would write ${s.issues.length} issues, ${s.sprints.length} sprints, ${s.people.length} people`, counts)
    return
  }

  const { client, close } = await connect(args)
  try {
    if (args.wipe) {
      await wipe(client)
      return
    }

    const scrum = await ensureScrum(client)
    const existing = (await client.findAll(tracker.class.Project, {})).filter((p: any) => p.description === MARKER)
    if (existing.length > 0) throw new Error(`already seeded (project ${existing[0].identifier}); run with --wipe first`)

    let identifier = IDENTIFIER
    const taken = new Set((await client.findAll(tracker.class.Project, {})).map((p: any) => p.identifier))
    for (let i = 1; taken.has(identifier); i++) identifier = `${IDENTIFIER}${i}`

    const members = await findMembers(client, args.members)
    const scenario = buildScenario({ now: Date.now(), seed: args.seed, members, sprintPrefix: identifier })
    const people = await resolvePeople(client, scenario, new Map(members.map((m) => [m.key, { person: m.person, socialId: m.socialId }])))
    const by = (key: string): string => people.get(key)?.socialId ?? core.account.System
    const personOf = (key: string | null): string | null => (key === null ? null : people.get(key)?.person ?? null)

    const statusIds = (scrum.statuses as Array<{ _id: string }>).map((s) => s._id)
    const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: statusIds } })
    const statusId = new Map<string, string>(statuses.map((s: any) => [s.name, s._id]))
    for (const name of ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled']) {
      if (!statusId.has(name)) throw new Error(`Scrum type has no "${name}" status`)
    }

    const accounts = (await client.findAll(contact.mixin.Employee, { active: true }))
      .map((e: any) => e.personUuid)
      .filter((u: unknown) => typeof u === 'string')
    const projectId = generateId()
    const pm = by('linh')
    await client.createDoc(
      tracker.class.Project,
      core.space.Space,
      {
        name: scenario.projectName,
        description: MARKER,
        private: false,
        members: accounts,
        owners: accounts.slice(0, 1),
        archived: false,
        autoJoin: true,
        identifier,
        sequence: scenario.issues.length,
        defaultIssueStatus: statusId.get('Backlog'),
        defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
        type: SCRUM_TYPE,
        [PROJECT.lengthDays]: 14,
        [PROJECT.autoCreate]: true,
        [PROJECT.scale]: 'fibonacci'
      },
      projectId,
      scenario.projectCreated,
      pm
    )
    await client.createMixin(projectId, tracker.class.Project, core.space.Space, scrum.targetClass, {}, scenario.projectCreated, pm)

    // Backlog order = issue number order.
    const rank = new Map<string, string>()
    let prev: string | undefined
    for (const it of scenario.issues) {
      prev = makeRank(prev, undefined)
      rank.set(it.key, prev as string)
    }
    const issueId = new Map(scenario.issues.map((it) => [it.key, generateId()]))
    const issueByKey = new Map(scenario.issues.map((it) => [it.key, it]))
    const sprintId = new Map(scenario.sprints.map((s) => [s.key, generateId()]))
    const sprintByKey = new Map(scenario.sprints.map((s) => [s.key, s]))
    const toSprint = (key: string | null | undefined): string | null => (key == null ? null : sprintId.get(key) ?? null)
    const fields = (f: Partial<IssueFields>): Record<string, unknown> => {
      const u: Record<string, unknown> = {}
      if (f.status !== undefined) u.status = statusId.get(f.status)
      if ('points' in f) u[ISSUE_POINTS] = f.points
      if ('assignee' in f) u.assignee = personOf(f.assignee ?? null)
      if ('sprint' in f) u.milestone = toSprint(f.sprint)
      return u
    }

    let done = 0
    const total = scenario.events.length
    for (const ev of scenario.events) {
      const who = by(ev.by)
      switch (ev.op) {
        case 'sprint.create': {
          const s = sprintByKey.get(ev.sprint)
          if (s === undefined) break
          await client.createDoc(
            tracker.class.Milestone,
            projectId,
            {
              label: s.label,
              description: '',
              status: MilestoneStatus.Planned,
              comments: 0,
              attachments: 0,
              startDate: s.startDate,
              targetDate: s.targetDate,
              [SPRINT.state]: 'future',
              [SPRINT.goal]: s.goal
            },
            sprintId.get(s.key),
            ev.t,
            who
          )
          break
        }
        case 'sprint.update': {
          const patch = { ...ev.patch }
          if (patch.rolledOver !== undefined) patch.rolledOver = patch.rolledOver.map((k) => issueId.get(k) as string)
          await client.updateDoc(tracker.class.Milestone, projectId, sprintId.get(ev.sprint), sprintUpdate(patch), false, ev.t, who)
          break
        }
        case 'issue.create': {
          const it = issueByKey.get(ev.issue)
          if (it === undefined) break
          const epicIssue = it.epic !== null ? issueByKey.get(it.epic) : undefined
          const parent = epicIssue !== undefined ? issueId.get(epicIssue.key) : tracker.ids.NoParent
          await client.addCollection(
            tracker.class.Issue,
            projectId,
            parent,
            tracker.class.Issue,
            'subIssues',
            {
              title: it.title,
              description: null,
              assignee: personOf(ev.fields.assignee),
              component: null,
              number: it.number,
              status: statusId.get(ev.fields.status),
              priority: it.priority,
              rank: rank.get(it.key),
              comments: 0,
              subIssues: 0,
              startDate: it.startDate,
              dueDate: it.dueDate,
              parents:
                epicIssue !== undefined
                  ? [{ parentId: issueId.get(epicIssue.key), identifier: `${identifier}-${epicIssue.number}`, parentTitle: epicIssue.title, space: projectId }]
                  : [],
              remainingTime: 0,
              estimation: 0,
              reportedTime: 0,
              reports: 0,
              childInfo: [],
              identifier: `${identifier}-${it.number}`,
              kind: TASK_TYPE[it.kind],
              milestone: toSprint(ev.fields.sprint),
              [ISSUE_POINTS]: ev.fields.points
            },
            issueId.get(it.key),
            ev.t,
            who
          )
          break
        }
        case 'issue.update':
          await client.updateDoc(tracker.class.Issue, projectId, issueId.get(ev.issue), fields(ev.set), false, ev.t, who)
          break
        case 'comment':
          await client.addCollection(
            chunter.class.ChatMessage,
            projectId,
            issueId.get(ev.issue),
            tracker.class.Issue,
            'comments',
            { message: markup(ev.text) },
            generateId(),
            ev.t,
            who
          )
          break
      }
      if (++done % 50 === 0 || done === total) process.stdout.write(`  ${done}/${total}\r`)
    }
    console.log(`\nseeded project ${identifier}: ${scenario.issues.length} issues, ${scenario.sprints.length} sprints, ${total} events`)
  } finally {
    await close()
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
)
