import type { RestClient } from '@hcengineering/api-client'
import chunter, { type Channel, type ChatMessage, type DirectMessage } from '@hcengineering/chunter'
import contact, { formatName, type Employee, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Doc,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  SortingOrder,
  TxFactory,
  type WorkspaceInfoWithStatus
} from '@hcengineering/core'
import notification, {
  notificationId,
  type DocNotifyContext,
  type PushData,
  type PushSubscription
} from '@hcengineering/notification'
import { markupToText } from '@hcengineering/text-core'
import { workbenchId } from '@hcengineering/workbench'
import { readPause } from '@servone/notify-rules'

import config from '../config'
import { runHelpdesk } from '../helpdesk'
import {
  digestSince,
  groupConversations,
  inboxUrl,
  isDigestDue,
  notificationUrl,
  type DigestEntry,
  type Presence
} from './digest'
import { renderDigest } from './email/render'
import { digestStrings } from './email/templates'
import { readPrefs, type SchedulerSetting, type UserPrefs } from './settings'
import { planSummary, summaryBody } from './summary'
import { signUnsubscribeToken } from './token'
import { countUnread, selectUnread, type UnreadItem, type UnreadNotification } from './unread'
import { findRecipient, getWorkspaceClient, listActiveWorkspaces } from '../workspaces'

const txFactory = new TxFactory(core.account.System)
const PUSH = notification.providers.PushNotificationProvider
// Upper bound per query; a digest or summary never needs more rows than a person can read.
const MAX_UNREAD_ROWS = 500

interface ScheduledUser {
  account: AccountUuid
  person: Ref<Person>
  setting: SchedulerSetting
  prefs: UserPrefs
}

interface UnreadSet {
  items: UnreadItem[]
  directMessages: DirectMessage[]
}

async function findScheduledUsers (client: RestClient): Promise<ScheduledUser[]> {
  const settings: SchedulerSetting[] = await client.findAll(notification.class.NotificationProviderSetting, {
    attachedTo: PUSH
  })
  const planned = settings.flatMap((setting) => {
    const prefs = readPrefs(setting)
    return prefs === undefined ? [] : [{ setting, prefs }]
  })
  if (planned.length === 0) return []

  const identities = await client.findAll(contact.class.SocialIdentity, {
    _id: {
      $in: planned.map(({ setting }) => setting.createdBy).filter((id) => id !== undefined) as SocialIdentityRef[]
    }
  })
  const personBySocialId = new Map<PersonId, Ref<Person>>(
    identities.map((identity) => [identity._id, identity.attachedTo])
  )
  const employees = await client.findAll(contact.mixin.Employee, {
    _id: { $in: identities.map((identity) => identity.attachedTo) as Array<Ref<Employee>> },
    active: true
  })
  const accountByPerson = new Map<Ref<Person>, AccountUuid | undefined>(
    employees.map((employee) => [employee._id, employee.personUuid])
  )

  // A user with several social ids can own several Push settings; the newest one is what the settings page shows.
  const byAccount = new Map<AccountUuid, ScheduledUser>()
  for (const { setting, prefs } of planned) {
    const person = setting.createdBy === undefined ? undefined : personBySocialId.get(setting.createdBy)
    const account = person === undefined ? undefined : accountByPerson.get(person)
    if (person === undefined || account === undefined) continue
    const existing = byAccount.get(account)
    if (existing !== undefined && existing.setting.modifiedOn >= setting.modifiedOn) continue
    byAccount.set(account, { account, person, setting, prefs })
  }
  return [...byAccount.values()]
}

