// Sends tracker issue events to outside HTTPS receivers, signed, with retries. Reads the transactor's `tx` topic
// under its own consumer group, so it never shares offsets with dept-channels.
import { type MeasureContext, systemAccountUuid, type Tx, type WorkspaceUuid } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import tracker from '@hcengineering/tracker'
import { randomBytes } from 'crypto'

import config from '../config'
import { disabledEmailRecipients, sendEmail } from '../outgoing/notify'
import { postJson, publicTransport } from '../outgoing/send'
import { signatureHeaders } from '../outgoing/sign'
import { watchConsumer } from '../queue-watchdog'
import type { RequestHandler } from '../router'
import { parseSealKeys, seal, unseal } from '../seal'
import { authenticate } from '../webhooks/auth'
import { TokenBuckets } from '../webhooks/rate'
import { findWorkspace, getWorkspaceClient } from '../workspaces'
import { deliveryIdFor, Dispatcher } from './dispatcher'
import { pickEvent, readIssueChange } from './events'
import { disabledEmail } from './notify'
import { buildPayload, testChange } from './payload'
import { resolveChange, restReader } from './resolve'
import { createNotConfiguredHandler, createRequestHandler } from './server'
import { KVS_NAMESPACE, type StoredTrackerHook, TrackerHookStore } from './store'

// Catches a change another replica or a lost reload missed; management writes update the map at once.
const HOOK_RELOAD_MS = 5 * 60_000
const TEST_BURST = 3
const TEST_REFILL_PER_SECOND = 1 / 10
const TEST_DELIVERY_ID_BYTES = 16

export interface TrackerHooks {
  handler: RequestHandler
  stop: () => Promise<void>
}

// Binds a sealed secret to its hook, so a secret copied onto another hook does not open.
const secretAad = (workspace: WorkspaceUuid, hookId: string): string => `${workspace}:${hookId}`

