import chunter, { type Channel, type ChatMessage } from '@hcengineering/chunter'
import type { Person } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Class,
  type Data,
  type Doc,
  type DocumentClassQuery,
  makeCollabId,
  type Ref,
  SortingOrder,
  type TxApplyResult,
  type TxCUD
} from '@hcengineering/core'
import hr from '@hcengineering/hr'
import { makeRank } from '@hcengineering/rank'
import task, { type TaskType } from '@hcengineering/task'
import { jsonToMarkup } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import tracker, { type Issue, IssuePriority, type IssueStatus, type Project } from '@hcengineering/tracker'
import type { CollabText } from '../mcp/types'
import { createWorkflow } from '../workflows/create'
import { type SetupClient, systemFactory } from '../workflows/setup'
import { type Language, TEMPLATES } from '../workflows/templates'
import { STARTER, STARTER_KEYS, type StarterContent, type StarterIssue, type StarterKey } from './content'
import { STARTER_SETS, teamFocusClass, type TeamFocus } from './focus'
import { isDoneStatus, starterIssueId, starterKeyOf } from './ids'

// chunter.space lives in the model package, which services do not load; ids from models/chunter/src/plugin.ts.
export const GENERAL_CHANNEL = 'chunter:space:General' as Ref<Channel>
export const RANDOM_CHANNEL = 'chunter:space:Random' as Ref<Channel>
// Posted last, so its presence means every earlier step finished.
export const WELCOME_ID = 'servone:starter:welcome' as Ref<ChatMessage>
const ONBOARDING_TEMPLATE = 'nhan-viec'
const STARTER_SCOPE = 'servone-starter'
// Stock descriptions from models/chunter/src/migration.ts; any other text was written by a person.
const STOCK_CHANNEL_DESCRIPTIONS = new Set(['General Channel', 'Random Talks'])

interface TemplatedProject extends Project {
  servoneTemplate?: string
}
const templatedProjectClass: Ref<Class<TemplatedProject>> = tracker.class.Project

export interface StarterCreator {
  account: AccountUuid
  person: Ref<Person>
}


async function apply (client: SetupClient, match: Array<DocumentClassQuery<Doc>>, notMatch: Array<DocumentClassQuery<Doc>>, txes: Array<TxCUD<Doc>>): Promise<void> {
  const applied: Partial<TxApplyResult> = await client.tx(systemFactory.createTxApplyIf(core.space.Tx, STARTER_SCOPE, match, notMatch, txes, undefined))
  // A throw makes the queue retry the message, which re-reads the workspace.
  if (applied.success === false) throw new Error('Workspace changed while seeding starter content')
}

interface StarterTarget {
  project: Project
  kind: TaskType
  todo: Ref<IssueStatus>
}

async function starterTarget (client: SetupClient): Promise<StarterTarget | undefined> {
  const project = await client.findOne(tracker.class.Project, { _id: tracker.project.DefaultProject })
  if (project === undefined) return undefined
  const [kind] = await client.findAll(task.class.TaskType, { parent: project.type })
  if (kind === undefined) throw new Error(`Project ${project.identifier} has no task types`)
  const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: kind.statuses } })
  const todo = kind.statuses
    .map((id) => statuses.find((status) => status._id === id))
    .find((status) => status?.category === task.statusCategory.ToDo)?._id ?? project.defaultIssueStatus
  if (todo === undefined) throw new Error(`Project ${project.identifier} has no status for new issues`)
  return { project, kind, todo }
}

async function createIssueTxes (
  client: SetupClient,
  collab: Pick<CollabText, 'writeMarkdown'>,
  target: StarterTarget,
  issues: Array<[StarterKey, StarterIssue]>,
  assignee: Ref<Person> | null
): Promise<Array<TxCUD<Doc>>> {
  const { project, kind, todo } = target
  const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
  let rank = last?.rank
  const txes: Array<TxCUD<Doc>> = []
  for (const [index, [key, issue]] of issues.entries()) {
    const id = starterIssueId(key)
    const number = project.sequence + index + 1
    rank = makeRank(rank, undefined)
    const fields: Data<Issue> = {
      attachedTo: tracker.ids.NoParent,
      attachedToClass: tracker.class.Issue,
      collection: 'subIssues',
      title: issue.title,
      description: await collab.writeMarkdown(makeCollabId(tracker.class.Issue, id, 'description'), issue.body),
      assignee,
      status: todo,
      priority: IssuePriority.NoPriority,
      component: null,
      number,
      identifier: `${project.identifier}-${number}`,
      kind: kind._id,
      rank,
      dueDate: null,
      startDate: null,
      comments: 0,
      subIssues: 0,
      parents: [],
      relations: [],
      estimation: 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      childInfo: []
    }
    txes.push(
      systemFactory.createTxCollectionCUD(tracker.class.Issue, tracker.ids.NoParent, project._id, 'subIssues', systemFactory.createTxCreateDoc(tracker.class.Issue, project._id, fields, id))
    )
  }
  return txes
}

const sequenceMatch = (project: Project): DocumentClassQuery<Doc> => ({ _class: tracker.class.Project, query: { _id: project._id, sequence: project.sequence } })

