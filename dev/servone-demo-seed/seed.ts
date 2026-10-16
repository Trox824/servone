//
// Seeds a demo workspace with company data for the apps the tracker seed does not cover: chat, calendar with
// rooms and leave, approvals (the Workflows app) and a drive. Reuses the tracker seed's demo people.
//
//   SERVER_SECRET=… dev/railway/node_modules/.bin/tsx dev/servone-demo-seed/seed.ts \
//     --workspace acmestudio [--dry-run | --wipe]
//
// Runs only on the throwaway demo workspace unless --i-know is passed. See README.md.
//
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { RESOURCE_CLASS } from '../../packages/servone-approvals/src/booking'
import { createWorkflow } from '../../services/servone/src/workflows/create'
import { PEOPLE, DEMO_DOMAIN } from '../servone-tracker-seed/content'
import { contact, core, chunter, combineName, defaultAccountsUrl, getEmbeddedLabel, makeRank, repoRoot, tracker, task } from '../servone-tracker-seed/workspace'
import { DEPARTMENTS, DRIVE_FOLDERS, DRIVE_NAME, ID_PREFIX, MARKER, type PersonKey } from './content'
import { fileBytes, FILE_TYPES, textPdf } from './files'
import {
  APPROVALS_SERVICE,
  attachment,
  calendar,
  card,
  calendarLib,
  connectAs,
  drive,
  driveLib,
  generateId,
  hr,
  request,
  TOOL_SERVICE,
  trackerLib,
  type Connection
} from './libs'
import { buildScenario, markupOf, vietnamDayStart, VIETNAM_ZONE, type Scenario } from './scenario'
import { ADMIN_MAIL, MAIL_FOLDERS, MAIL_THREADS, type MailFolderKey, type MailSpec } from './mail-content'
import { ensureMailApp, ensureMailbox, ensureMailSchema } from '../../services/servone/src/mail/schema'
import {
  cardBase,
  emailsOf,
  encodeLocation,
  mailboxSpaceId,
  MAIL_ACCOUNT_CLASS,
  MAIL_FOLDER_CLASS,
  MAIL_MESSAGE_CLASS,
  MAIL_THREAD_CLASS,
  subjectKey,
  type MailFolderCard
} from '../../packages/servone-mail/src'
import type { Ref } from '@hcengineering/core'

const DEMO_WORKSPACE = 'acmestudio'
const ADMIN_EMAIL = 'admin@servone.local'
const VIETNAM_UTC_OFFSET_MINUTES = -420 // hr TzDate offset is minutes behind UTC
const ENGINE_WAIT_MS = 45_000
const ENGINE_POLL_MS = 3_000
const DEFAULT_REMINDER_MS = 10 * 60 * 1000

const PRIORITY: Record<string, number> = {
  none: trackerLib.IssuePriority.NoPriority,
  urgent: trackerLib.IssuePriority.Urgent,
  high: trackerLib.IssuePriority.High,
  medium: trackerLib.IssuePriority.Medium,
  low: trackerLib.IssuePriority.Low
}

interface Args {
  workspace: string
  dryRun: boolean
  wipe: boolean
  isMailOnly: boolean
  isKnown: boolean
  accounts: string
  datalake: string
}

function readArgs (): Args {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string', default: '' },
      'dry-run': { type: 'boolean', default: false },
      wipe: { type: 'boolean', default: false },
      mail: { type: 'boolean', default: false },
      'i-know': { type: 'boolean', default: false },
      accounts: { type: 'string', default: '' },
      datalake: { type: 'string', default: '' }
    }
  })
  const railway = JSON.parse(readFileSync(join(repoRoot, 'dev', '.servone-railway.json'), 'utf8'))
  return {
    workspace: values.workspace,
    dryRun: values['dry-run'],
    wipe: values.wipe,
    isMailOnly: values.mail,
    isKnown: values['i-know'],
    accounts: values.accounts === '' ? defaultAccountsUrl() : values.accounts,
    datalake: values.datalake === '' ? railway.DATALAKE_URL : values.datalake
  }
}

interface Who {
  person: string
  socialId: string
  name: string
  account?: string
}

interface World {
  tool: Connection
  approvals: Connection
  people: Map<PersonKey, Who>
  admin: Who & { account: string, calendar: string }
  scenario: Scenario
}

const idOf = (...parts: string[]): string => `${ID_PREFIX}${parts.join('-')}`
const isOurs = (doc: { _id: string }): boolean => doc._id.startsWith(ID_PREFIX)

