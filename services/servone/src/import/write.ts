import chunter, { type Channel, type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import contact, { type Person } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  generateId,
  makeCollabId,
  type MarkupBlobRef,
  type PersonId,
  type Rank,
  type Ref,
  SortingOrder,
  type Space,
  type SpaceType,
  type StatusCategory,
  type Timestamp,
  type TxCreateDoc,
  type TxCUD,
  type TxFactory,
  type TxOperations,
  type TypedSpace
} from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { makeRank } from '@hcengineering/rank'
import tags, { type TagElement } from '@hcengineering/tags'
import task, { type TaskType } from '@hcengineering/task'
import { jsonToMarkup } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import tracker, { type Issue, type IssueParentInfo, type IssueStatus, type Project, TimeReportDayType } from '@hcengineering/tracker'
import { baseTypeOf } from '@servone/config'
import { z } from 'zod'

import type { Json } from '../http-json'
import type { CollabText } from '../mcp/types'
import { PRIORITY_BY_NAME } from '../tracker/issues'
import type { People, WorkspacePerson } from './people'
import type { DocImport, ImportRequest, ImportStatus, IssueImport, MessageImport, PersonRef } from './request'

const MAX_IDENTIFIER_LEN = 5
const FALLBACK_IDENTIFIER = 'IMP'
const LABEL_PALETTE_SIZE = 24
const SCRUM_TYPE_ID = 'servone:projectType:Scrum'
const SCRUM_TASK_KIND = 'servone:taskType:Task'

type Teamspace = TypedSpace

interface Document extends Doc {
  title: string
  content: MarkupBlobRef | null
  parent: Ref<Document>
  rank: Rank
  attachments?: number
  comments?: number
  embeddings?: number
  labels?: number
  references?: number
}

const documentIds = {
  Document: 'document:class:Document' as Ref<Class<Document>>,
  Teamspace: 'document:class:Teamspace' as Ref<Class<Teamspace>>,
  NoParent: 'document:ids:NoParent' as Ref<Document>,
  DefaultTeamspaceType: 'document:spaceType:DefaultTeamspaceType' as Ref<SpaceType>
}

const CATEGORY_BY_STATUS: Record<ImportStatus, Ref<StatusCategory>> = {
  backlog: task.statusCategory.UnStarted,
  todo: task.statusCategory.ToDo,
  inProgress: task.statusCategory.Active,
  done: task.statusCategory.Won,
  canceled: task.statusCategory.Lost
}

const sequenceBump = z.object({ object: z.object({ sequence: z.number() }) })

export interface ImportCaller {
  account: AccountUuid
  person: Ref<Person>
  socialId: PersonId
}

export interface ImportSession {
  client: Pick<TxOperations, 'txFactory' | 'tx' | 'findAll' | 'findOne' | 'updateDoc' | 'createDoc' | 'createMixin' | 'addCollection'>
  collab: Pick<CollabText, 'writeMarkdown'>
  caller: ImportCaller
  people: People
  now: () => number
}

export class ImportRefError extends Error {
  constructor (readonly field: string) {
    super(`Unknown ${field}`)
  }
}

export interface Authorship {
  socialId: PersonId
  person: Ref<Person>
  prefix: string
}

export function authorship (matched: WorkspacePerson | undefined, ref: PersonRef | undefined, caller: ImportCaller): Authorship {
  if (matched?.socialId !== undefined) return { socialId: matched.socialId, person: matched.person, prefix: '' }
  const label = (ref?.name ?? ref?.email ?? '').trim()
  return { socialId: caller.socialId, person: caller.person, prefix: label === '' ? '' : `**${label}:** ` }
}

export function issueDescription (issue: Pick<IssueImport, 'description' | 'assignee'>, assignee: WorkspacePerson | undefined): string {
  const original = assignee === undefined ? (issue.assignee?.name ?? issue.assignee?.email ?? '').trim() : ''
  if (original === '') return issue.description
  const line = `Original assignee: ${original}`
  return issue.description.trim() === '' ? line : `${issue.description}\n\n${line}`
}