async function loadUnread (client: RestClient, user: AccountUuid, since: number): Promise<UnreadSet> {
  const notifications: UnreadNotification[] = await client.findAll(
    notification.class.InboxNotification,
    { user, isViewed: false, archived: false, createdOn: { $gte: since } },
    { sort: { createdOn: SortingOrder.Descending }, limit: MAX_UNREAD_ROWS }
  )
  if (notifications.length === 0) return { items: [], directMessages: [] }
  const contexts = await client.findAll(notification.class.DocNotifyContext, {
    _id: { $in: [...new Set(notifications.map((row) => row.docNotifyContext))] }
  })
  const candidates = new Set<Ref<Doc>>(contexts.flatMap((context) => [context.objectId, context.objectSpace]))
  const directMessages = await client.findAll(chunter.class.DirectMessage, {
    _id: { $in: [...candidates] as Array<Ref<DirectMessage>> }
  })
  const items = selectUnread(
    notifications,
    new Map(contexts.map((context) => [context._id, context])),
    new Set(directMessages.map((direct) => direct._id))
  )
  return { items, directMessages }
}

async function updateSetting (
  client: RestClient,
  setting: SchedulerSetting,
  operations: Partial<Pick<SchedulerSetting, 'servoneHeldSince' | 'servoneSummarySentAt' | 'servoneDigestSentAt'>>
): Promise<void> {
  await client.tx(
    txFactory.createTxUpdateDoc<SchedulerSetting>(
      notification.class.NotificationProviderSetting,
      setting.space,
      setting._id,
      operations
    )
  )
}

// Stock sends MAIL_AUTH_TOKEN to both the mail and the web push service (server-notification metadata).
function jsonHeaders (): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.scheduler.MailAuthToken !== undefined) headers.Authorization = `Bearer ${config.scheduler.MailAuthToken}`
  return headers
}

interface WebPushResponse {
  result: Array<Ref<PushSubscription>>
}

function parseWebPushResponse (body: unknown): WebPushResponse {
  if (typeof body !== 'object' || body === null || !('result' in body) || !Array.isArray(body.result)) {
    return { result: [] }
  }
  return { result: body.result.filter((id): id is Ref<PushSubscription> => typeof id === 'string') }
}

// Same contract as stock sendPushToSubscription; the response lists subscriptions the browser vendor rejected.
async function sendWebPush (
  ctx: MeasureContext,
  client: RestClient,
  webPushUrl: string,
  subscriptions: PushSubscription[],
  data: PushData
): Promise<void> {
  const response = await fetch(`${webPushUrl}/web-push`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ subscriptions, data })
  })
  if (!response.ok) {
    ctx.warn('web push failed', { status: response.status })
    return
  }
  const { result: expired } = parseWebPushResponse(await response.json())
  for (const subscription of subscriptions.filter((it) => expired.includes(it._id))) {
    await client.tx(
      txFactory.createTxRemoveDoc(notification.class.PushSubscription, subscription.space, subscription._id)
    )
  }
}

async function sendSummary (
  ctx: MeasureContext,
  client: RestClient,
  workspace: WorkspaceInfoWithStatus,
  user: ScheduledUser,
  since: number
): Promise<void> {
  const { items } = await loadUnread(client, user.account, since)
  const counts = countUnread(items)
  if (counts.mentions + counts.directs === 0) return
  const title = workspace.name
  const body = summaryBody(counts, user.prefs.locale)
  const tag = generateId()
  ctx.info('start-of-day summary', { workspace: workspace.uuid, user: user.account, ...counts })
  // The user's PersonSpace, where their inbox rows already live.
  const space = items[0].notification.space
  await client.tx(
    txFactory.createTxCreateDoc(notification.class.BrowserNotification, space, {
      user: user.account,
      title,
      body,
      tag,
      objectId: user.setting._id,
      objectClass: user.setting._class,
      onClickLocation: { path: [workbenchId, workspace.url, notificationId] },
      soundAlert: false
    })
  )
  const subscriptions = await client.findAll(notification.class.PushSubscription, { user: user.account })
  if (subscriptions.length === 0) return
  await sendWebPush(ctx, client, config.scheduler.WebPushUrl, subscriptions, {
    title,
    body,
    tag,
    domain: `${config.FrontUrl}/${workbenchId}/${workspace.url}`,
    url: inboxUrl(config.FrontUrl, workspace.url)
  })
}