// A fixed account id per demo person, so a DM can name them although they have no login.
function accountOf (key: string): string {
  const hex = createHash('sha1').update(`${DEMO_WORKSPACE}:${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

async function resolvePeople (client: any): Promise<{ people: Map<PersonKey, Who>, admin: World['admin'] }> {
  const people = new Map<PersonKey, Who>()
  for (const spec of PEOPLE) {
    const email = `${spec.first}.${spec.last}@${DEMO_DOMAIN}`.toLowerCase()
    const social = await client.findOne(contact.class.SocialIdentity, { key: `email:${email}` })
    if (social === undefined) throw new Error(`demo person ${email} not found; run dev/servone-tracker-seed first`)
    people.set(spec.key as PersonKey, {
      person: social.attachedTo,
      socialId: social._id,
      name: combineName(spec.first, spec.last).split(',').reverse().join(' ').trim(),
      account: accountOf(spec.key)
    })
  }
  const adminSocial = await client.findOne(contact.class.SocialIdentity, { key: `email:${ADMIN_EMAIL}` })
  if (adminSocial === undefined) throw new Error(`admin ${ADMIN_EMAIL} not found`)
  const adminPerson = await client.findOne(contact.class.Person, { _id: adminSocial.attachedTo })
  const account: string | undefined = adminPerson?.personUuid
  if (adminPerson === undefined || account === undefined) throw new Error('the admin has no account')
  const hulySocial = await client.findOne(contact.class.SocialIdentity, { attachedTo: adminPerson._id, type: 'huly' })
  const primary: string = hulySocial?._id ?? adminSocial._id
  const named = (adminPerson.name as string).split(',').reverse().join(' ').trim()
  const admin = { person: adminPerson._id, socialId: primary, name: named, account, calendar: `${account}_calendar` }
  people.set('admin', admin)
  return { people, admin }
}

const who = (world: World, key: PersonKey): Who => {
  const found = world.people.get(key)
  if (found === undefined) throw new Error(`unknown person ${key}`)
  return found
}

const mentionOf = (world: World) => (key: string) => {
  const found = world.people.get(key as PersonKey)
  return found === undefined ? undefined : { id: found.person, name: found.name }
}

async function alreadySeeded (client: any): Promise<boolean> {
  const departments = await client.findAll(hr.class.Department, {})
  return departments.some(isOurs)
}

// ---------------------------------------------------------------- people and departments

async function seedDepartments (world: World): Promise<void> {
  const client = world.tool.client
  for (const person of world.people.values()) {
    if (person.account !== undefined && person !== world.admin) {
      await client.updateDoc(contact.class.Person, contact.space.Contacts, person.person, { personUuid: person.account })
    }
  }
  for (const spec of DEPARTMENTS) {
    await client.createDoc(
      hr.class.Department,
      core.space.Workspace,
      { name: spec.name, description: spec.description, parent: hr.ids.Head, members: [], teamLead: who(world, spec.lead).person, managers: [] },
      idOf('dept', spec.key)
    )
  }
  for (const spec of DEPARTMENTS) {
    for (const key of spec.members) {
      const member = who(world, key)
      if (key === 'admin') continue
      await client.updateMixin(member.person, contact.class.Person, contact.space.Contacts, hr.mixin.Staff, { department: idOf('dept', spec.key) })
    }
  }
  console.log(`departments: ${DEPARTMENTS.length}`)
}

// ---------------------------------------------------------------- chat

async function seedChat (world: World): Promise<{ messages: number, replies: number, directs: number }> {
  const { client } = world.tool
  let messages = 0
  let replies = 0
  const post = async (space: string, spaceClass: string, spec: Scenario['channels'][number]['messages'][number]): Promise<void> => {
    const by = who(world, spec.by).socialId
    const parent = idOf('msg', spec.id)
    await client.addCollection(
      chunter.class.ChatMessage,
      space,
      space,
      spaceClass,
      'messages',
      { message: markupOf(spec.text, mentionOf(world)) },
      parent,
      spec.at,
      by
    )
    messages++
    for (const reply of spec.replies) {
      await client.addCollection(
        chunter.class.ThreadMessage,
        space,
        parent,
        chunter.class.ChatMessage,
        'replies',
        { message: markupOf(reply.text, mentionOf(world)), objectId: space, objectClass: spaceClass },
        idOf('msg', reply.id),
        reply.at,
        who(world, reply.by).socialId
      )
      replies++
    }
    if (spec.isPinned) await client.updateDoc(chunter.class.ChatMessage, space, parent, { isPinned: true }, false, spec.at, by)
  }

  for (const channel of world.scenario.channels) {
    let space: string
    if (channel.isExisting) {
      const existing = (await client.findAll(chunter.class.Channel, {})).find((c: any) => c.name === channel.name)
      if (existing === undefined) throw new Error(`channel #${channel.name} not found`)
      space = existing._id
    } else {
      space = idOf('channel', channel.key)
      await client.createDoc(
        chunter.class.Channel,
        core.space.Space,
        {
          name: channel.name,
          description: channel.topic,
          topic: channel.topic,
          private: channel.isPrivate,
          archived: false,
          autoJoin: false,
          members: [world.admin.account],
          owners: [world.admin.account]
        },
        space
      )
    }
    for (const message of channel.messages) await post(space, chunter.class.Channel, message)
  }

  for (const direct of world.scenario.directs) {
    const other = who(world, direct.with)
    const space = idOf('dm', direct.with)
    await client.createDoc(
      chunter.class.DirectMessage,
      core.space.Space,
      { name: '', description: '', private: true, archived: false, members: [world.admin.account, other.account] },
      space
    )
    for (const message of direct.messages) await post(space, chunter.class.DirectMessage, message)
  }
  console.log(`chat: ${world.scenario.channels.length} channels, ${world.scenario.directs.length} DMs, ${messages} messages, ${replies} replies`)
  return { messages, replies, directs: world.scenario.directs.length }
}

