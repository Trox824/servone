//
// Writes the docs/SERVONE-PRODUCT-PLAN.md schedule into a workspace as a Scrum project: sprints, module
// epics, one task per plan day, plan text as each task's first comment.
//
//   SERVER_SECRET="$(tr -d '\n' < dev/railway/secret.txt)" dev/railway/node_modules/.bin/tsx \
//     dev/servone-tracker-import/apply.ts --workspace servone [--member you@example.com] [--replace]
//
// --member   the person who owns the project and gets every task (defaults to nobody)
// --replace  removes the project an earlier run made (found by its description) first
//
// Sprints stay planned and issues start in Backlog; starting a sprint moves its issues (and epics) to Todo.
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  ISSUE_POINTS,
  PROJECT,
  SCRUM_TYPE_ID,
  SPRINT,
  TASK_TYPE_IDS
} from '../../packages/servone-ui/src/plugins/tracker-resources/sprints/scrum-spec'
import {
  chunter,
  connect,
  contact,
  core,
  defaultAccountsUrl,
  ensureScrum,
  generateId,
  makeRank,
  MilestoneStatus,
  repoRoot,
  TimeReportDayType,
  tracker
} from '../servone-tracker-seed/workspace'
import { buildImportPlan, plainText, type PlanTask } from './plan'

/** Marks the project this script made, so --replace finds it and nothing else. */
const MARKER = 'Generated from docs/SERVONE-PRODUCT-PLAN.md by dev/servone-tracker-import/apply.ts.'

function readArgs (): { workspace: string, member: string, replace: boolean, accounts: string } {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string', default: '' },
      member: { type: 'string', default: '' },
      replace: { type: 'boolean', default: false },
      accounts: { type: 'string', default: '' }
    }
  })
  if (values.workspace === '') throw new Error('--workspace is required')
  return { ...values, accounts: values.accounts === '' ? defaultAccountsUrl() : values.accounts }
}

