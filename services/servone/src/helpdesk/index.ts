// SLA breaches, auto-close and auto-archive for workflow projects with helpdesk settings; run by the scheduler tick.
import type { RestClient } from '@hcengineering/api-client'
import chunter, { type ChatMessage } from '@hcengineering/chunter'
import contact, { formatName, type Person } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Class,
  type Collaborator,
  type DocumentUpdate,
  generateId,
  type Ref,
  type Timestamp,
  TxFactory,
  type Type
} from '@hcengineering/core'
import { getEmbeddedLabel } from '@hcengineering/platform'
import tags, { type TagElement, type TagReference } from '@hcengineering/tags'
import task from '@hcengineering/task'
import { jsonToMarkup, type MarkupNode, MarkupNodeType } from '@hcengineering/text-core'
import tracker, { type Project } from '@hcengineering/tracker'
import { parseHelpdeskSettings, type StoredHelpdesk } from '@servone/notify-rules'

import { loadStatusKinds } from '../issue-dates/store'
import { HELPDESK_FLAGS, planHelpdesk, type HelpdeskAction, type HelpdeskIssue, type SlaTargetName } from './plan'

interface HelpdeskProject extends Project, StoredHelpdesk {}

// Class<T> never uses T, so the stock refs type the custom fields without a cast.
const helpdeskProjectClass: Ref<Class<HelpdeskProject>> = tracker.class.Project
const helpdeskIssueClass: Ref<Class<HelpdeskIssue>> = tracker.class.Issue

const txFactory = new TxFactory(core.account.System)

const timestampType: Type<Timestamp> = { _class: core.class.TypeTimestamp, label: core.string.Timestamp }

const FLAG_LABELS: Array<[string, string]> = [
  [HELPDESK_FLAGS.respondBreachedOn, 'Response SLA breached on'],
  [HELPDESK_FLAGS.resolveBreachedOn, 'Resolution SLA breached on'],
  [HELPDESK_FLAGS.archivedOn, 'Archived on']
]

// Vietnamese only until workspaces carry a language.
const SLA_LABEL = 'Vi phạm SLA'
const SLA_LABEL_COLOR = 0 // Firework red in the stock label palette (ui/src/colors.ts)
const MISSED_TEXT: Record<SlaTargetName, string> = { respond: 'phản hồi', resolve: 'xử lý xong' }

// Activity skips only declared hidden attributes; an undeclared field would put a line in every issue's activity.
async function ensureFlagAttributes (client: RestClient): Promise<void> {
  const existing = await client.findAll(core.class.Attribute, {
    attributeOf: tracker.class.Issue,
    name: { $in: FLAG_LABELS.map(([name]) => name) }
  })
  for (const [name, label] of FLAG_LABELS) {
    if (existing.some((attribute) => attribute.name === name)) continue
    await client.tx(
      txFactory.createTxCreateDoc(core.class.Attribute, core.space.Model, {
        attributeOf: tracker.class.Issue,
        name,
        label: getEmbeddedLabel(label),
        type: timestampType,
        isCustom: true,
        hidden: true
      })
    )
  }
}

// The issue's own time and author, so a flag never restarts the auto-close idle clock or the "modified" sort.
async function writeFlags (
  client: RestClient,
  issue: HelpdeskIssue,
  operations: DocumentUpdate<HelpdeskIssue>
): Promise<void> {
  await client.tx(
    txFactory.createTxUpdateDoc(
      helpdeskIssueClass,
      issue.space,
      issue._id,
      operations,
      false,
      issue.modifiedOn,
      issue.modifiedBy
    )
  )
}

async function slaLabel (client: RestClient): Promise<Pick<TagElement, '_id' | 'title' | 'color'>> {
  const query = { title: SLA_LABEL, targetClass: tracker.class.Issue }
  const existing = await client.findOne(tags.class.TagElement, query)
  if (existing !== undefined) return existing
  const create = txFactory.createTxCreateDoc(tags.class.TagElement, core.space.Workspace, {
    ...query,
    description: '',
    color: SLA_LABEL_COLOR,
    category: tracker.category.Other
  })
  await client.tx(create)
  return { _id: create.objectId, title: SLA_LABEL, color: SLA_LABEL_COLOR }
}

async function addSlaLabel (client: RestClient, issue: HelpdeskIssue): Promise<void> {
  const label = await slaLabel(client)
  if ((await client.findOne(tags.class.TagReference, { attachedTo: issue._id, tag: label._id })) !== undefined) return
  const reference = txFactory.createTxCreateDoc<TagReference>(tags.class.TagReference, issue.space, {
    title: label.title,
    color: label.color,
    tag: label._id,
    attachedTo: issue._id,
    attachedToClass: tracker.class.Issue,
    collection: 'labels'
  })
  await client.tx(txFactory.createTxCollectionCUD(tracker.class.Issue, issue._id, issue.space, 'labels', reference))
}