export function projectIdentifier (name: string, taken: ReadonlySet<string>): string {
  const letters = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[0-9]+/, '')
  const stem = letters === '' ? FALLBACK_IDENTIFIER : letters.slice(0, MAX_IDENTIFIER_LEN)
  if (!taken.has(stem)) return stem
  for (let suffix = 2; ; suffix++) {
    const candidate = `${stem.slice(0, MAX_IDENTIFIER_LEN - String(suffix).length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export function statusFor (status: ImportStatus, ordered: IssueStatus[]): Ref<IssueStatus> {
  const found = ordered.find((it) => it.category === CATEGORY_BY_STATUS[status]) ?? ordered[0]
  if (found === undefined) throw new Error('Task type has no statuses')
  return found._id
}

export function labelColor (title: string): number {
  const hash = title.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
  return Math.abs(hash) % LABEL_PALETTE_SIZE
}

export function stampedCreate<T extends Doc> (
  factory: TxFactory,
  _class: Ref<Class<T>>,
  space: Ref<Space>,
  attributes: Data<T>,
  id: Ref<T>,
  author: PersonId,
  date: Timestamp
): TxCreateDoc<T> {
  const tx = factory.createTxCreateDoc(_class, space, attributes, id, date, core.account.System)
  tx.createdBy = author
  tx.createdOn = date
  return tx
}

export function stampedAttach<P extends AttachedDoc> (
  factory: TxFactory,
  parent: Pick<Doc, '_id' | '_class'>,
  collection: string,
  _class: Ref<Class<P>>,
  space: Ref<Space>,
  attributes: Data<P>,
  id: Ref<P>,
  author: PersonId,
  date: Timestamp
): TxCUD<P> {
  const create = stampedCreate(factory, _class, space, attributes, id, author, date)
  return factory.createTxCollectionCUD(parent._class, parent._id, space, collection, create, date, core.account.System)
}

function markup (markdown: string): string {
  return jsonToMarkup(markdownToMarkup(markdown))
}

export async function runImport (session: ImportSession, request: ImportRequest): Promise<Json> {
  switch (request.op) {
    case 'match':
      return { matches: request.people.map((ref) => session.people.match(ref)?.name ?? null) }
    case 'project':
      return await createProject(session, request.name)
    case 'issues':
      return { ids: await importIssues(session, request.project, request.issues) }
    case 'channel':
      return { id: await createChannel(session, request.channel) }
    case 'messages':
      return { ids: await importMessages(session, request.channel, request.messages) }
    case 'teamspace':
      return { id: await createTeamspace(session, request.name) }
    case 'docs':
      return { ids: await importDocs(session, request.teamspace, request.docs) }
  }
}

async function createProject (session: ImportSession, name: string): Promise<{ id: Ref<Project>, identifier: string }> {
  const { client, caller } = session
  const projectType = await client.findOne(task.class.ProjectType, { _id: tracker.ids.ClassingProjectType })
  if (projectType === undefined) throw new Error('Classic project type is missing')
  const kind = await client.findOne(task.class.TaskType, { parent: projectType._id, ofClass: tracker.class.Issue })
  if (kind === undefined) throw new Error('Classic project type has no issue task type')
  const projects = await client.findAll(tracker.class.Project, {}, { projection: { identifier: 1 } })
  const identifier = projectIdentifier(name, new Set(projects.map((it) => it.identifier.toUpperCase())))
  const id = generateId<Project>()
  const project: Data<Project> = {
    name,
    description: '',
    private: false,
    archived: false,
    members: [caller.account],
    owners: [caller.account],
    autoJoin: false,
    identifier,
    sequence: 0,
    defaultIssueStatus: kind.statuses[0],
    defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
    type: projectType._id
  }
  await client.tx(stampedCreate(client.txFactory, tracker.class.Project, core.space.Space, project, id, caller.socialId, session.now()))
  await client.createMixin(id, tracker.class.Project, core.space.Space, projectType.targetClass, {})
  return { id, identifier }
}

async function issueKind (session: ImportSession, project: Project): Promise<TaskType> {
  const kinds = await session.client.findAll(task.class.TaskType, { parent: project.type, ofClass: tracker.class.Issue })
  const kind = baseTypeOf(project.type) === SCRUM_TYPE_ID ? kinds.find((it) => baseTypeOf(it._id) === SCRUM_TASK_KIND) : kinds[0]
  if (kind === undefined) throw new Error(`Project ${project.identifier} has no issue task type`)
  return kind
}

type LabelOf = (title: string) => Promise<Pick<TagElement, '_id' | 'title' | 'color'>>

async function labelResolver (session: ImportSession): Promise<LabelOf> {
  const { client } = session
  const existing = await client.findAll(tags.class.TagElement, { targetClass: tracker.class.Issue })
  const byTitle = new Map<string, Pick<TagElement, '_id' | 'title' | 'color'>>(
    existing.map((label) => [label.title.trim().toLowerCase(), label])
  )
  return async (title) => {
    const key = title.trim().toLowerCase()
    const found = byTitle.get(key)
    if (found !== undefined) return found
    const color = labelColor(title.trim())
    const _id = await client.createDoc(tags.class.TagElement, core.space.Workspace, {
      title: title.trim(),
      description: '',
      targetClass: tracker.class.Issue,
      color,
      category: tags.category.NoCategory
    })
    const created = { _id, title: title.trim(), color }
    byTitle.set(key, created)
    return created
  }
}

function unseenRefs<T extends { key: string }> (items: T[], refOf: (item: T) => string | undefined, isParent: (item: T) => boolean): Set<string> {
  const seen = new Set<string>()
  const unseen = new Set<string>()
  for (const item of items) {
    const ref = refOf(item)
    if (ref !== undefined && !seen.has(ref)) unseen.add(ref)
    if (isParent(item)) seen.add(item.key)
  }
  return unseen
}

type ParentIssue = Pick<Issue, '_id' | 'title' | 'identifier' | 'parents'>

async function importIssues (session: ImportSession, projectId: string, issues: IssueImport[]): Promise<Record<string, string>> {
  const { client, people, caller } = session
  const project = await client.findOne(tracker.class.Project, { _id: projectId as Ref<Project> })
  if (project === undefined) throw new ImportRefError('project')
  const external = [...unseenRefs(issues, (it) => it.parent, () => true)]
  const parents = new Map<string, ParentIssue>()
  if (external.length > 0) {
    const found = await client.findAll(tracker.class.Issue, { _id: { $in: external.map((id) => id as Ref<Issue>) }, space: project._id })
    for (const parent of found) parents.set(parent._id, parent)
    if (found.length < external.length) throw new ImportRefError('parent')
  }
  if (issues.length === 0) return {}

  const kind = await issueKind(session, project)
  const statuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: kind.statuses } })
  const ordered = kind.statuses.flatMap((id) => statuses.filter((it) => it._id === id))
  const labelOf = await labelResolver(session)
  const bump = await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: issues.length } }, true)
  let number = sequenceBump.parse(bump).object.sequence - issues.length
  const last = await client.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })
  let rank = last?.rank

  const ids: Record<string, string> = {}
  for (const issue of issues) {
    number++
    rank = makeRank(rank, undefined)
    const id = generateId<Issue>()
    const identifier = `${project.identifier}-${number}`
    const parent = issue.parent === undefined ? undefined : parents.get(issue.parent)
    const assignee = people.match(issue.assignee)
    const description = issueDescription(issue, assignee)
    const descriptionRef =
      description.trim() === '' ? null : await session.collab.writeMarkdown(makeCollabId(tracker.class.Issue, id, 'description'), description)
    const parentInfo: IssueParentInfo[] =
      parent === undefined
        ? []
        : [{ parentId: parent._id, parentTitle: parent.title, space: project._id, identifier: parent.identifier }, ...parent.parents]
    const estimation = issue.estimateHours ?? 0
    const createdOn = issue.createdOn ?? session.now()
    const attachedTo = parent?._id ?? tracker.ids.NoParent
    const attributes: Data<Issue> = {
      attachedTo,
      attachedToClass: tracker.class.Issue,
      collection: 'subIssues',
      title: issue.title,
      description: descriptionRef,
      status: statusFor(issue.status, ordered),
      priority: PRIORITY_BY_NAME[issue.priority],
      component: null,
      subIssues: 0,
      parents: parentInfo,
      startDate: null,
      estimation,
      remainingTime: estimation,
      reportedTime: 0,
      reports: 0,
      childInfo: [],
      kind: kind._id,
      number,
      assignee: assignee?.person ?? null,
      dueDate: issue.dueDate ?? null,
      comments: 0,
      identifier,
      rank
    }
    const creator = authorship(people.match(issue.creator), undefined, caller)
    await client.tx(
      stampedAttach(
        client.txFactory,
        { _id: attachedTo, _class: tracker.class.Issue },
        'subIssues',
        tracker.class.Issue,
        project._id,
        attributes,
        id,
        creator.socialId,
        createdOn
      )
    )
    for (const title of new Map(issue.labels.filter((it) => it.trim() !== '').map((it) => [it.trim().toLowerCase(), it])).values()) {
      const label = await labelOf(title)
      await client.addCollection(tags.class.TagReference, project._id, id, tracker.class.Issue, 'labels', {
        title: label.title,
        color: label.color,
        tag: label._id
      })
    }
    const comments = [...issue.comments].sort((a, b) => (a.date ?? createdOn) - (b.date ?? createdOn))
    for (const comment of comments) {
      const author = authorship(people.match(comment.author), comment.author, caller)
      const message: Data<ChatMessage> = {
        attachedTo: id,
        attachedToClass: tracker.class.Issue,
        collection: 'comments',
        message: markup(author.prefix + comment.text)
      }
      await client.tx(
        stampedAttach(
          client.txFactory,
          { _id: id, _class: tracker.class.Issue },
          'comments',
          chunter.class.ChatMessage,
          project._id,
          message,
          generateId<ChatMessage>(),
          author.socialId,
          comment.date ?? createdOn
        )
      )
    }
    parents.set(issue.key, { _id: id, title: issue.title, identifier, parents: parentInfo })
    ids[issue.key] = id
  }
  return ids
}

async function createChannel (
  session: ImportSession,
  channel: Extract<ImportRequest, { op: 'channel' }>['channel']
): Promise<Ref<Channel>> {
  const { client, caller, people } = session
  const members = new Map<AccountUuid, Ref<Person>>([[caller.account, caller.person]])
  for (const ref of channel.members) {
    const matched = people.match(ref)
    if (matched?.account !== undefined) members.set(matched.account, matched.person)
  }
  const id = generateId<Channel>()
  const data: Data<Channel> = {
    name: channel.name,
    description: '',
    topic: channel.topic,
    private: channel.isPrivate,
    archived: channel.isArchived,
    members: [...members.keys()],
    owners: [caller.account],
    autoJoin: false
  }
  await client.tx(stampedCreate(client.txFactory, chunter.class.Channel, core.space.Space, data, id, caller.socialId, session.now()))
  const spaces = await client.findAll(contact.class.PersonSpace, { person: { $in: [...members.values()] } })
  for (const [account, person] of members) {
    const space = spaces.find((it) => it.person === person)
    if (space === undefined) continue
    await client.createDoc(notification.class.DocNotifyContext, space._id, {
      user: account,
      objectId: id,
      objectClass: chunter.class.Channel,
      objectSpace: core.space.Space,
      isPinned: false,
      hidden: false,
      lastViewedTimestamp: session.now()
    })
  }
  return id
}

interface ThreadParent {
  _id: Ref<ChatMessage>
  _class: Ref<Class<ChatMessage>>
  repliedPersons: Array<Ref<Person>>
}

async function importMessages (session: ImportSession, channelId: string, messages: MessageImport[]): Promise<Record<string, string>> {
  const { client, people, caller } = session
  const channel = await client.findOne(chunter.class.Channel, { _id: channelId as Ref<Channel> })
  if (channel === undefined) throw new ImportRefError('channel')
  const external = [...unseenRefs(messages, (it) => it.thread, (it) => it.thread === undefined)]
  const threads = new Map<string, ThreadParent>()
  if (external.length > 0) {
    const found = await client.findAll(chunter.class.ChatMessage, {
      _id: { $in: external.map((id) => id as Ref<ChatMessage>) },
      attachedTo: channel._id
    })
    for (const parent of found) {
      threads.set(parent._id, { _id: parent._id, _class: parent._class, repliedPersons: [...(parent.repliedPersons ?? [])] })
    }
    if (found.length < external.length) throw new ImportRefError('thread')
  }

  const replied = new Set<ThreadParent>()
  const ids: Record<string, string> = {}
  for (const message of messages) {
    const author = authorship(people.match(message.author), message.author, caller)
    const text = markup(author.prefix + message.text)
    const parent = message.thread === undefined ? undefined : threads.get(message.thread)
    if (parent === undefined) {
      const id = generateId<ChatMessage>()
      const root: Data<ChatMessage> = { attachedTo: channel._id, attachedToClass: chunter.class.Channel, collection: 'messages', message: text }
      await client.tx(stampedAttach(client.txFactory, channel, 'messages', chunter.class.ChatMessage, channel._id, root, id, author.socialId, message.date))
      threads.set(message.key, { _id: id, _class: chunter.class.ChatMessage, repliedPersons: [] })
      ids[message.key] = id
      continue
    }
    const id = generateId<ThreadMessage>()
    const reply: Data<ThreadMessage> = {
      attachedTo: parent._id,
      attachedToClass: parent._class,
      collection: 'replies',
      message: text,
      objectId: channel._id,
      objectClass: chunter.class.Channel
    }
    await client.tx(stampedAttach(client.txFactory, parent, 'replies', chunter.class.ThreadMessage, channel._id, reply, id, author.socialId, message.date))
    if (!parent.repliedPersons.includes(author.person)) {
      parent.repliedPersons.push(author.person)
      replied.add(parent)
    }
    ids[message.key] = id
  }
  for (const parent of replied) {
    await client.updateDoc(parent._class, channel._id, parent._id, { repliedPersons: parent.repliedPersons })
  }
  return ids
}

async function createTeamspace (session: ImportSession, name: string): Promise<Ref<Teamspace>> {
  const { client, caller } = session
  const spaceType = await client.findOne(core.class.SpaceType, { _id: documentIds.DefaultTeamspaceType })
  if (spaceType === undefined) throw new Error('Default teamspace type is missing')
  const id = generateId<Teamspace>()
  const data: Data<Teamspace> = {
    name,
    description: '',
    private: false,
    archived: false,
    members: [caller.account],
    owners: [caller.account],
    autoJoin: false,
    type: spaceType._id
  }
  await client.tx(stampedCreate(client.txFactory, documentIds.Teamspace, core.space.Space, data, id, caller.socialId, session.now()))
  await client.createMixin(id, documentIds.Teamspace, core.space.Space, spaceType.targetClass, {})
  return id
}

async function importDocs (session: ImportSession, teamspaceId: string, docs: DocImport[]): Promise<Record<string, string>> {
  const { client, caller } = session
  const teamspace = await client.findOne(documentIds.Teamspace, { _id: teamspaceId as Ref<Teamspace> })
  if (teamspace === undefined) throw new ImportRefError('teamspace')
  const external = [...unseenRefs(docs, (it) => it.parent, () => true)]
  const parents = new Map<string, Ref<Document>>()
  if (external.length > 0) {
    const found = await client.findAll(documentIds.Document, { _id: { $in: external.map((id) => id as Ref<Document>) }, space: teamspace._id })
    for (const parent of found) parents.set(parent._id, parent._id)
    if (found.length < external.length) throw new ImportRefError('parent')
  }

  const lastRanks = new Map<Ref<Document>, Rank | undefined>()
  const lastRankUnder = async (parent: Ref<Document>): Promise<Rank | undefined> => {
    if (lastRanks.has(parent)) return lastRanks.get(parent)
    const last = await client.findOne(documentIds.Document, { space: teamspace._id, parent }, { sort: { rank: SortingOrder.Descending } })
    return last?.rank
  }

  const ids: Record<string, string> = {}
  for (const doc of docs) {
    const id = generateId<Document>()
    const parent = doc.parent === undefined ? documentIds.NoParent : (parents.get(doc.parent) ?? documentIds.NoParent)
    const rank = makeRank(await lastRankUnder(parent), undefined)
    lastRanks.set(parent, rank)
    const content =
      doc.markdown.trim() === '' ? null : await session.collab.writeMarkdown(makeCollabId(documentIds.Document, id, 'content'), doc.markdown)
    const data: Data<Document> = {
      title: doc.title,
      content,
      parent,
      rank,
      attachments: 0,
      comments: 0,
      embeddings: 0,
      labels: 0,
      references: 0
    }
    await client.tx(stampedCreate(client.txFactory, documentIds.Document, teamspace._id, data, id, caller.socialId, session.now()))
    parents.set(doc.key, id)
    ids[doc.key] = id
  }
  return ids
}
