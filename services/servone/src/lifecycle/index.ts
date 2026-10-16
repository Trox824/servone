import contact, { formatName, type Employee } from '@hcengineering/contact'
import { type AccountUuid, type MeasureContext, type Ref, SocialIdType, systemAccountUuid, type WorkspaceInfoWithStatus } from '@hcengineering/core'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { getAccountClient } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'
import tracker from '@hcengineering/tracker'

import config from '../config'
import type { RequestHandler } from '../router'
import { resolveLanguage } from '../starter/content'
import { authenticate } from '../webhooks/auth'
import { findRecipient, getWorkspaceClient, listActiveWorkspaces } from '../workspaces'
import { createInviteRecordHandler } from './http'
import { IMPORT_TASK_THRESHOLD, POLL_INTERVAL_MS, type LifecycleMail, WINDOW_MS } from './plan'
import { type LifecycleDeps, runWorkspace, type WorkspaceFacts } from './run'
import { KVS_NAMESPACE, LifecycleStore } from './store'

const EMAIL_IDENTITY_TYPES = [SocialIdType.EMAIL, SocialIdType.GOOGLE]

async function sendMail (mail: LifecycleMail): Promise<boolean> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.scheduler.MailAuthToken !== undefined) headers.Authorization = `Bearer ${config.scheduler.MailAuthToken}`
  const response = await fetch(`${config.scheduler.MailUrl}/send`, { method: 'POST', headers, body: JSON.stringify(mail) })
  return response.ok
}

async function factsFor (workspace: WorkspaceInfoWithStatus, createdBy: AccountUuid): Promise<WorkspaceFacts> {
  const { ServiceId } = config.lifecycle
  const accounts = getAccountClient(generateToken(systemAccountUuid, workspace.uuid, { service: ServiceId }))
  const client = await getWorkspaceClient(ServiceId, workspace.uuid)
  return {
    hasTeammate: async () => (await accounts.getWorkspaceMembers()).some((member) => !member.disabled && member.person !== createdBy),
    outsideTaskCount: async () => (await client.findAll(tracker.class.Issue, { space: { $ne: tracker.project.DefaultProject } }, { limit: IMPORT_TASK_THRESHOLD })).length,
    hasJoined: async (email) => {
      const identities = await client.findAll(contact.class.SocialIdentity, { value: email, type: { $in: EMAIL_IDENTITY_TYPES }, isDeleted: { $ne: true } }, { limit: 1 })
      if (identities.length === 0) return false
      const employees = await client.findAll(contact.mixin.Employee, { _id: identities[0].attachedTo as Ref<Employee>, active: true }, { limit: 1 })
      return employees.length > 0
    },
    creator: async () => {
      const person = await client.findOne(contact.class.Person, { personUuid: createdBy })
      const locale = await accounts.getAccountLocale({ account: createdBy }).catch(() => null)
      const name = person === undefined ? '' : formatName(person.name)
      return {
        email: person === undefined ? undefined : await findRecipient(client, person._id),
        firstName: name === '' ? workspace.name : name.split(' ')[0],
        language: resolveLanguage(locale, workspace.name, person?.name ?? '')
      }
    }
  }
}

function createStore (): LifecycleStore {
  const token = generateToken(systemAccountUuid, undefined, { service: config.lifecycle.ServiceId })
  return new LifecycleStore(getKvsClient(KVS_NAMESPACE, config.KvsUrl, token))
}

export function startLifecycle (ctx: MeasureContext): () => void {
  const store = createStore()
  const deps: LifecycleDeps = { store, sendMail, frontUrl: config.FrontUrl, founderEmail: config.bugReport.To }
  let isTicking = false

  const tick = async (): Promise<void> => {
    const now = Date.now()
    const since = await store.enabledSince(now)
    const workspaces = await listActiveWorkspaces(config.lifecycle.ServiceId, now)
    for (const workspace of workspaces) {
      const { createdBy } = workspace
      if (createdBy === undefined || workspace.createdOn < since || now - workspace.createdOn >= WINDOW_MS) continue
      try {
        const sentCount = await runWorkspace(deps, workspace, await factsFor(workspace, createdBy as AccountUuid), now)
        if (sentCount > 0) ctx.info('lifecycle email sent', { workspace: workspace.uuid, count: sentCount })
      } catch (error) {
        ctx.error('lifecycle tick failed', { workspace: workspace.uuid, error })
      }
    }
  }

  const timer = setInterval(() => {
    if (isTicking) return
    isTicking = true
    tick()
      .catch((error) => { ctx.error('lifecycle tick failed', { error }) })
      .finally(() => { isTicking = false })
  }, POLL_INTERVAL_MS)
  return () => { clearInterval(timer) }
}

export function createInviteRecords (): RequestHandler {
  const store = createStore()
  return createInviteRecordHandler({
    frontUrl: config.FrontUrl,
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    recordInvite: async (workspace, email, at) => { await store.recordInvite(workspace, email, at) }
  })
}
