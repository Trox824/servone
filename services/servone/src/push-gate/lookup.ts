import { createRestClient, type RestClient } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import { isActiveMode, systemAccountUuid, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import notification, { type InboxNotification } from '@hcengineering/notification'
import { getAccountClient, getTransactorEndpoint } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import type { GateFacts } from './gate'

const WORKSPACE_LIST_TTL_MS = 10 * 60_000
// A push for a workspace created after the last listing forces a refresh, at most this often.
const WORKSPACE_MISS_REFRESH_MS = 60_000

let listedAt = 0
let workspaceByUrl = new Map<string, WorkspaceUuid>()
const clients = new Map<WorkspaceUuid, RestClient>()

async function listWorkspaces (now: number): Promise<void> {
  // The account service lets only admin or tool/backup tokens list every workspace.
  const token = generateToken(systemAccountUuid, undefined, { service: config.pushGate.ServiceId, admin: 'true' })
  const workspaces = await getAccountClient(token).listWorkspaces()
  workspaceByUrl = new Map(
    workspaces.filter((workspace) => isActiveMode(workspace.mode)).map((workspace) => [workspace.url, workspace.uuid])
  )
  listedAt = now
}

export async function findWorkspace (url: string, now: number): Promise<WorkspaceUuid | undefined> {
  const age = now - listedAt
  if (age > WORKSPACE_LIST_TTL_MS || (!workspaceByUrl.has(url) && age > WORKSPACE_MISS_REFRESH_MS)) {
    await listWorkspaces(now)
  }
  return workspaceByUrl.get(url)
}

async function getWorkspaceClient (workspace: WorkspaceUuid): Promise<RestClient> {
  const cached = clients.get(workspace)
  if (cached !== undefined) return cached
  const token = generateToken(systemAccountUuid, workspace, { service: config.pushGate.ServiceId })
  const endpoint = await getTransactorEndpoint(token)
  const client = createRestClient(endpoint, workspace, token)
  clients.set(workspace, client)
  return client
}

// Undefined when the inbox notification is gone (read and deleted, or the workspace was reset).
export async function loadFacts (workspace: WorkspaceUuid, inboxNotificationId: string): Promise<GateFacts | undefined> {
  const client = await getWorkspaceClient(workspace)
  const inboxNotification = await client.findOne(notification.class.InboxNotification, {
    _id: inboxNotificationId as Ref<InboxNotification>
  })
  if (inboxNotification === undefined) return undefined
  const [context, status, person] = await Promise.all([
    client.findOne(notification.class.DocNotifyContext, { _id: inboxNotification.docNotifyContext }),
    client.findOne(contact.class.WorkspaceMemberStatus, { user: inboxNotification.user }),
    client.findOne(contact.class.Person, { personUuid: inboxNotification.user })
  ])
  if (person === undefined) return { inboxNotification, context, status, pushSetting: undefined }
  const socialIds = await client.findAll(contact.class.SocialIdentity, { attachedTo: person._id })
  // The front writes the first of the user's Push settings; a user normally has one.
  const pushSetting = await client.findOne(notification.class.NotificationProviderSetting, {
    attachedTo: notification.providers.PushNotificationProvider,
    createdBy: { $in: socialIds.map((socialId) => socialId._id) }
  })
  return { inboxNotification, context, status, pushSetting }
}