/** Local midnight of an ISO day, as the sprint screens store dates. */
function day (iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function markup (text: string): string {
  const content = text
    .split('\n')
    .map(plainText)
    .filter((line) => line !== '')
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
  return JSON.stringify({ type: 'doc', content })
}

async function removePrevious (client: any): Promise<void> {
  for (const project of (await client.findAll(tracker.class.Project, {})).filter((p: any) => p.description === MARKER)) {
    const issues = await client.findAll(tracker.class.Issue, { space: project._id })
    for (const m of await client.findAll(chunter.class.ChatMessage, { space: project._id })) await client.remove(m)
    // Tasks before their epics.
    for (const it of issues.sort((a: any, b: any) => (a.attachedTo === tracker.ids.NoParent ? 1 : 0) - (b.attachedTo === tracker.ids.NoParent ? 1 : 0))) {
      await client.remove(it)
    }
    for (const m of await client.findAll(tracker.class.Milestone, { space: project._id })) await client.remove(m)
    await client.remove(project)
    console.log(`removed project ${project.identifier} (${issues.length} issues)`)
  }
}

async function main (): Promise<void> {
  const args = readArgs()
  const plan = buildImportPlan(readFileSync(join(repoRoot, 'docs', 'SERVONE-PRODUCT-PLAN.md'), 'utf8'))

  const { client, close } = await connect(args)
  try {
    if (args.replace) await removePrevious(client)
    else if ((await client.findAll(tracker.class.Project, {})).some((p: any) => p.description === MARKER)) {
      throw new Error('the plan project already exists; run with --replace to rebuild it')
    }

    const scrum = await ensureScrum(client)
    const statusIds = (scrum.statuses as Array<{ _id: string }>).map((s) => s._id)
    const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: statusIds } })
    const statusId = new Map<string, string>(statuses.map((s: any) => [s.name, s._id]))

    let owner: { person: string, socialId: string } | undefined
    if (args.member !== '') {
      const sid = await client.findOne(contact.class.SocialIdentity, { key: `email:${args.member.toLowerCase()}` })
      if (sid === undefined) throw new Error(`no member with email ${args.member}`)
      owner = { person: sid.attachedTo, socialId: sid._id }
    }
    const by = owner?.socialId ?? core.account.System

    let identifier = plan.project.identifier
    const taken = new Set((await client.findAll(tracker.class.Project, {})).map((p: any) => p.identifier))
    for (let i = 1; taken.has(identifier); i++) identifier = `${plan.project.identifier}${i}`

    const accounts = (await client.findAll(contact.mixin.Employee, { active: true }))
      .map((e: any) => e.personUuid)
      .filter((u: unknown) => typeof u === 'string')
    const ownerAccount =
      owner !== undefined ? (await client.findOne(contact.mixin.Employee, { _id: owner.person }))?.personUuid : undefined

    const tasks = plan.epics.flatMap((e) => e.tasks)
    const topNumber = Math.max(...plan.epics.map((e) => e.number), ...tasks.map((t) => t.number))
    const projectId = generateId()
    await client.createDoc(
      tracker.class.Project,
      core.space.Space,
      {
        name: plan.project.title,
        description: MARKER,
        private: false,
        members: accounts,
        owners: ownerAccount !== undefined ? [ownerAccount] : accounts.slice(0, 1),
        archived: false,
        autoJoin: true,
        identifier,
        sequence: topNumber,
        defaultIssueStatus: statusId.get('Backlog'),
        defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
        type: SCRUM_TYPE_ID,
        [PROJECT.lengthDays]: 7,
        [PROJECT.autoCreate]: false,
        [PROJECT.scale]: 'fibonacci',
        [PROJECT.doneNeedsPoints]: true
      },
      projectId,
      Date.now(),
      by
    )
    await client.createMixin(projectId, tracker.class.Project, core.space.Space, scrum.targetClass, {}, Date.now(), by)

    const sprintId = new Map<string, string>()
    for (const s of plan.sprints) {
      const id = generateId()
      sprintId.set(s.label, id)
      // "Week 1: foundations and Lịch (days 1–7, …)" → "Week 1: foundations and Lịch"
      const goal = s.description.replace(/\s*\(days .*$/s, '')
      await client.createDoc(
        tracker.class.Milestone,
        projectId,
        {
          label: s.label,
          description: '',
          status: MilestoneStatus.Planned,
          comments: 0,
          attachments: 0,
          startDate: day(s.startDate),
          targetDate: day(s.targetDate),
          [SPRINT.state]: 'future',
          [SPRINT.goal]: goal
        },
        id,
        Date.now(),
        by
      )
    }

    // Backlog order: day order, the epics after their work.
    const ordered = [...tasks].sort((a, b) => a.day - b.day || a.number - b.number)
    const rank = new Map<number, string>()
    let prev: string | undefined
    for (const n of [...ordered.map((t) => t.number), ...plan.epics.map((e) => e.number)]) {
      prev = makeRank(prev, undefined)
      rank.set(n, prev as string)
    }

    const base = {
      description: null,
      assignee: owner?.person ?? null,
      component: null,
      priority: 0,
      comments: 0,
      subIssues: 0,
      reportedTime: 0,
      reports: 0,
      childInfo: []
    }
    const epicId = new Map<number, string>()
    for (const e of plan.epics) {
      const id = generateId()
      epicId.set(e.number, id)
      await client.addCollection(tracker.class.Issue, projectId, tracker.ids.NoParent, tracker.class.Issue, 'subIssues', {
        ...base,
        title: e.title,
        number: e.number,
        status: statusId.get('Backlog'),
        rank: rank.get(e.number),
        startDate: e.startDate !== undefined ? day(e.startDate) : null,
        dueDate: e.dueDate !== undefined ? day(e.dueDate) : null,
        deadline: e.dueDate !== undefined ? day(e.dueDate) : null,
        parents: [],
        remainingTime: 0,
        estimation: 0,
        identifier: `${identifier}-${e.number}`,
        kind: TASK_TYPE_IDS.epic,
        milestone: null
      }, id, Date.now(), by)
      if (e.description.trim() !== '') {
        await client.addCollection(chunter.class.ChatMessage, projectId, id, tracker.class.Issue, 'comments', { message: markup(e.description) }, generateId(), Date.now(), by)
      }
    }

    const epicOf = new Map<number, (typeof plan.epics)[number]>()
    for (const e of plan.epics) for (const t of e.tasks) epicOf.set(t.number, e)
    let done = 0
    for (const t of ordered as PlanTask[]) {
      const epic = epicOf.get(t.number)
      const parent = epic !== undefined ? epicId.get(epic.number) : undefined
      const sprint = t.milestone !== undefined ? sprintId.get(t.milestone) ?? null : null
      // Due on its plan day; the hard line is the end of its sprint (the day itself outside one).
      const sprintEnd = plan.sprints.find((s) => s.label === t.milestone)?.targetDate
      const id = generateId()
      await client.addCollection(tracker.class.Issue, projectId, parent ?? tracker.ids.NoParent, tracker.class.Issue, 'subIssues', {
        ...base,
        title: t.title,
        number: t.number,
        status: statusId.get('Backlog'),
        rank: rank.get(t.number),
        startDate: day(t.date),
        dueDate: day(t.date),
        deadline: day(sprintEnd ?? t.date),
        parents:
          epic !== undefined && parent !== undefined
            ? [{ parentId: parent, identifier: `${identifier}-${epic.number}`, parentTitle: epic.title, space: projectId }]
            : [],
        remainingTime: t.estimationHours,
        estimation: t.estimationHours,
        identifier: `${identifier}-${t.number}`,
        kind: TASK_TYPE_IDS.task,
        milestone: sprint,
        [ISSUE_POINTS]: t.storyPoints
      }, id, Date.now(), by)
      await client.addCollection(chunter.class.ChatMessage, projectId, id, tracker.class.Issue, 'comments', { message: markup(t.description) }, generateId(), Date.now(), by)
      process.stdout.write(`  ${++done}/${ordered.length}\r`)
    }

    console.log(`\ncreated project ${identifier}: ${plan.sprints.length} sprints, ${plan.epics.length} epics, ${tasks.length} tasks`)
    for (const s of plan.sprints) console.log(`  ${s.label}: ${s.startDate} → ${s.targetDate}`)
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