// Fills DefaultProject, the landing screen, instead of adding a second project beside an empty one.
async function seedProject (client: SetupClient, collab: Pick<CollabText, 'writeMarkdown'>, content: StarterContent, focus: TeamFocus, assignee: Ref<Person>): Promise<void> {
  const target = await starterTarget(client)
  if (target === undefined || (await client.findOne(tracker.class.Issue, { _id: starterIssueId('invite') })) !== undefined) return
  const issues = STARTER_SETS[focus].map((key): [StarterKey, StarterIssue] => [key, content.issues[key]])
  const txes = await createIssueTxes(client, collab, target, issues, assignee)
  txes.push(
    systemFactory.createTxUpdateDoc(tracker.class.Project, core.space.Space, target.project._id, {
      name: content.project.name,
      description: content.project.description,
      sequence: target.project.sequence + issues.length
    })
  )
  // The sequence match keeps issue numbers unique if someone creates an issue while this runs.
  await apply(client, [sequenceMatch(target.project)], [{ _class: tracker.class.Issue, query: { _id: starterIssueId('invite') } }], txes)
}

export async function reconcileStarter (client: SetupClient, collab: Pick<CollabText, 'writeMarkdown'>, language: Language, focus: TeamFocus): Promise<boolean> {
  const target = await starterTarget(client)
  const existing = await client.findAll(tracker.class.Issue, { _id: { $in: STARTER_KEYS.map(starterIssueId) } })
  if (target === undefined || existing.length === 0) return false
  const wanted = new Set<string>(STARTER_SETS[focus])
  const present = new Set(existing.map((issue) => starterKeyOf(issue._id)))
  const content = STARTER[language]
  const missing = STARTER_SETS[focus].filter((key) => !present.has(key)).map((key): [StarterKey, StarterIssue] => [key, content.issues[key]])
  const stale: Issue[] = []
  for (const issue of existing) {
    if (!wanted.has(starterKeyOf(issue._id)) && !(await isDoneStatus(client, issue.status))) stale.push(issue)
  }
  if (missing.length === 0 && stale.length === 0) return true

  const txes = await createIssueTxes(client, collab, target, missing, existing[0].assignee)
  for (const issue of stale) {
    txes.push(systemFactory.createTxCollectionCUD(tracker.class.Issue, issue.attachedTo, issue.space, issue.collection, systemFactory.createTxRemoveDoc(tracker.class.Issue, issue.space, issue._id)))
  }
  if (missing.length > 0) {
    txes.push(systemFactory.createTxUpdateDoc(tracker.class.Project, core.space.Space, target.project._id, { sequence: target.project.sequence + missing.length }))
  }
  await apply(client, [sequenceMatch(target.project)], [], txes)
  return true
}

async function seedOnboardingWorkflow (client: SetupClient, creator: AccountUuid, language: Language): Promise<void> {
  if ((await client.findOne(templatedProjectClass, { servoneTemplate: ONBOARDING_TEMPLATE })) !== undefined) return
  const outcome = await createWorkflow(client, creator, {
    name: TEMPLATES[ONBOARDING_TEMPLATE].name[language],
    department: hr.ids.Head,
    template: ONBOARDING_TEMPLATE,
    language
  })
  if ('error' in outcome) throw new Error(`Onboarding workflow not created: ${outcome.error}`)
}

async function postWelcome (client: SetupClient, content: StarterContent): Promise<void> {
  const descriptions = new Map([[GENERAL_CHANNEL, content.general], [RANDOM_CHANNEL, content.random]])
  const channels = await client.findAll(chunter.class.Channel, { _id: { $in: [...descriptions.keys()] } })
  if (!channels.some((channel) => channel._id === GENERAL_CHANNEL)) return
  const txes: Array<TxCUD<Doc>> = channels.flatMap((channel) => {
    const text = descriptions.get(channel._id)
    if (text === undefined || !STOCK_CHANNEL_DESCRIPTIONS.has(channel.description)) return []
    return [systemFactory.createTxUpdateDoc(chunter.class.Channel, channel.space, channel._id, { description: text, topic: text })]
  })
  const welcome: Data<ChatMessage> = {
    attachedTo: GENERAL_CHANNEL,
    attachedToClass: chunter.class.Channel,
    collection: 'messages',
    message: jsonToMarkup(markdownToMarkup(content.welcome)),
    attachments: 0,
    isPinned: true
  }
  txes.push(
    systemFactory.createTxCollectionCUD(chunter.class.Channel, GENERAL_CHANNEL, GENERAL_CHANNEL, 'messages', systemFactory.createTxCreateDoc(chunter.class.ChatMessage, GENERAL_CHANNEL, welcome, WELCOME_ID))
  )
  await apply(client, [], [{ _class: chunter.class.ChatMessage, query: { _id: WELCOME_ID } }], txes)
}

export async function markEmptyStart (client: SetupClient): Promise<boolean> {
  const setup = await client.findOne(teamFocusClass, { servoneTeamFocus: { $exists: true } })
  if (setup === undefined || setup.servoneEmptyStarted === true) return false
  await apply(client, [], [{ _class: teamFocusClass, query: { _id: setup._id, servoneEmptyStarted: true } }], [
    systemFactory.createTxUpdateDoc(teamFocusClass, setup.space, setup._id, { servoneEmptyStarted: true })
  ])
  return true
}

// Each step skips what an earlier, interrupted run already wrote.
export async function seedStarter (client: SetupClient, collab: Pick<CollabText, 'writeMarkdown'>, creator: StarterCreator, language: Language, focus: TeamFocus): Promise<boolean> {
  if ((await client.findOne(chunter.class.ChatMessage, { _id: WELCOME_ID })) !== undefined) return false
  const content = STARTER[language]
  await seedProject(client, collab, content, focus, creator.person)
  await seedOnboardingWorkflow(client, creator.account, language)
  await postWelcome(client, content)
  return true
}