// ---------------------------------------------------------------- calendar

const BOOKING_ATTRS = ['servoneResource', 'servoneBookingState']

// What packages/servone-ui lich/setup.ts#ensureLichAttributes declares, for the booking attributes and the resource class.
async function ensureBookingModel (client: any): Promise<void> {
  if (!client.getHierarchy().hasClass(RESOURCE_CLASS)) {
    await client.createDoc(
      core.class.Class,
      core.space.Model,
      { label: getEmbeddedLabel('Bookable resource'), kind: 0, extends: core.class.Doc, domain: 'model' },
      RESOURCE_CLASS
    )
  }
  const existing = await client.findAll(core.class.Attribute, { attributeOf: calendar.class.Event, name: { $in: BOOKING_ATTRS } })
  for (const name of BOOKING_ATTRS) {
    if (existing.some((attribute: any) => attribute.name === name)) continue
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: calendar.class.Event,
      name,
      label: getEmbeddedLabel(name === 'servoneResource' ? 'Booked resource' : 'Booking state'),
      type: { _class: core.class.TypeString, label: core.string.String },
      isCustom: true,
      hidden: true
    })
  }
}

async function seedCalendar (world: World): Promise<{ events: number, resources: number }> {
  const { client } = world.tool
  await ensureBookingModel(client)
  const resourceId = new Map<string, string>()
  for (const spec of world.scenario.resources) {
    const id = idOf('resource', spec.key)
    resourceId.set(spec.key, id)
    const resource: Record<string, unknown> = { name: spec.name, type: spec.type, needsApproval: spec.needsApproval, archived: false }
    if (spec.capacity !== undefined) resource.capacity = spec.capacity
    if (spec.approver !== undefined) resource.approver = who(world, spec.approver).person
    await client.createDoc(RESOURCE_CLASS, core.space.Model, resource, id)
  }

  for (const event of world.scenario.events) {
    const resource = event.resource === undefined ? undefined : world.scenario.resources.find((r) => r.key === event.resource)
    const base: Record<string, unknown> = {
      calendar: world.admin.calendar,
      eventId: calendarLib.generateEventId(),
      title: event.title,
      description: markupOf(event.description, () => undefined),
      date: event.start,
      dueDate: event.end,
      allDay: false,
      participants: [world.admin.person, ...event.guests.map((key) => who(world, key).person)],
      externalParticipants: event.externalGuests,
      reminders: [DEFAULT_REMINDER_MS],
      blockTime: true,
      access: calendarLib.AccessLevel.Owner,
      timeZone: VIETNAM_ZONE,
      user: world.admin.socialId
    }
    if (event.location !== undefined) base.location = event.location
    if (resource !== undefined) {
      base.servoneResource = resourceId.get(resource.key)
      base.servoneBookingState = resource.needsApproval ? 'pending' : 'confirmed'
    }
    const id = idOf('event', event.key)
    if (event.rule === undefined) {
      await client.addCollection(calendar.class.Event, calendar.space.Calendar, calendar.ids.NoAttached, calendar.class.Event, 'events', base, id)
    } else {
      await client.addCollection(
        calendar.class.ReccuringEvent,
        calendar.space.Calendar,
        calendar.ids.NoAttached,
        calendar.class.Event,
        'events',
        { ...base, rules: [event.rule], exdate: [], rdate: [], originalStartTime: event.start },
        id
      )
    }
  }
  console.log(`calendar: ${world.scenario.events.length} events, ${world.scenario.resources.length} resources`)

  let leaves = 0
  for (const leave of world.scenario.leaves) {
    const person = who(world, leave.person)
    const department = DEPARTMENTS.find((d) => d.members.includes(leave.person))
    if (department === undefined) throw new Error(`${leave.person} is in no department`)
    const tz = (day: Scenario['leaves'][number]['from']): unknown => ({ ...day, offset: VIETNAM_UTC_OFFSET_MINUTES })
    const attributes: Record<string, unknown> = {
      type: hr.ids.Vacation,
      tzDate: tz(leave.from),
      tzDueDate: tz(leave.to),
      description: markupOf(leave.note, () => undefined),
      department: idOf('dept', department.key)
    }
    // An approved leave is what the engine writes after a decision; only the approvals session may set it.
    const target = leave.state === 'approved' ? world.approvals.client : world.tool.client
    if (leave.state === 'approved') attributes.servoneApproval = 'approved'
    await target.addCollection(hr.class.Request, core.space.Workspace, person.person, contact.class.Person, 'requests', attributes, idOf('leave', leave.person))
    leaves++
  }
  console.log(`leave: ${leaves} requests`)
  return { events: world.scenario.events.length, resources: world.scenario.resources.length }
}

