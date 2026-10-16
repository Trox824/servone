import chunter, { type ChatMessage } from '@hcengineering/chunter'
import core, {
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'

export const TRACKER_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.status_changed',
  'issue.assigned',
  'issue.deleted',
  'comment.added'
] as const
export type TrackerEvent = (typeof TRACKER_EVENTS)[number]

export const TRACKED_FIELDS = ['title', 'status', 'priority', 'assignee', 'dueDate'] as const
export type TrackedField = (typeof TRACKED_FIELDS)[number]

// Stock issue comments; thread replies live in another collection and are out of scope.
const COMMENTS_COLLECTION = 'comments'

interface ChangeTarget {
  project: Ref<Project>
  issue: Ref<Issue>
}

export type IssueChange = ChangeTarget &
(
  | { kind: 'created', tx: TxCreateDoc<Issue> }
  | { kind: 'updated', tx: TxUpdateDoc<Issue>, fields: TrackedField[] }
  | { kind: 'deleted', tx: TxRemoveDoc<Issue> }
  | { kind: 'comment', tx: TxCreateDoc<ChatMessage> }
)

export type ChangeKind = IssueChange['kind']

function isTrackedField (key: string): key is TrackedField {
  return (TRACKED_FIELDS as readonly string[]).includes(key)
}

// An issue lives in its project; a comment is created in the space of the issue it is attached to.
const projectOf = (tx: TxCUD<Issue | ChatMessage>): Ref<Project> => tx.objectSpace as Ref<Project>

export function readIssueChange (tx: Tx): IssueChange | undefined {
  if (tx._class === core.class.TxCreateDoc) {
    const create = tx as TxCreateDoc<Issue | ChatMessage>
    if (create.objectClass === tracker.class.Issue) {
      const issueCreate = create as TxCreateDoc<Issue>
      return { kind: 'created', tx: issueCreate, project: projectOf(create), issue: issueCreate.objectId }
    }
    const isComment =
      create.objectClass === chunter.class.ChatMessage &&
      create.attachedToClass === tracker.class.Issue &&
      create.collection === COMMENTS_COLLECTION
    if (!isComment || create.attachedTo === undefined) return undefined
    return {
      kind: 'comment',
      tx: create as TxCreateDoc<ChatMessage>,
      project: projectOf(create),
      issue: create.attachedTo as Ref<Issue>
    }
  }
  if (tx._class === core.class.TxUpdateDoc) {
    const update = tx as TxUpdateDoc<Issue>
    if (update.objectClass !== tracker.class.Issue) return undefined
    const fields = Object.keys(update.operations).filter(isTrackedField)
    if (fields.length === 0) return undefined
    return { kind: 'updated', tx: update, project: projectOf(update), issue: update.objectId, fields }
  }
  if (tx._class === core.class.TxRemoveDoc) {
    const remove = tx as TxRemoveDoc<Issue>
    if (remove.objectClass !== tracker.class.Issue) return undefined
    return { kind: 'deleted', tx: remove, project: projectOf(remove), issue: remove.objectId }
  }
  return undefined
}

// Most specific first: a hook gets the first of these it subscribes to.
const UPDATE_EVENTS: ReadonlyArray<[TrackedField | undefined, TrackerEvent]> = [
  ['status', 'issue.status_changed'],
  ['assignee', 'issue.assigned'],
  [undefined, 'issue.updated']
]

const SINGLE_EVENT: Record<Exclude<ChangeKind, 'updated'>, TrackerEvent> = {
  created: 'issue.created',
  deleted: 'issue.deleted',
  comment: 'comment.added'
}

export function pickEvent (
  kind: ChangeKind,
  fields: readonly TrackedField[],
  subscribed: readonly TrackerEvent[]
): TrackerEvent | undefined {
  if (kind !== 'updated') return subscribed.includes(SINGLE_EVENT[kind]) ? SINGLE_EVENT[kind] : undefined
  if (fields.length === 0) return undefined
  const match = UPDATE_EVENTS.find(
    ([field, event]) => (field === undefined || fields.includes(field)) && subscribed.includes(event)
  )
  return match?.[1]
}

// History sorted by modifiedOn; txes sharing the event's timestamp but stored after it are not applied.
export function issueBefore (history: ReadonlyArray<TxCUD<Issue>>, eventTx: Ref<Tx>): Issue | undefined {
  let issue: Issue | undefined
  for (const tx of history) {
    if (tx._id === eventTx) break
    if (tx._class === core.class.TxCreateDoc) {
      issue = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Issue>)
    } else if (tx._class === core.class.TxUpdateDoc && issue !== undefined) {
      issue = TxProcessor.updateDoc2Doc(issue, tx as TxUpdateDoc<Issue>)
    } else if (tx._class === core.class.TxRemoveDoc) {
      issue = undefined
    }
  }
  return issue
}

export function issueAfter (before: Issue, tx: TxUpdateDoc<Issue>): Issue {
  return TxProcessor.updateDoc2Doc(structuredClone(before), tx)
}

// The UI sometimes rewrites a field with the value it already has.
export function changedFields (before: Issue | undefined, after: Issue, fields: readonly TrackedField[]): TrackedField[] {
  if (before === undefined) return [...fields]
  return fields.filter((field) => (before[field] ?? null) !== (after[field] ?? null))
}
