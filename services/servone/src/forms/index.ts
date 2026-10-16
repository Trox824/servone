// Public tracker forms: a secret URL per form template files issues as the "Servone Forms" bot.
import { createRestClient, createRestTxOperations, type RestClient } from '@hcengineering/api-client'
import { getClient as getCollaboratorClient } from '@hcengineering/collaborator-client'
import {
  AccountRole,
  type MeasureContext,
  roleOrder,
  systemAccountUuid,
  TxOperations,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'
import tracker from '@hcengineering/tracker'
import { ensureFormAttributes, formTemplateClass, templateForm } from '@servone/forms'

import config from '../config'
import type { RequestHandler } from '../router'
import { authenticate } from '../webhooks/auth'
import { type BotIdentity, ensureBotEmployee, FORMS_BOT, loadBotIdentity } from '../webhooks/bot'
import { TokenBuckets } from '../webhooks/rate'
import { createFormsHandler } from './server'
import { FormLinkStore, KVS_NAMESPACE } from './store'
import { fileIssueFromForm, type FormSession } from './submit'

// Custom attributes added to issues after a session opened only show up in its model once it is reopened.
const SESSION_TTL_MS = 10 * 60_000
const VIEW_BURST = 30
const VIEW_REFILL_PER_SECOND = 1
const SUBMIT_BURST = 10
const SUBMIT_REFILL_PER_SECOND = 0.2

interface CachedSession {
  session: Promise<FormSession>
  openedAt: number
}

export function createForms (ctx: MeasureContext): RequestHandler {
  const serviceId = config.forms.ServiceId
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: serviceId })
  const store = new FormLinkStore(getKvsClient(KVS_NAMESPACE, config.KvsUrl, kvsToken))

  let bot: Promise<BotIdentity> | undefined
  const botIdentity = async (): Promise<BotIdentity> => {
    bot ??= loadBotIdentity(serviceId, FORMS_BOT)
    try {
      return await bot
    } catch (error) {
      bot = undefined
      throw error
    }
  }

  const systemToken = (workspace: WorkspaceUuid): string => generateToken(systemAccountUuid, workspace, { service: serviceId })

  // Reads need no model, so page views and access checks share one light client per workspace.
  const readers = new Map<WorkspaceUuid, Promise<RestClient>>()
  async function reader (workspace: WorkspaceUuid): Promise<RestClient> {
    let pending = readers.get(workspace)
    if (pending === undefined) {
      pending = getTransactorEndpoint(systemToken(workspace)).then((endpoint) =>
        createRestClient(endpoint, workspace, systemToken(workspace))
      )
      readers.set(workspace, pending)
    }
    try {
      return await pending
    } catch (error) {
      readers.delete(workspace)
      throw error
    }
  }

  async function openSession (workspace: WorkspaceUuid): Promise<FormSession> {
    const token = systemToken(workspace)
    const endpoint = await getTransactorEndpoint(token)
    const system = await createRestTxOperations(endpoint, workspace, token, true)
    const identity = await botIdentity()
    await ensureBotEmployee(ctx, await reader(workspace), identity, serviceId)
    await ensureFormAttributes(system)
    return {
      bot: new TxOperations(system.client, identity.primarySocialId),
      system,
      collaborator: getCollaboratorClient(workspace, token, config.mcp.CollaboratorUrl)
    }
  }

  const sessions = new Map<WorkspaceUuid, CachedSession>()
  async function session (workspace: WorkspaceUuid): Promise<FormSession> {
    const cached = sessions.get(workspace)
    if (cached !== undefined && Date.now() - cached.openedAt < SESSION_TTL_MS) return await cached.session
    const entry: CachedSession = { session: openSession(workspace), openedAt: Date.now() }
    sessions.set(workspace, entry)
    try {
      return await entry.session
    } catch (error) {
      if (sessions.get(workspace) === entry) sessions.delete(workspace)
      throw error
    }
  }

  return createFormsHandler({
    store,
    viewBuckets: new TokenBuckets(VIEW_BURST, VIEW_REFILL_PER_SECOND),
    submitBuckets: new TokenBuckets(SUBMIT_BURST, SUBMIT_REFILL_PER_SECOND),
    publicUrl: config.PublicUrl,
    frontUrl: config.FrontUrl,
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    templateAccess: async (caller, templateId) => {
      const client = await reader(caller.workspace)
      const template = await client.findOne(formTemplateClass, { _id: templateId })
      if (template === undefined) return undefined
      const project = await client.findOne(tracker.class.Project, { _id: template.space })
      const isMember = project?.members.includes(caller.account) ?? false
      const isMaintainer = roleOrder[caller.role] >= roleOrder[AccountRole.Maintainer]
      const isGuest = roleOrder[caller.role] < roleOrder[AccountRole.User]
      return { canManage: !isGuest && (isMember || isMaintainer), isForm: templateForm(template) !== undefined }
    },
    loadForm: async (workspace, templateId) => {
      const template = await (await reader(workspace)).findOne(formTemplateClass, { _id: templateId })
      const definition = template === undefined ? undefined : templateForm(template)
      return template === undefined || definition === undefined ? undefined : { title: template.title, definition }
    },
    submit: async (link, answers) => {
      const formSession = await session(link.workspace)
      const template = await formSession.bot.findOne(formTemplateClass, { _id: link.template })
      if (template === undefined) throw new Error(`Template ${link.template} is gone`)
      return await fileIssueFromForm(formSession, template, answers)
    },
    report: (event, fields) => {
      ctx.info(event, fields)
    }
  })
}