export function createTrackerHooks (ctx: MeasureContext): TrackerHooks {
  const { ServiceId, QueueRegion, SealKeys: sealKeysText } = config.trackerHooks
  if (sealKeysText === undefined) {
    ctx.info('tracker hooks off: TRACKER_HOOKS_KEYS is unset')
    return { handler: createNotConfiguredHandler(config.FrontUrl), stop: async () => {} }
  }
  const keys = parseSealKeys(sealKeysText, 'TRACKER_HOOKS_KEYS')
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: ServiceId })
  const store = new TrackerHookStore(getKvsClient(KVS_NAMESPACE, config.KvsUrl, kvsToken))
  const report = (event: string, fields: Record<string, string | number>): void => {
    ctx.info(event, fields)
  }

  const enabledHooks = new Map<string, StoredTrackerHook>()
  async function reloadHooks (): Promise<void> {
    const hooks = await store.listAllHooks()
    enabledHooks.clear()
    for (const hook of hooks) if (hook.disabledOn === undefined) enabledHooks.set(hook.id, hook)
  }
  let firstLoad: Promise<void> | undefined
  async function hooksLoaded (): Promise<void> {
    firstLoad ??= reloadHooks()
    try {
      await firstLoad
    } catch (error) {
      firstLoad = undefined
      throw error
    }
  }
  const reloadTimer = setInterval(() => {
    reloadHooks().catch((error: Error) => {
      report('tracker hooks reload failed', { error: error.message })
    })
  }, HOOK_RELOAD_MS)

  const dispatcher = new Dispatcher({
    store,
    send: async (hook, delivery) => {
      const secret = unseal(keys, secretAad(hook.workspace, hook.id), hook.sealedSecret)
      const headers = {
        'Servone-Event': delivery.event,
        'Servone-Delivery': delivery.id,
        ...signatureHeaders(secret, delivery.body, Date.now())
      }
      return await postJson(hook.url, headers, delivery.body, publicTransport)
    },
    notifyDisabled: async (hook, last) => {
      const client = await getWorkspaceClient(ServiceId, hook.workspace)
      const project = await client.findOne(tracker.class.Project, { _id: hook.project })
      const workspace = await findWorkspace(ServiceId, hook.workspace)
      const page = `${config.FrontUrl}/workbench/${workspace?.url ?? hook.workspace}/tracker/${hook.project}/more?tab=webhooks`
      const to = await disabledEmailRecipients(client, project?.owners ?? [], hook.createdBy)
      if (to.length === 0) {
        report('turned-off hook has no one to mail', { hook: hook.id, workspace: hook.workspace })
        return
      }
      const mail = { url: config.scheduler.MailUrl, authToken: config.scheduler.MailAuthToken }
      await sendEmail(mail, to, disabledEmail(hook, last, project?.identifier ?? '', page))
    },
    onHookChanged: (id, hook) => {
      if (hook === undefined || hook.disabledOn !== undefined) enabledHooks.delete(id)
      else enabledHooks.set(id, hook)
    },
    now: Date.now,
    report
  })

  // Returns once every delivery is in KVS; a throw makes the queue retry the tx, so nothing is lost.
  async function onTx (workspace: WorkspaceUuid, tx: Tx): Promise<void> {
    const change = readIssueChange(tx)
    if (change === undefined) return
    await hooksLoaded()
    const rawFields = change.kind === 'updated' ? change.fields : []
    const hooks = [...enabledHooks.values()].filter(
      (hook) =>
        hook.workspace === workspace &&
        hook.project === change.project &&
        pickEvent(change.kind, rawFields, hook.events) !== undefined
    )
    if (hooks.length === 0) return

    const client = await getWorkspaceClient(ServiceId, workspace)
    const workspaceInfo = await findWorkspace(ServiceId, workspace)
    const issueUrlBase = workspaceInfo === undefined ? undefined : `${config.FrontUrl}/workbench/${workspaceInfo.url}/tracker`
    const resolution = await resolveChange(restReader(client), change, issueUrlBase)
    if ('skipped' in resolution) {
      if (resolution.skipped !== 'unchanged') {
        ctx.warn('tracker hook event skipped', { workspace, tx: tx._id, reason: resolution.skipped })
      }
      return
    }
    for (const hook of hooks) {
      const event = pickEvent(change.kind, resolution.resolved.changedFields, hook.events)
      if (event === undefined) continue
      const id = deliveryIdFor(hook.id, tx._id, event)
      const delivery = await dispatcher.enqueue(hook, id, event, buildPayload(event, id, resolution.resolved))
      if (delivery !== undefined) dispatcher.kick(delivery)
    }
  }

  const queue = getPlatformQueue(ServiceId, QueueRegion)
  const consumer = watchConsumer(ctx, () =>
    queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (_ctx, message) => {
      await onTx(message.workspace, message.value)
    })
  )
  dispatcher.start()

  const handler = createRequestHandler({
    store,
    hooks: dispatcher,
    buckets: new TokenBuckets(TEST_BURST, TEST_REFILL_PER_SECOND),
    frontUrl: config.FrontUrl,
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    findProject: async (workspace, project) =>
      await (await getWorkspaceClient(ServiceId, workspace)).findOne(tracker.class.Project, { _id: project }),
    resolveHost: publicTransport.resolveHost,
    sealSecret: (workspace, hookId, secret) => seal(keys, secretAad(workspace, hookId), secret),
    sendTest: async (hook, caller) => {
      const reader = restReader(await getWorkspaceClient(ServiceId, hook.workspace))
      const project = await reader.project(hook.project)
      if (project === undefined) throw new Error(`project ${hook.project} not found`)
      const id = randomBytes(TEST_DELIVERY_ID_BYTES).toString('hex')
      const now = Date.now()
      const body = buildPayload('test', id, testChange(project, await reader.account(caller.account), now))
      return await dispatcher.sendTest(hook, id, body)
    },
    report
  })

  return {
    handler,
    stop: async () => {
      clearInterval(reloadTimer)
      dispatcher.stop()
      await consumer.close()
    }
  }
}
