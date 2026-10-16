import chunter, { type ChatMessage } from '@hcengineering/chunter'
import type { Person } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Data,
  type DocumentUpdate,
  type PersonId,
  type Ref,
  type TxCreateDoc,
  TxFactory,
  type TxRemoveDoc,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'
import tracker, { type Issue, IssuePriority, type IssueStatus, type Project } from '@hcengineering/tracker'
import type { StoredTrackerHook } from '../store'

export const WORKSPACE = 'ws-1' as WorkspaceUuid
export const PROJECT = 'project-srv' as Ref<Project>
export const ISSUE = 'issue-122' as Ref<Issue>
export const TODO = 'status-todo' as Ref<IssueStatus>
export const IN_PROGRESS = 'status-progress' as Ref<IssueStatus>
export const AN = 'person-an' as Ref<Person>
export const ACTOR = 'social-hung' as PersonId

export const factory = new TxFactory(ACTOR)

export function issueAttributes (overrides: Partial<Data<Issue>> = {}): Data<Issue> {
  return {
    attachedTo: tracker.ids.NoParent,
    attachedToClass: tracker.class.Issue,
    collection: 'subIssues',
    title: 'Send tracker events',
    description: null,
    status: TODO,
    priority: IssuePriority.Medium,
    component: null,
    subIssues: 0,
    parents: [],
    startDate: null,
    estimation: 0,
    remainingTime: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    kind: 'task-type' as Ref<TaskType>,
    number: 122,
    assignee: null,
    dueDate: null,
    identifier: 'SRV-122',
    rank: '0|aaa',
    ...overrides
  }
}

export function createIssue (overrides: Partial<Data<Issue>> = {}, modifiedOn = 1_000): TxCreateDoc<Issue> {
  return factory.createTxCreateDoc(tracker.class.Issue, PROJECT, issueAttributes(overrides), ISSUE, modifiedOn)
}

export function updateIssue (operations: DocumentUpdate<Issue>, modifiedOn = 2_000): TxUpdateDoc<Issue> {
  return factory.createTxUpdateDoc(tracker.class.Issue, PROJECT, ISSUE, operations, false, modifiedOn)
}

export function removeIssue (modifiedOn = 3_000): TxRemoveDoc<Issue> {
  return factory.createTxRemoveDoc(tracker.class.Issue, PROJECT, ISSUE, modifiedOn)
}

export function addComment (message: string, collection = 'comments'): TxCreateDoc<ChatMessage> {
  const create = factory.createTxCreateDoc<ChatMessage>(
    chunter.class.ChatMessage,
    PROJECT,
    { message, attachedTo: ISSUE, attachedToClass: tracker.class.Issue, collection },
    undefined,
    2_500
  )
  return { ...create, attachedTo: ISSUE, attachedToClass: tracker.class.Issue, collection }
}

export const systemUpdate = (operations: DocumentUpdate<Issue>): TxUpdateDoc<Issue> =>
  new TxFactory(core.account.System).createTxUpdateDoc(tracker.class.Issue, PROJECT, ISSUE, operations)

export function storedHook (id: string, overrides: Partial<StoredTrackerHook> = {}): StoredTrackerHook {
  return {
    id,
    workspace: WORKSPACE,
    project: PROJECT,
    url: 'https://hooks.example.com/servone',
    events: ['issue.created'],
    sealedSecret: { keyId: 'a', iv: '', tag: '', data: '' },
    createdBy: 'owner' as AccountUuid,
    createdOn: 1,
    consecutiveFailures: 0,
    ...overrides
  }
}