// ---------------------------------------------------------------- approvals

async function seedApprovals (world: World): Promise<number> {
  const tool = world.tool.client
  const { client } = world.approvals
  const rankOf = new Map<string, string | undefined>()
  let total = 0
  for (const approval of world.scenario.approvals) {
    const department = DEPARTMENTS.find((d) => d.key === approval.department)
    if (department === undefined) throw new Error(`unknown department ${approval.department}`)
    const created = await createWorkflow(tool, world.admin.account, {
      name: approval.name,
      department: idOf('dept', department.key),
      template: approval.template,
      language: 'en'
    })
    if ('error' in created) throw new Error(`workflow ${approval.name}: ${created.error}`)
    const projectId = created.project
    await tool.updateDoc(tracker.class.Project, core.space.Space, projectId, { description: MARKER })
    const project = await tool.findOne(tracker.class.Project, { _id: projectId })
    const type = await tool.findOne(task.class.ProjectType, { _id: project.type })
    const statuses = await tool.findAll(tracker.class.IssueStatus, { _id: { $in: type.statuses.map((s: any) => s._id) } })
    const statusByName = new Map<string, string>(statuses.map((s: any) => [s.name, s._id]))

    let number = 0
    for (const item of [...approval.items].sort((a, b) => a.filedAt - b.filedAt)) {
      const status = statusByName.get(item.status)
      if (status === undefined) throw new Error(`workflow ${approval.name} has no status "${item.status}"`)
      const kind = type.tasks[item.type ?? 0]
      if (kind === undefined) throw new Error(`workflow ${approval.name} has no task type ${item.type}`)
      number++
      const rank = makeRank(rankOf.get(projectId), undefined) as string
      rankOf.set(projectId, rank)
      const assignee =
        approval.key === 'hiring' ? who(world, 'minh').person : approval.key === 'helpdesk' && item.status !== 'New' ? who(world, 'khoa').person : null
      await client.addCollection(
        tracker.class.Issue,
        projectId,
        tracker.ids.NoParent,
        tracker.class.Issue,
        'subIssues',
        {
          title: item.title,
          description: null,
          assignee,
          component: null,
          number,
          status,
          priority: PRIORITY[item.priority],
          rank,
          comments: 0,
          subIssues: 0,
          startDate: null,
          dueDate: null,
          parents: [],
          remainingTime: 0,
          estimation: 0,
          reportedTime: 0,
          reports: 0,
          childInfo: [],
          identifier: `${project.identifier}-${number}`,
          kind,
          milestone: null
        },
        idOf('item', approval.key, String(number)),
        item.filedAt,
        who(world, item.by).socialId
      )
      total++
    }
    await tool.updateDoc(tracker.class.Project, core.space.Space, projectId, { sequence: number })
    console.log(`approvals: ${approval.name} (${project.identifier}), ${number} items`)
  }
  return total
}

// ---------------------------------------------------------------- drive

