// Starts an item in workflow B when an item of workflow A is moved into A's handoff stage.
// Reads the transactor's `tx` topic because the stock transactor cannot load a Servone trigger.
import { createRestTxOperations } from '@hcengineering/api-client'
import type { Person } from '@hcengineering/contact'
import core, {
  type Class,
  type MeasureContext,
  type Ref,
  systemAccountUuid,
  type Tx,
  type TxOperations,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import task from '@hcengineering/task'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'
import { triageProjectClass } from '@servone/config'
import { parseHandoff, type HandoffAssignee, type StoredHandoff } from '@servone/notify-rules'

import config from '../config'
import { insertIssue } from '../tracker/issues'

interface HandoffProject extends Project, StoredHandoff {}
// Class<T> never uses T, so the stock ref types the custom field without a cast.
const handoffProjectClass: Ref<Class<HandoffProject>> = tracker.class.Project

const clients = new Map<WorkspaceUuid, Promise<TxOperations>>()

async function connect (workspace: WorkspaceUuid): Promise<TxOperations> {
  const token = generateToken(systemAccountUuid, workspace, { service: config.handoff.ServiceId })
  const endpoint = await getTransactorEndpoint(token)
  return await createRestTxOperations(endpoint, workspace, token, true)
}

async function openWorkspace (workspace: WorkspaceUuid): Promise<TxOperations> {
  const cached = clients.get(workspace)
  if (cached !== undefined) return await cached
  const opening = connect(workspace)
  clients.set(workspace, opening)
  try {
    return await opening
  } catch (error) {
    clients.delete(workspace)
    throw error
  }
}

// Only a move counts: an item created straight into the stage, like B's own new item, never chains.
function readStageMove (tx: Tx): TxUpdateDoc<Issue> | undefined {
  if (tx._class !== core.class.TxUpdateDoc) return undefined
  const update = tx as TxUpdateDoc<Issue>
  return update.objectClass === tracker.class.Issue && update.operations.status !== undefined ? update : undefined
}

// Ref<T> is a branded string; the rule stores plain ids.
function assigneeOf (rule: HandoffAssignee, source: Issue): Ref<Person> | null {
  if (rule.kind === 'same') return source.assignee
  if (rule.kind === 'person') return rule.person as Ref<Person>
  return null
}

// One B item per A item, ever: the id is derived, so a queue retry or a second trip through the stage finds it.
const handoffIdOf = (source: Ref<Issue>): Ref<Issue> => `${source}-handoff` as Ref<Issue>

async function applyMove (ctx: MeasureContext, client: TxOperations, move: TxUpdateDoc<Issue>): Promise<void> {
  const source = await client.findOne(tracker.class.Issue, { _id: move.objectId })
  if (source === undefined) return
  const project = await client.findOne(handoffProjectClass, { _id: source.space })
  const rule = project === undefined ? undefined : parseHandoff(project)
  if (rule === undefined || rule.stage !== move.operations.status) return
  const target = await client.findOne(triageProjectClass, { _id: rule.target as Ref<Project>, archived: false })
  if (target === undefined) return
  const id = handoffIdOf(source._id)
  if ((await client.findOne(tracker.class.Issue, { _id: id })) === undefined) {
    const [kind] = await client.findAll(task.class.TaskType, { parent: target.type })
    // A retry can't add a task type, so throwing would stall the consumer on this message forever.
    if (kind === undefined) {
      ctx.warn('handoff skipped: target has no task types', { target: target.identifier })
      return
    }
    const created = await insertIssue(
      client,
      target,
      kind,
      {
        title: source.title,
        description: null,
        assignee: assigneeOf(rule.assignee, source),
        priority: source.priority,
        dueDate: null,
        relations: [{ _id: source._id, _class: tracker.class.Issue }]
      },
      id
    )
    ctx.info('handoff created', { source: source.identifier, created: created.identifier })
  }
  if (source.relations?.some((relation) => relation._id === id) !== true) {
    await client.update(source, { $push: { relations: { _id: id, _class: tracker.class.Issue } } })
  }
}

export function startHandoff (ctx: MeasureContext): () => Promise<void> {
  const queue = getPlatformQueue(config.handoff.ServiceId, config.handoff.QueueRegion)

  // A throw makes the queue retry the same message with backoff, so a transactor restart loses nothing.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (ctx, message) => {
    const move = readStageMove(message.value)
    if (move === undefined) return
    await applyMove(ctx, await openWorkspace(message.workspace), move)
  })
  return async () => {
    await consumer.close()
  }
}
