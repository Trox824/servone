// Sends channel chat events to outside HTTPS receivers, signed, with retries. Reads the transactor's `tx` topic
// under its own consumer group, so it never shares offsets with tracker hooks.
import chunter from '@hcengineering/chunter'
import contact, { formatName } from '@hcengineering/contact'
import { type MeasureContext, systemAccountUuid, type Tx, type WorkspaceUuid } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { randomBytes } from 'crypto'

import config from '../config'
import { Dispatcher } from '../outgoing/dispatcher'
import { disabledEmail, disabledEmailRecipients, sendEmail } from '../outgoing/notify'
import { createNotConfiguredHandler } from '../outgoing/request'
import { postJson, publicTransport } from '../outgoing/send'
import { signatureHeaders } from '../outgoing/sign'
import { OutgoingHookStore } from '../outgoing/store'
import { watchConsumer } from '../queue-watchdog'
import type { RequestHandler } from '../router'
import { parseSealKeys, seal, unseal } from '../seal'
import { authenticate } from '../webhooks/auth'
import { TokenBuckets } from '../webhooks/rate'
import { findRecipient, findWorkspace, getWorkspaceClient } from '../workspaces'
import { createChatTxHandler } from './deliver'
import { buildChatPayload, testChatEvent } from './payload'
import { type ChatLinks, channelUrl, restChatReader } from './resolve'
import { createRequestHandler } from './server'
import { CHANNEL_INDEX, KVS_NAMESPACE, type StoredChatHook } from './store'

// Catches a change another replica or a lost reload missed; management writes update the map at once.
const HOOK_RELOAD_MS = 5 * 60_000
const TEST_BURST = 3
const TEST_REFILL_PER_SECOND = 1 / 10
const TEST_DELIVERY_ID_BYTES = 16

export interface ChatHooks {
  handler: RequestHandler
  stop: () => Promise<void>
}

// Binds a sealed secret to its hook, so a secret copied onto another hook does not open.
const secretAad = (workspace: WorkspaceUuid, hookId: string): string => `${workspace}:${hookId}`

export function createChatHooks (ctx: MeasureContext): ChatHooks {
  const { ServiceId, QueueRegion } = config.chatHooks
  const sealKeysText = config.trackerHooks.SealKeys
  if (sealKeysText === undefined) {
    ctx.info('chat hooks off: TRACKER_HOOKS_KEYS is unset')
    return { handler: createNotConfiguredHandler(config.FrontUrl), stop: async () => {} }
  }
  const keys = parseSealKeys(sealKeysText, 'TRACKER_HOOKS_KEYS')
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: ServiceId })
  const store = new OutgoingHookStore<StoredChatHook>(getKvsClient(KVS_NAMESPACE, config.KvsUrl, kvsToken), CHANNEL_INDEX)
  const report = (event: string, fields: Record<string, string | number>): void => {
    ctx.info(event, fields)
  }

  async function links (workspace: WorkspaceUuid): Promise<ChatLinks> {
    const found = await findWorkspace(ServiceId, workspace)
    return { frontUrl: config.FrontUrl, workspaceId: workspace, workspaceUrl: found?.url ?? workspace }
  }

  const enabledHooks = new Map<string, StoredChatHook>()
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
      report('chat hooks reload failed', { error: error.message })
    })
  }, HOOK_RELOAD_MS)

  const dispatcher = new Dispatcher<StoredChatHook>({
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
      const channel = await client.findOne(chunter.class.Channel, { _id: hook.channel })
      const to = await disabledEmailRecipients(client, channel?.owners ?? [], hook.createdBy)
      if (to.length === 0) {
        report('turned-off hook has no one to mail', { hook: hook.id, workspace: hook.workspace })
        return
      }
      const page = channelUrl(await links(hook.workspace), hook.channel)
      const fixLine = `Open the channel settings to see the log and turn it back on: ${page}`
      const mail = { url: config.scheduler.MailUrl, authToken: config.scheduler.MailAuthToken }
      await sendEmail(mail, to, disabledEmail(hook, last, `#${channel?.name ?? 'channel'}`, fixLine))
    },
    onHookChanged: (id, hook) => {
      if (hook === undefined || hook.disabledOn !== undefined) enabledHooks.delete(id)
      else enabledHooks.set(id, hook)
    },
    now: Date.now,
    report
  })

  const onTx = createChatTxHandler({
    enabledHooks: async (workspace) => {
      await hooksLoaded()
      return [...enabledHooks.values()].filter((hook) => hook.workspace === workspace)
    },
    reader: async (workspace) => restChatReader(await getWorkspaceClient(ServiceId, workspace)),
    links,
    enqueue: async (hook, id, event, body) => {
      const delivery = await dispatcher.enqueue(hook, id, event, body)
      if (delivery !== undefined) dispatcher.kick(delivery)
    },
    warn: (message, fields) => {
      ctx.warn(message, fields)
    }
  })

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
    findChannel: async (workspace, channel) =>
      await (await getWorkspaceClient(ServiceId, workspace)).findOne(chunter.class.Channel, { _id: channel }),
    resolveHost: publicTransport.resolveHost,
    sealSecret: (workspace, hookId, secret) => seal(keys, secretAad(workspace, hookId), secret),
    sendTest: async (hook, caller) => {
      const client = await getWorkspaceClient(ServiceId, hook.workspace)
      const reader = restChatReader(client)
      const channel = await reader.channel(hook.channel)
      if (channel === undefined) throw new Error(`channel ${hook.channel} not found`)
      const workspaceLinks = await links(hook.workspace)
      const person = await client.findOne(contact.class.Person, { personUuid: caller.account })
      const callerFacts = person === undefined
        ? { name: 'Unknown', email: null }
        : { name: formatName(person.name), email: (await findRecipient(client, person._id)) ?? null }
      const id = randomBytes(TEST_DELIVERY_ID_BYTES).toString('hex')
      const body = buildChatPayload(
        'test',
        id,
        testChatEvent(workspaceLinks, { id: hook.channel, name: channel.name, url: channelUrl(workspaceLinks, hook.channel) }, callerFacts, Date.now())
      )
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