async function upload (world: World, datalake: string, name: string, bytes: Buffer, type: string): Promise<string> {
  const blob = generateId()
  const form = new FormData()
  form.append('file', new File([new Uint8Array(bytes)], blob, { type }))
  const response = await fetch(`${datalake}/upload/form-data/${world.tool.workspaceUuid}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${world.tool.token}` },
    body: form
  })
  if (!response.ok) throw new Error(`upload of ${name} failed: ${response.status} ${await response.text()}`)
  const [uploaded] = (await response.json()) as Array<{ id?: string, error?: string }>
  if (uploaded?.error !== undefined || uploaded?.id === undefined) throw new Error(`upload of ${name} failed: ${JSON.stringify(uploaded)}`)
  return uploaded.id
}

async function seedDrive (world: World, datalake: string): Promise<number> {
  const { client } = world.tool
  const space = idOf('drive', 'company')
  await client.createDoc(
    drive.class.Drive,
    core.space.Space,
    {
      name: DRIVE_NAME,
      description: 'Company documents',
      private: false,
      members: [world.admin.account],
      owners: [world.admin.account],
      autoJoin: true,
      archived: false,
      type: drive.spaceType.DefaultDrive
    },
    space
  )
  await client.createMixin(space, drive.class.Drive, core.space.Space, drive.mixin.DefaultDriveTypeData, {})
  let files = 0
  for (const folderSpec of DRIVE_FOLDERS) {
    const folder = await driveLib.createFolder(client, space, { title: folderSpec.name, parent: drive.ids.Root })
    for (const file of folderSpec.files) {
      const bytes = fileBytes(file)
      const type = FILE_TYPES[file.kind]
      const blob = await upload(world, datalake, file.name, bytes, type)
      await driveLib.createFile(client, space, folder, { title: file.name, file: blob, size: bytes.length, type, lastModified: Date.now() })
      files++
    }
  }
  console.log(`drive: ${DRIVE_FOLDERS.length} folders, ${files} files`)
  return files
}

// ---------------------------------------------------------------- mail

const SNIPPET_LENGTH = 140
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function mailTime (now: number, spec: MailSpec): number {
  const [hours, minutes] = spec.at.split(':').map(Number)
  const planned = vietnamDayStart(now) - spec.ago * DAY_MS + (hours * 60 + minutes) * MINUTE_MS
  return Math.min(planned, now - MINUTE_MS)
}

