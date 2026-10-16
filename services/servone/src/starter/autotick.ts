import core, { type Class, type Doc, type Ref, type Tx, type TxCreateDoc, type TxMixin, type TxUpdateDoc } from '@hcengineering/core'
import type { Event } from '@hcengineering/calendar'
import hr, { type Department } from '@hcengineering/hr'
import task from '@hcengineering/task'
import tracker, { type Issue, type Milestone, MilestoneStatus, type Project } from '@hcengineering/tracker'
import { type SetupClient, systemFactory } from '../workflows/setup'
import type { StarterKey } from './content'
import { isDoneStatus, isStarterId, starterIssueId } from './ids'

export const MEETING_MIXIN = 'love:mixin:Meeting' as Ref<Class<Doc>>

function hasManager (managers: Department['managers'] | undefined): boolean {
  return managers !== undefined && managers.length > 0
}

export function tickedKey (tx: Tx): StarterKey | undefined {
  if (tx._class === core.class.TxCreateDoc) {
    const create = tx as TxCreateDoc<Doc>
    if (create.objectClass === tracker.class.Project) {
      return create.objectId !== tracker.project.DefaultProject && create.modifiedBy !== core.account.System ? 'project' : undefined
    }
    if (create.objectClass === hr.class.Request) return 'leave'
    if (create.objectClass === tracker.class.Milestone) {
      return (create as TxCreateDoc<Milestone>).attributes.status === MilestoneStatus.InProgress ? 'sprint' : undefined
    }
    if (create.objectClass === hr.class.Department) return hasManager((create as TxCreateDoc<Department>).attributes.managers) ? 'managers' : undefined
    return undefined
  }
  if (tx._class === core.class.TxUpdateDoc) {
    const update = tx as TxUpdateDoc<Doc>
    if (update.objectClass === tracker.class.Milestone) {
      return (update as TxUpdateDoc<Milestone>).operations.status === MilestoneStatus.InProgress ? 'sprint' : undefined
    }
    if (update.objectClass === hr.class.Department) {
      const operations = (update as TxUpdateDoc<Department>).operations
      return hasManager(operations.managers) || operations.$push?.managers !== undefined ? 'managers' : undefined
    }
    return undefined
  }
  if (tx._class === core.class.TxMixin) {
    return (tx as TxMixin<Event, Event>).mixin === MEETING_MIXIN ? 'meeting' : undefined
  }
  return undefined
}

export function movedStarterIssue (tx: Tx): Ref<Issue> | undefined {
  if (tx._class !== core.class.TxUpdateDoc) return undefined
  const update = tx as TxUpdateDoc<Issue>
  const isStarter = update.objectClass === tracker.class.Issue && isStarterId(update.objectId)
  return isStarter && update.operations.status !== undefined ? update.objectId : undefined
}

export async function markStarterDone (client: SetupClient, key: StarterKey): Promise<void> {
  const issue = await client.findOne(tracker.class.Issue, { _id: starterIssueId(key) })
  if (issue === undefined || (await isDoneStatus(client, issue.status))) return
  const kind = await client.findOne(task.class.TaskType, { _id: issue.kind })
  const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: kind?.statuses ?? [] } })
  const done = kind?.statuses.find((id) => statuses.find((status) => status._id === id)?.category === task.statusCategory.Won)
  if (done === undefined) throw new Error(`Task type ${issue.kind} has no Done status`)
  await client.tx(
    systemFactory.createTxCollectionCUD(tracker.class.Issue, issue.attachedTo, issue.space, issue.collection, systemFactory.createTxUpdateDoc(tracker.class.Issue, issue.space, issue._id, { status: done }))
  )
}

export async function isStarterIssueDone (client: SetupClient, id: Ref<Issue>): Promise<boolean> {
  const issue = await client.findOne(tracker.class.Issue, { _id: id })
  return issue !== undefined && await isDoneStatus(client, issue.status)
}

export function sampleArchived (tx: Tx): boolean {
  if (tx._class !== core.class.TxUpdateDoc) return false
  const update = tx as TxUpdateDoc<Project>
  return update.objectClass === tracker.class.Project && update.objectId === tracker.project.DefaultProject && update.operations.archived === true
}