async function namesBySocialId (client: RestClient, socialIds: PersonId[]): Promise<Map<PersonId, string>> {
  if (socialIds.length === 0) return new Map()
  const identities = await client.findAll(contact.class.SocialIdentity, {
    _id: { $in: socialIds as SocialIdentityRef[] }
  })
  const persons = await client.findAll(contact.class.Person, {
    _id: { $in: identities.map((identity) => identity.attachedTo) }
  })
  const nameByPerson = new Map(persons.map((person) => [person._id, formatName(person.name)]))
  const names = new Map<PersonId, string>()
  for (const identity of identities) {
    const name = nameByPerson.get(identity.attachedTo)
    if (name !== undefined) names.set(identity._id, name)
  }
  return names
}

async function conversationTitles (
  client: RestClient,
  user: AccountUuid,
  contexts: DocNotifyContext[],
  directMessages: DirectMessage[],
  locale: UserPrefs['locale']
): Promise<Map<Ref<DocNotifyContext>, string>> {
  const strings = digestStrings[locale]
  const directIds = new Set<Ref<Doc>>(directMessages.map((direct) => direct._id))
  // A thread's context is its parent message; the conversation it belongs to is the message's space.
  const conversationOf = (context: DocNotifyContext): Ref<Doc> =>
    context.objectClass === chunter.class.Channel || directIds.has(context.objectId)
      ? context.objectId
      : context.objectSpace
  const channels = await client.findAll(chunter.class.Channel, {
    _id: { $in: contexts.map(conversationOf).filter((id) => !directIds.has(id)) as Array<Ref<Channel>> }
  })
  const channelNames = new Map<Ref<Doc>, string>(channels.map((channel) => [channel._id, `#${channel.name}`]))
  const memberAccounts = [...new Set(directMessages.flatMap((direct) => direct.members))].filter((it) => it !== user)
  const members = await client.findAll(contact.mixin.Employee, { personUuid: { $in: memberAccounts } })
  const memberNames = new Map(members.map((member) => [member.personUuid, formatName(member.name)]))
  const directNames = new Map<Ref<Doc>, string>(
    directMessages.map((direct) => [
      direct._id,
      direct.members
        .filter((member) => member !== user)
        .map((member) => memberNames.get(member))
        .filter((name): name is string => name !== undefined)
        .join(', ')
    ])
  )

  const titles = new Map<Ref<DocNotifyContext>, string>()
  for (const context of contexts) {
    const conversation = conversationOf(context)
    const name = channelNames.get(conversation) ?? directNames.get(conversation)
    if (name === undefined || name === '') titles.set(context._id, strings.conversation)
    else titles.set(context._id, conversation === context.objectId ? name : strings.thread(name))
  }
  return titles
}

type DigestOutcome = 'sent' | 'empty' | 'no-recipient'