async function seedMail (world: World, datalake: string): Promise<number> {
  const { client } = world.tool
  await ensureMailSchema(client)
  await ensureMailApp(client)
  const space = await ensureMailbox(client, world.admin.account, ADMIN_MAIL)
  const existing = await client.findAll(MAIL_ACCOUNT_CLASS, { space })
  if (existing.some((account: any) => !isOurs(account))) throw new Error('the admin already has a real mailbox in this workspace')
  if (existing.length > 0) throw new Error('mail already seeded; run with --mail --wipe first')

  const now = Date.now()
  const accountId = idOf('mail', 'account')
  const adminAddress = `${world.admin.name} <${ADMIN_MAIL}>`
  const addressOf = (address: string): string => (address === 'admin' ? adminAddress : address)
  const folderOf = (key: MailFolderKey): Ref<MailFolderCard> => idOf('mail', 'folder', key) as Ref<MailFolderCard>
  const totals = new Map<MailFolderKey, number>()
  const unread = new Map<MailFolderKey, number>()
  const bump = (counts: Map<MailFolderKey, number>, key: MailFolderKey): number => {
    const next = (counts.get(key) ?? 0) + 1
    counts.set(key, next)
    return next
  }

  await client.createDoc(MAIL_ACCOUNT_CLASS, space, {
    ...cardBase(ADMIN_MAIL),
    mailEmail: ADMIN_MAIL,
    mailDisplayName: world.admin.name,
    mailProvider: 'gmail',
    mailAuthKind: 'password',
    mailStatus: 'ready',
    mailLastError: '',
    mailBackfillDone: 0,
    mailBackfillTotal: 0,
    mailLastSyncAt: now
  }, accountId)

  let written = 0
  for (const thread of MAIL_THREADS) {
    const threadId = idOf('mail', 'thread', thread.key)
    const references: string[] = []
    const sent: Array<{ sentAt: number, snippet: string, addresses: string[], folders: string[], isUnread: boolean, hasAttachment: boolean }> = []
    for (const [index, spec] of thread.messages.entries()) {
      const isMine = spec.from === 'admin'
      const folderKeys: MailFolderKey[] = isMine ? ['sent'] : thread.folders
      const isRead = isMine || (spec.isRead ?? true)
      const sentAt = mailTime(now, spec)
      const snippet = spec.body.join(' ').replace(/\s+/g, ' ').slice(0, SNIPPET_LENGTH)
      const html = spec.body.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('')
      const bodyBlob = await upload(world, datalake, `${thread.key}-${index}.html`, Buffer.from(html), 'text/html')
      const messageId = idOf('mail', 'message', thread.key, String(index))
      const locations = folderKeys.map((key) => encodeLocation({ uid: bump(totals, key), folder: folderOf(key) }))
      if (!isRead) for (const key of folderKeys) bump(unread, key)
      const from = addressOf(spec.from)
      const to = spec.to.map(addressOf)
      const cc = (spec.cc ?? []).map(addressOf)
      const mailMessageId = `<${messageId}@acmestudio.co>`
      await client.createDoc(MAIL_MESSAGE_CLASS, space, {
        ...cardBase(thread.subject),
        mailThread: threadId,
        mailMessageId,
        mailInReplyTo: references.at(-1) ?? '',
        mailReferences: [...references],
        mailFrom: from,
        mailTo: to,
        mailCc: cc,
        mailBcc: [],
        mailSentAt: sentAt,
        mailSnippet: snippet,
        mailIsRead: isRead,
        mailIsStarred: thread.isStarred === true && index === 0,
        mailIsDraft: false,
        mailLocations: locations,
        mailFolders: folderKeys.map(folderOf),
        mailProviderMessageId: '',
        mailBodyBlob: bodyBlob,
        mailRawBlob: '',
        mailHasAttachments: spec.attachment !== undefined,
        mailTargetFolder: null,
        mailIsDeleted: false
      }, messageId)
      if (spec.attachment !== undefined) {
        const bytes = textPdf(spec.attachment.title, spec.attachment.lines)
        const file = await upload(world, datalake, spec.attachment.name, bytes, FILE_TYPES.pdf)
        await client.addCollection(attachment.class.Attachment, space, messageId, MAIL_MESSAGE_CLASS, 'attachments', {
          name: spec.attachment.name,
          file,
          size: bytes.length,
          type: FILE_TYPES.pdf,
          lastModified: sentAt
        }, idOf('mail', 'file', thread.key, String(index)))
      }
      references.push(mailMessageId)
      sent.push({ sentAt, snippet, addresses: [from, ...to, ...cc], folders: folderKeys.map(folderOf), isUnread: !isRead, hasAttachment: spec.attachment !== undefined })
      written++
    }
    const newest = sent.reduce((latest, message) => (message.sentAt > latest.sentAt ? message : latest))
    await client.createDoc(MAIL_THREAD_CLASS, space, {
      ...cardBase(thread.subject),
      mailAccount: accountId,
      mailSubjectKey: subjectKey(thread.subject),
      mailParticipants: emailsOf(sent.flatMap((message) => message.addresses)),
      mailLastMessageAt: newest.sentAt,
      mailSnippet: newest.snippet,
      mailFolders: [...new Set(sent.flatMap((message) => message.folders))],
      mailHasUnread: sent.some((message) => message.isUnread),
      mailIsStarred: thread.isStarred === true,
      mailHasAttachments: sent.some((message) => message.hasAttachment),
      mailMessageCount: sent.length,
      mailProviderThreadId: ''
    }, threadId)
  }

  for (const folder of MAIL_FOLDERS) {
    await client.createDoc(MAIL_FOLDER_CLASS, space, {
      ...cardBase(folder.path),
      mailAccount: accountId,
      mailPath: folder.path,
      mailRole: folder.role,
      mailUidValidity: 1,
      mailHighestModSeq: '',
      mailUnread: unread.get(folder.key) ?? 0,
      mailTotal: totals.get(folder.key) ?? 0
    }, folderOf(folder.key))
  }
  console.log(`mail: ${MAIL_THREADS.length} threads, ${written} messages for ${ADMIN_MAIL}`)
  return written
}

async function wipeMail (world: World): Promise<void> {
  const { client } = world.tool
  const space = mailboxSpaceId(world.admin.account)
  const account = await client.findOne(MAIL_ACCOUNT_CLASS, { space })
  if (account !== undefined && !isOurs(account)) throw new Error('the admin has a real mailbox in this workspace; leaving it alone')
  const mailbox = await client.findOne(card.class.CardSpace, { _id: space })
  if (account === undefined && mailbox?.name !== ADMIN_MAIL) return
  let removed = 0
  for (const _class of [attachment.class.Attachment, MAIL_MESSAGE_CLASS, MAIL_THREAD_CLASS, MAIL_FOLDER_CLASS, MAIL_ACCOUNT_CLASS]) {
    for (const doc of await client.findAll(_class, { space })) {
      await client.remove(doc)
      removed++
    }
  }
  if (mailbox !== undefined) await client.remove(mailbox)
  console.log(`mail: removed ${removed} docs and the mailbox`)
}

