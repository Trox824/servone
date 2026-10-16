//
// Shared by the dev scripts that write tracker data into a workspace (./seed.ts and
// ../servone-tracker-import/apply.ts): the platform libraries, a system connection signed with
// the backend's SERVER_SECRET, and the Scrum type / sprint fields from sprints/scrum-spec.ts.
//
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SCRUM_ATTRIBUTES,
  SCRUM_STATUSES,
  SCRUM_TYPE_ID,
  TASK_TYPE_IDS,
  TASK_TYPE_LOOK,
  TASK_TYPE_ORDER,
  taskTypeIcon
} from '../../packages/servone-ui/src/plugins/tracker-resources/sprints/scrum-spec'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// The platform packages are built libs; borrow them from dev/tool like the other dev scripts.
export const need = createRequire(join(repoRoot, 'dev', 'tool', 'package.json'))
const coreLib = need('@hcengineering/core')
export const core = coreLib.default
export const { generateId, systemAccountUuid, TxOperations } = coreLib
export const { addLocation, getEmbeddedLabel, getResource, setMetadata } = need('@hcengineering/platform')
const serverToken = need('@hcengineering/server-token')
const clientLib = need('@hcengineering/client')
export const { getClient: getAccountClient } = need('@hcengineering/account-client')
export const WebSocket = need('ws')
const trackerLib = need('@hcengineering/tracker')
export const tracker = trackerLib.default
export const { MilestoneStatus, TimeReportDayType } = trackerLib
const taskLib = need('@hcengineering/task')
export const task = taskLib.default
export const { createProjectType, makeRank } = taskLib
const contactLib = need('@hcengineering/contact')
export const contact = contactLib.default
export const { AvatarType, combineName } = contactLib
export const chunter = need('@hcengineering/chunter').default

const SCRUM_TYPE = SCRUM_TYPE_ID
const TASK_TYPE = TASK_TYPE_IDS

/** `--accounts` default: the Railway accounts proxy from dev/.servone-railway.json. */
export function defaultAccountsUrl (): string {
  return JSON.parse(readFileSync(join(repoRoot, 'dev', '.servone-railway.json'), 'utf8')).ACCOUNTS_PROXY
}

export async function connect (args: { workspace: string, accounts: string }): Promise<{ client: any, close: () => Promise<void>, token: string, workspaceUuid: string }> {
  const secret = process.env.SERVER_SECRET
  if (secret === undefined || secret === '') throw new Error('SERVER_SECRET is not set')
  setMetadata(serverToken.default.metadata.Secret, secret)

  const systemToken = serverToken.generateToken(systemAccountUuid, undefined, { service: 'tool' })
  const workspaces = await getAccountClient(args.accounts, systemToken).listWorkspaces(null)
  const ws = workspaces.find((w: any) => w.url === args.workspace)
  if (ws === undefined) throw new Error(`workspace "${args.workspace}" not found`)
  const token = serverToken.generateToken(systemAccountUuid, ws.uuid, { service: 'tool' })
  const { endpoint } = await getAccountClient(args.accounts, token).selectWorkspace('', 'external')

  // What @hcengineering/server-client's createClient does (that package isn't built in dev/tool).
  const client = clientLib.default
  // Node 25 ships global Web Storage; the client then takes its browser paths (window, indexedDB).
  for (const name of ['sessionStorage', 'localStorage']) {
    Object.defineProperty(globalThis, name, { value: undefined, configurable: true })
  }
  setMetadata(client.metadata.UseBinaryProtocol, true)
  setMetadata(client.metadata.UseProtocolCompression, true)
  setMetadata(client.metadata.ClientSocketFactory, (url: string) => new WebSocket(url))
  addLocation(clientLib.clientId, async () => await need('@hcengineering/client-resources'))
  const conn = await (await getResource(client.function.GetClient))(token, endpoint)
  return { client: new TxOperations(conn, core.account.System), close: async () => await conn.close(), token, workspaceUuid: ws.uuid }
}

/**
 * The first half of sprints/setup.ts#setUpScrum (attributes + project type), from the same spec.
 * Only creates what is missing; a workspace set up in the app is left as it is.
 */
export async function ensureScrum (client: any): Promise<any> {
  const of = { Issue: tracker.class.Issue, Milestone: tracker.class.Milestone, Project: tracker.class.Project }
  const types = {
    number: { _class: core.class.TypeNumber, label: core.string.Number, icon: core.icon.TypeNumber },
    string: { _class: core.class.TypeString, label: core.string.String, icon: core.icon.TypeString },
    boolean: { _class: core.class.TypeBoolean, label: core.string.Boolean, icon: core.icon.TypeBoolean },
    timestamp: { _class: core.class.TypeTimestamp, label: core.string.Timestamp, icon: core.icon.TypeDate },
    issueRefs: {
      _class: core.class.ArrOf,
      label: core.string.Array,
      of: { _class: core.class.RefTo, label: core.string.Ref, to: tracker.class.Issue }
    }
  }
  const attrs = await client.findAll(core.class.Attribute, { attributeOf: { $in: Object.values(of) } })
  for (const a of SCRUM_ATTRIBUTES) {
    if (attrs.some((e: any) => e.attributeOf === of[a.of] && e.name === a.name)) continue
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: of[a.of],
      name: a.name,
      label: getEmbeddedLabel(a.label),
      type: types[a.kind],
      isCustom: true,
      hidden: a.hidden
    })
  }
  const existing = await client.findOne(task.class.ProjectType, { _id: SCRUM_TYPE })
  if (existing !== undefined) return existing
  const statuses = SCRUM_STATUSES.map((st) => ({
    ofAttribute: tracker.attribute.IssueStatus,
    name: st.name,
    color: st.color,
    category: task.statusCategory[st.category]
  }))
  await createProjectType(
    client,
    {
      name: 'Scrum',
      descriptor: tracker.descriptors.ProjectType,
      description: 'Epics, stories, tasks and bugs, planned in sprints',
      tasks: [],
      roles: 0,
      classic: true
    },
    TASK_TYPE_ORDER.map((key) => ({
      _id: TASK_TYPE[key],
      name: TASK_TYPE_LOOK[key].name,
      descriptor: tracker.descriptors.Issue,
      kind: 'both',
      ofClass: tracker.class.Issue,
      statusClass: tracker.class.IssueStatus,
      statusCategories: SCRUM_STATUSES.map((st) => task.statusCategory[st.category]).filter((c, i, all) => all.indexOf(c) === i),
      allowedAsChildOf: key === 'epic' ? [] : Object.values(TASK_TYPE),
      icon: taskTypeIcon(key),
      color: TASK_TYPE_LOOK[key].color,
      factory: statuses
    })),
    SCRUM_TYPE
  )
  // createProjectType gives task types their base class's icon; set ours (as setup.ts does).
  for (const tt of await client.findAll(task.class.TaskType, { parent: SCRUM_TYPE })) {
    const key = TASK_TYPE_ORDER.find((k) => TASK_TYPE[k] === tt._id)
    if (key !== undefined) await client.update(tt, { icon: taskTypeIcon(key), color: TASK_TYPE_LOOK[key].color })
  }
  console.log('created the Scrum project type and sprint fields')
  return await client.findOne(task.class.ProjectType, { _id: SCRUM_TYPE })
}

