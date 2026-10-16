import type { RestClient } from '@hcengineering/api-client'
import contact, { formatName, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import core, { type AccountUuid, type Doc, type PersonId, type Ref, SortingOrder, type Timestamp, type TxCUD, TxProcessor } from '@hcengineering/core'
import { markupToJSON } from '@hcengineering/text-core'
import { markupToMarkdown } from '@hcengineering/text-markdown'
import tracker, { type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
import { findRecipient } from '../workspaces'
import { changedFields, issueAfter, issueBefore, type IssueChange, type TrackedField } from './events'
import type { IssueFacts, PersonRef, ProjectRef, ResolvedChange } from './payload'

const SYSTEM_ACTOR: PersonRef = { name: 'System', email: null }
const UNKNOWN_PERSON: PersonRef = { name: 'Unknown', email: null }

export interface WorkspaceReader {
  // Every create, update and remove of the issue up to `until`, oldest first.
  issueHistory: (issue: Ref<Issue>, until: Timestamp) => Promise<Array<TxCUD<Issue>>>
  statusNames: (ids: Array<Ref<IssueStatus>>) => Promise<Map<Ref<IssueStatus>, string>>
  person: (person: Ref<Person>) => Promise<PersonRef>
  actor: (socialId: PersonId) => Promise<PersonRef>
  account: (account: AccountUuid) => Promise<PersonRef>
  project: (project: Ref<Project>) => Promise<ProjectRef | undefined>
}

async function personOf (client: RestClient, person: Ref<Person>): Promise<PersonRef> {
  const found = await client.findOne(contact.class.Person, { _id: person })
  if (found === undefined) return UNKNOWN_PERSON
  return { name: formatName(found.name), email: (await findRecipient(client, person)) ?? null }
}

const isIssueTx = (tx: TxCUD<Doc>): tx is TxCUD<Issue> => tx.objectClass === tracker.class.Issue

export function restReader (client: RestClient): WorkspaceReader {
  return {
    issueHistory: async (issue, until) => {
      const history = await client.findAll(
        core.class.TxCUD,
        { objectId: issue, objectClass: tracker.class.Issue, modifiedOn: { $lte: until } },
        { sort: { modifiedOn: SortingOrder.Ascending } }
      )
      return history.filter(isIssueTx)
    },
    statusNames: async (ids) => {
      const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: ids } })
      return new Map(statuses.map((status) => [status._id, status.name]))
    },
    person: async (person) => await personOf(client, person),
    actor: async (socialId) => {
      if (socialId === core.account.System) return SYSTEM_ACTOR
      // A SocialIdentity _id is the PersonId itself; only the brand differs.
      const identity = await client.findOne(contact.class.SocialIdentity, { _id: socialId as SocialIdentityRef })
      return identity === undefined ? UNKNOWN_PERSON : await personOf(client, identity.attachedTo)
    },
    account: async (account) => {
      const person = await client.findOne(contact.class.Person, { personUuid: account })
      return person === undefined ? UNKNOWN_PERSON : await personOf(client, person._id)
    },
    project: async (project) => {
      const found = await client.findOne(tracker.class.Project, { _id: project })
      return found === undefined ? undefined : { identifier: found.identifier, name: found.name }
    }
  }
}

export type Resolution = { resolved: ResolvedChange } | { skipped: 'unchanged' | 'no_history' | 'no_project' }

interface IssueStates {
  before: Issue | undefined
  after: Issue
  fields: TrackedField[]
}

async function issueStates (reader: WorkspaceReader, change: IssueChange): Promise<IssueStates | undefined> {
  if (change.kind === 'created') {
    const after = TxProcessor.createDoc2Doc(change.tx)
    return { before: undefined, after, fields: [] }
  }
  const history = await reader.issueHistory(change.issue, change.tx.modifiedOn)
  const before = issueBefore(history, change.tx._id)
  if (before === undefined) return undefined
  if (change.kind === 'updated') {
    const after = issueAfter(before, change.tx)
    return { before, after, fields: changedFields(before, after, change.fields) }
  }
  return { before: undefined, after: before, fields: [] }
}

export async function resolveChange (
  reader: WorkspaceReader,
  change: IssueChange,
  issueUrlBase: string | undefined
): Promise<Resolution> {
  const states = await issueStates(reader, change)
  if (states === undefined) return { skipped: 'no_history' }
  const { before, after, fields } = states
  if (change.kind === 'updated' && fields.length === 0) return { skipped: 'unchanged' }
  const project = await reader.project(change.project)
  if (project === undefined) return { skipped: 'no_project' }

  const issues = before === undefined ? [after] : [before, after]
  const statusNames = await reader.statusNames([...new Set(issues.map((issue) => issue.status))])
  const assignees = [...new Set(issues.flatMap((issue) => (issue.assignee === null ? [] : [issue.assignee])))]
  const people = new Map(await Promise.all(assignees.map(async (ref) => [ref, await reader.person(ref)] as const)))
  const facts = (issue: Issue): IssueFacts => ({
    title: issue.title,
    status: statusNames.get(issue.status) ?? 'Unknown',
    priority: issue.priority,
    assignee: issue.assignee === null ? null : people.get(issue.assignee) ?? UNKNOWN_PERSON,
    dueDate: issue.dueDate
  })

  const isDeleted = change.kind === 'deleted'
  return {
    resolved: {
      occurredAt: change.tx.modifiedOn,
      project,
      issue: {
        ...facts(after),
        identifier: after.identifier,
        url: isDeleted || issueUrlBase === undefined ? null : `${issueUrlBase}/${after.identifier}`
      },
      previous: change.kind === 'updated' && before !== undefined ? facts(before) : undefined,
      changedFields: fields,
      actor: await reader.actor(change.tx.modifiedBy),
      comment: change.kind === 'comment' ? markupToMarkdown(markupToJSON(change.tx.attributes.message)) : undefined
    }
  }
}