async function sendDigest (
  ctx: MeasureContext,
  client: RestClient,
  workspace: WorkspaceInfoWithStatus,
  user: ScheduledUser,
  now: number
): Promise<DigestOutcome> {
  const { items, directMessages } = await loadUnread(client, user.account, digestSince(user.prefs, now))
  if (items.length === 0) return 'empty'
  const recipient = await findRecipient(client, user.person)
  if (recipient === undefined) {
    ctx.warn('no verified email for digest', { workspace: workspace.uuid, user: user.account })
    return 'no-recipient'
  }

  const messageIds = items.map((item) => item.message).filter((id): id is Ref<Doc> => id !== undefined)
  const messages = await client.findAll(chunter.class.ChatMessage, {
    _id: { $in: messageIds as Array<Ref<ChatMessage>> }
  })
  const messageById = new Map<Ref<Doc>, ChatMessage>(messages.map((message) => [message._id, message]))
  const senderIds = items
    .map((item) => {
      const message = item.message === undefined ? undefined : messageById.get(item.message)
      return message?.createdBy ?? item.notification.createdBy
    })
    .filter((id): id is PersonId => id !== undefined)
  const senders = await namesBySocialId(client, [...new Set(senderIds)])
  const contexts = items
    .map((item) => item.context)
    .filter((context): context is DocNotifyContext => context !== undefined)
  const titles = await conversationTitles(client, user.account, contexts, directMessages, user.prefs.locale)

  const entries: DigestEntry[] = items.map((item) => {
    const row = item.notification
    const message = item.message === undefined ? undefined : messageById.get(item.message)
    const markup = message?.message ?? row.messageHtml
    const senderId = message?.createdBy ?? row.createdBy
    return {
      context: row.docNotifyContext,
      objectId: row.objectId,
      objectClass: row.objectClass,
      title: titles.get(row.docNotifyContext) ?? digestStrings[user.prefs.locale].conversation,
      sender: (senderId === undefined ? undefined : senders.get(senderId)) ?? '',
      text: markup === undefined ? '' : markupToText(markup),
      createdOn: row.createdOn ?? row.modifiedOn
    }
  })
  const token = signUnsubscribeToken({ user: user.account, workspace: workspace.uuid }, config.Secret)
  const unsubscribeUrl = `${config.PublicUrl}/unsubscribe?token=${encodeURIComponent(token)}`
  const email = renderDigest({
    locale: user.prefs.locale,
    workspaceName: workspace.name,
    total: items.length,
    conversations: groupConversations(entries).map((conversation) => ({
      ...conversation,
      url: notificationUrl(config.FrontUrl, workspace.url, conversation.objectId, conversation.objectClass)
    })),
    inboxUrl: inboxUrl(config.FrontUrl, workspace.url),
    unsubscribeUrl
  })

  const response = await fetch(`${config.scheduler.MailUrl}/send`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      to: [recipient],
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    })
  })
  if (!response.ok) throw new Error(`Mail service answered ${response.status} ${response.statusText}`)
  ctx.info('email digest sent', { workspace: workspace.uuid, user: user.account, count: items.length })
  return 'sent'
}

async function processWorkspace (ctx: MeasureContext, workspace: WorkspaceInfoWithStatus, now: number): Promise<void> {
  const client = await getWorkspaceClient(config.scheduler.ServiceId, workspace.uuid)
  const users = await findScheduledUsers(client)
  if (users.length === 0) return
  const accounts = users.map((user) => user.account)
  const statuses = await client.findAll(contact.class.WorkspaceMemberStatus, { user: { $in: accounts } })
  const pausedUntil = new Map(statuses.map((status) => [status.user, readPause(status)?.until]))
  const presences = await client.findAll(core.class.UserStatus, { user: { $in: accounts } })
  const presenceByUser = new Map<AccountUuid, Presence>(
    presences.map((presence) => [presence.user, { online: presence.online, modifiedOn: presence.modifiedOn }])
  )

  for (const user of users) {
    const paused = pausedUntil.get(user.account)
    const step = planSummary(user.prefs, now, paused)
    if (step.kind === 'hold') {
      await updateSetting(client, user.setting, { servoneHeldSince: now })
    } else if (step.kind === 'send') {
      // Recorded first: a failed web push must not repeat the in-app summary every minute.
      await updateSetting(client, user.setting, { servoneSummarySentAt: now })
      await sendSummary(ctx, client, workspace, user, step.since)
    }

    if (!isDigestDue(user.prefs, presenceByUser.get(user.account), now, paused)) continue
    const outcome = await sendDigest(ctx, client, workspace, user, now)
    // An empty check is not recorded: a mention later in the same offline stretch still gets its digest.
    if (outcome !== 'empty') await updateSetting(client, user.setting, { servoneDigestSentAt: now })
  }
}

// One failing workspace (asleep, migrating) must not hold back digests or helpdesk ticks for the rest.
export async function runTick (ctx: MeasureContext, now: number): Promise<void> {
  const workspaces = await listActiveWorkspaces(config.scheduler.ServiceId, now)
  for (const workspace of workspaces) {
    try {
      await processWorkspace(ctx, workspace, now)
    } catch (error) {
      ctx.error('scheduler tick failed', { workspace: workspace.uuid, error })
    }
    try {
      await runHelpdesk(await getWorkspaceClient(config.scheduler.ServiceId, workspace.uuid), now)
    } catch (error) {
      ctx.error('helpdesk tick failed', { workspace: workspace.uuid, error })
    }
  }
}