// Inbox only notifies existing followers of a comment, and the stock mention-to-follower trigger skips System's messages.
async function ensureFollowers (client: RestClient, issue: HelpdeskIssue, people: Person[]): Promise<void> {
  const accounts = people.map((person) => person.personUuid).filter((uuid): uuid is AccountUuid => uuid !== undefined)
  const following = await client.findAll(core.class.Collaborator, { attachedTo: issue._id, collaborator: { $in: accounts } })
  for (const account of accounts) {
    if (following.some((follower) => follower.collaborator === account)) continue
    await client.tx(
      txFactory.createTxCreateDoc<Collaborator>(core.class.Collaborator, issue.space, {
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue,
        collaborator: account,
        collection: 'collaborators'
      })
    )
  }
}

// A mention is what reaches Inbox, push and email through the stock triggers.
async function postBreachComment (
  client: RestClient,
  project: Project,
  issue: HelpdeskIssue,
  target: SlaTargetName,
  hours: number
): Promise<void> {
  const owners = await client.findAll(contact.class.Person, { personUuid: { $in: project.owners ?? [] } })
  const assignee =
    issue.assignee === null ? undefined : await client.findOne(contact.class.Person, { _id: issue.assignee })
  const people = new Map<Ref<Person>, Person>(owners.map((person) => [person._id, person]))
  if (assignee !== undefined) people.set(assignee._id, assignee)
  await ensureFollowers(client, issue, [...people.values()])
  const content: MarkupNode[] = [
    { type: MarkupNodeType.text, text: `${SLA_LABEL}: quá ${hours} giờ chưa ${MISSED_TEXT[target]}.` }
  ]
  for (const person of people.values()) {
    content.push(
      { type: MarkupNodeType.text, text: ' ' },
      {
        type: MarkupNodeType.reference,
        attrs: { id: person._id, objectclass: contact.class.Person, label: formatName(person.name) }
      }
    )
  }
  const message = jsonToMarkup({ type: MarkupNodeType.doc, content: [{ type: MarkupNodeType.paragraph, content }] })
  const comment = txFactory.createTxCreateDoc<ChatMessage>(
    chunter.class.ChatMessage,
    issue.space,
    { message, attachedTo: issue._id, attachedToClass: tracker.class.Issue, collection: 'comments' },
    generateId()
  )
  await client.tx(txFactory.createTxCollectionCUD(tracker.class.Issue, issue._id, issue.space, 'comments', comment))
}

async function applyAction (
  client: RestClient,
  project: Project,
  action: HelpdeskAction<HelpdeskIssue>,
  now: number
): Promise<void> {
  const { issue } = action
  switch (action.kind) {
    case 'breach':
      // Flag first: a failed comment must not repeat the alert every minute.
      await writeFlags(
        client,
        issue,
        action.target === 'respond' ? { servoneSlaRespondBreachedOn: now } : { servoneSlaResolveBreachedOn: now }
      )
      await addSlaLabel(client, issue)
      await postBreachComment(client, project, issue, action.target, action.hours)
      return
    case 'close':
      await client.tx(
        txFactory.createTxUpdateDoc(helpdeskIssueClass, issue.space, issue._id, { status: action.status })
      )
      return
    case 'archive':
      await writeFlags(client, issue, { servoneArchivedOn: now })
      return
    case 'unarchive':
      await writeFlags(client, issue, { $unset: { [HELPDESK_FLAGS.archivedOn]: true } })
  }
}

export async function runHelpdesk (client: RestClient, now: number): Promise<void> {
  const projects = (await client.findAll(helpdeskProjectClass, { archived: false }))
    .map((project) => ({ project, settings: parseHelpdeskSettings(project) }))
    .filter(({ settings }) => Object.keys(settings).length > 0)
  if (projects.length === 0) return
  await ensureFlagAttributes(client)
  const statusKinds = await loadStatusKinds(client)
  const finished = [...statusKinds]
    .filter(([, kind]) => kind === 'done' || kind === 'canceled')
    .map(([status]) => status)
  const taskTypes = await client.findAll(task.class.TaskType, {
    parent: { $in: projects.map(({ project }) => project.type) }
  })
  const typeOrder = new Map(taskTypes.map((taskType) => [taskType._id, taskType.statuses]))
  for (const { project, settings } of projects) {
    // ponytail: reads every unarchived ticket each minute; split per rule if a helpdesk grows past a few thousand.
    const live = await client.findAll(helpdeskIssueClass, { space: project._id, servoneArchivedOn: { $exists: false } })
    const reopened = await client.findAll(helpdeskIssueClass, {
      space: project._id,
      servoneArchivedOn: { $exists: true },
      status: { $nin: finished }
    })
    for (const action of planHelpdesk(settings, statusKinds, typeOrder, [...live, ...reopened], now)) {
      await applyAction(client, project, action, now)
    }
  }
}