// ---------------------------------------------------------------- verify

interface Counts {
  [what: string]: number
}

async function countSeeded (world: World): Promise<Counts> {
  const { client } = world.tool
  const projects = (await client.findAll(tracker.class.Project, {})).filter((p: any) => p.description === MARKER)
  const projectIds = projects.map((p: any) => p._id)
  const channels = (await client.findAll(chunter.class.Channel, {})).filter(isOurs)
  const directs = (await client.findAll(chunter.class.DirectMessage, {})).filter(isOurs)
  const messages = (await client.findAll(chunter.class.ChatMessage, {})).filter(isOurs)
  const threads = (await client.findAll(chunter.class.ThreadMessage, {})).filter(isOurs)
  const events = (await client.findAll(calendar.class.Event, {})).filter(isOurs)
  const drives = (await client.findAll(drive.class.Drive, {})).filter(isOurs)
  const driveIds = drives.map((d: any) => d._id)
  return {
    departments: (await client.findAll(hr.class.Department, {})).filter(isOurs).length,
    channels: channels.length,
    directMessages: directs.length,
    messages: messages.length,
    threadReplies: threads.length,
    pinned: messages.filter((m: any) => m.isPinned === true).length,
    repliesCountedOnParents: messages.reduce((sum: number, m: any) => sum + (m.replies ?? 0), 0),
    events: events.length,
    resources: (await client.findAll(RESOURCE_CLASS, {})).filter(isOurs).length,
    leaves: (await client.findAll(hr.class.Request, {})).filter(isOurs).length,
    workflowProjects: projects.length,
    workflowItems: (await client.findAll(tracker.class.Issue, { space: { $in: projectIds } })).length,
    approvalRequests: (await client.findAll(request.class.Request, {})).filter((r: any) => projectIds.includes(r.space) || events.some((e: any) => e._id === r.attachedTo) || r.attachedTo?.startsWith(ID_PREFIX)).length,
    driveFolders: (await client.findAll(drive.class.Folder, { space: { $in: driveIds } })).length,
    driveFiles: (await client.findAll(drive.class.File, { space: { $in: driveIds } })).length
  }
}

async function waitForEngine (world: World): Promise<Counts> {
  const wanted = 4 // 3 items at a gate (Offer, 2x Awaiting approval) plus the pending leave; bookings add more
  const deadline = Date.now() + ENGINE_WAIT_MS
  let counts = await countSeeded(world)
  while (counts.approvalRequests < wanted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, ENGINE_POLL_MS))
    counts = await countSeeded(world)
  }
  return counts
}

// ---------------------------------------------------------------- wipe

async function wipe (world: World): Promise<void> {
  const { client } = world.tool
  const removed: Counts = {}
  const bump = (what: string, n = 1): void => {
    removed[what] = (removed[what] ?? 0) + n
  }
  const removeAll = async (conn: Connection, docs: any[], what: string): Promise<void> => {
    for (const doc of docs) await conn.client.remove(doc)
    bump(what, docs.length)
  }

  // Approval requests first: only the approvals session may write them, and they hang off the items.
  const projects = (await client.findAll(tracker.class.Project, {})).filter((p: any) => p.description === MARKER)
  const ids = new Set<string>(projects.map((p: any) => p._id))
  const events = (await client.findAll(calendar.class.Event, {})).filter(isOurs)
  const leaves = (await client.findAll(hr.class.Request, {})).filter(isOurs)
  const ours = (r: any): boolean => ids.has(r.space) || events.some((e: any) => e._id === r.attachedTo) || leaves.some((l: any) => l._id === r.attachedTo)
  await removeAll(world.approvals, (await client.findAll(request.class.Request, {})).filter(ours), 'approval requests')

  for (const project of projects) {
    const issues = await client.findAll(tracker.class.Issue, { space: project._id })
    await removeAll(world.approvals, issues, 'workflow items')
    await client.remove(project)
    bump('workflow projects')
  }

  await removeAll(world.tool, leaves, 'leaves')
  const eventIds = new Set<string>(events.map((e: any) => e.eventId))
  const copies = (await client.findAll(calendar.class.Event, {})).filter((e: any) => eventIds.has(e.eventId) || eventIds.has(e.recurringEventId))
  await removeAll(world.tool, copies, 'events')
  await removeAll(world.tool, (await client.findAll(RESOURCE_CLASS, {})).filter(isOurs), 'resources')

  const threads = (await client.findAll(chunter.class.ThreadMessage, {})).filter(isOurs)
  await removeAll(world.tool, threads, 'thread replies')
  await removeAll(world.tool, (await client.findAll(chunter.class.ChatMessage, {})).filter(isOurs), 'messages')
  await removeAll(world.tool, (await client.findAll(chunter.class.DirectMessage, {})).filter(isOurs), 'direct messages')
  await removeAll(world.tool, (await client.findAll(chunter.class.Channel, {})).filter(isOurs), 'channels')

  for (const space of (await client.findAll(drive.class.Drive, {})).filter(isOurs)) {
    for (const file of await client.findAll(drive.class.File, { space: space._id })) {
      await removeAll(world.tool, await client.findAll(drive.class.FileVersion, { attachedTo: file._id }), 'file versions')
      await client.remove(file)
      bump('drive files')
    }
    await removeAll(world.tool, await client.findAll(drive.class.Folder, { space: space._id }), 'drive folders')
    await client.remove(space)
    bump('drives')
  }

  const departments = (await client.findAll(hr.class.Department, {})).filter(isOurs)
  const staff = await client.findAll(contact.mixin.Employee, {})
  for (const employee of staff) {
    const department = Reflect.get(employee, hr.mixin.Staff)?.department
    if (department !== undefined && departments.some((d: any) => d._id === department)) {
      await client.updateMixin(employee._id, contact.class.Person, contact.space.Contacts, hr.mixin.Staff, { department: hr.ids.Head })
    }
  }
  await removeAll(world.tool, departments, 'departments')

  for (const person of world.people.values()) {
    if (person === world.admin) continue
    await client.updateDoc(contact.class.Person, contact.space.Contacts, person.person, { $unset: { personUuid: true } })
  }
  console.log('removed', removed)
  console.log('left behind: model docs (workflow statuses, project types, the resource class and booking fields) and drive file blobs in the datalake')
}

// ---------------------------------------------------------------- main

async function main (): Promise<void> {
  const args = readArgs()
  if (args.workspace === '') throw new Error('--workspace is required')
  if (args.workspace !== DEMO_WORKSPACE && !args.isKnown) {
    throw new Error(`refusing to run on "${args.workspace}": this seed is for the demo workspace "${DEMO_WORKSPACE}" only`)
  }
  if (args.dryRun && args.wipe) throw new Error('--dry-run cannot preview --wipe; run --wipe alone')

  const scenario = buildScenario(Date.now())
  if (args.dryRun) {
    const count = (list: Array<{ messages: unknown[] }>): number => list.reduce((sum, c) => sum + c.messages.length, 0)
    console.log(
      `would write ${DEPARTMENTS.length} departments, ${scenario.channels.length} channels (${count(scenario.channels)} messages, ${scenario.channels.flatMap((c) => c.messages).reduce((n, m) => n + m.replies.length, 0)} thread replies),`,
      `${scenario.directs.length} DMs (${count(scenario.directs)} messages), ${scenario.events.length} events, ${scenario.resources.length} resources,`,
      `${scenario.leaves.length} leave requests, ${scenario.approvals.length} approval workflows (${scenario.approvals.reduce((n, a) => n + a.items.length, 0)} items),`,
      `a drive with ${DRIVE_FOLDERS.length} folders and ${DRIVE_FOLDERS.reduce((n, f) => n + f.files.length, 0)} files,`,
      `a mailbox with ${MAIL_THREADS.length} threads (${MAIL_THREADS.reduce((n, t) => n + t.messages.length, 0)} messages) in workspace "${args.workspace}"`
    )
    return
  }

  const tool = await connectAs(args, TOOL_SERVICE)
  const approvals = await connectAs(args, APPROVALS_SERVICE)
  try {
    const { people, admin } = await resolvePeople(tool.client)
    const world: World = { tool, approvals, people, admin, scenario }
    if (args.isMailOnly) {
      if (args.wipe) await wipeMail(world)
      else await seedMail(world, args.datalake)
      return
    }
    if (args.wipe) {
      await wipeMail(world)
      await wipe(world)
      return
    }
    if (await alreadySeeded(tool.client)) throw new Error('already seeded; run with --wipe first')
    await seedDepartments(world)
    await seedChat(world)
    await seedCalendar(world)
    await seedApprovals(world)
    await seedDrive(world, args.datalake)
    await seedMail(world, args.datalake)
    console.log('waiting for the approval engine...')
    console.log('counts', await waitForEngine(world))
  } finally {
    await approvals.close()
    await tool.close()
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err)
    process.exit(1)
  }
)
