// Incoming webhooks: a secret URL per hook posts a ChatMessage as the "Servone Webhooks" bot.
import { createRestClient, type RestClient } from '@hcengineering/api-client'
import chunter from '@hcengineering/chunter'
import { type MeasureContext, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import type { RequestHandler } from '../router'
import { authenticate } from './auth'
import { type BotIdentity, ensureBotEmployee, loadBotIdentity, WEBHOOKS_BOT } from './bot'
import { resolveMentions, workspaceDirectory } from './mentions'
import { ensureWebhookAttributes, postMessage } from './post'
import { RejectedCalls, REJECTED_FLUSH_MS, TokenBuckets } from './rate'
import { createRequestHandler } from './server'
import { HookStore, KVS_NAMESPACE } from './store'

const THREAD_SWEEP_MS = 24 * 60 * 60 * 1000

export function createWebhooks (ctx: MeasureContext): RequestHandler {
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: config.webhooks.ServiceId })
  const store = new HookStore(getKvsClient(KVS_NAMESPACE, config.KvsUrl, kvsToken))

  let bot: Promise<BotIdentity> | undefined
  const botIdentity = async (): Promise<BotIdentity> => {
    bot ??= loadBotIdentity(config.webhooks.ServiceId, WEBHOOKS_BOT)
    try {
      return await bot
    } catch (error) {
      bot = undefined
      throw error
    }
  }

  // Cached as promises so concurrent first calls share one setup; a failed setup is dropped and retried next call.
  const clients = new Map<WorkspaceUuid, Promise<RestClient>>()
  async function connect (workspace: WorkspaceUuid): Promise<RestClient> {
    const token = generateToken(systemAccountUuid, workspace, { service: config.webhooks.ServiceId })
    const client = createRestClient(await getTransactorEndpoint(token), workspace, token)
    await ensureWebhookAttributes(client)
    await ensureBotEmployee(ctx, client, await botIdentity(), config.webhooks.ServiceId)
    return client
  }
  async function workspaceClient (workspace: WorkspaceUuid): Promise<RestClient> {
    let pending = clients.get(workspace)
    if (pending === undefined) {
      pending = connect(workspace)
      clients.set(workspace, pending)
    }
    try {
      return await pending
    } catch (error) {
      clients.delete(workspace)
      throw error
    }
  }

  const rejected = new RejectedCalls()
  const flushRejected = setInterval(() => {
    for (const [id, count] of rejected.drain()) {
      store.appendLog(id, { at: Date.now(), status: 429, count }).catch((error) => {
        ctx.info('call log write failed', { hook: id, error: error instanceof Error ? error.message : String(error) })
      })
    }
  }, REJECTED_FLUSH_MS)
  // Losing up to one minute of counts on shutdown is fine; the timer must not hold the process open.
  flushRejected.unref()

  const sweepThreads = setInterval(() => {
    store.sweepExpiredThreads(Date.now()).catch((error) => {
      ctx.info('thread sweep failed', { error: error instanceof Error ? error.message : String(error) })
    })
  }, THREAD_SWEEP_MS)
  sweepThreads.unref()

  return createRequestHandler({
    store,
    buckets: new TokenBuckets(),
    rejected,
    publicUrl: config.PublicUrl,
    frontUrl: config.FrontUrl,
    now: Date.now,
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    findChannel: async (workspace, channel) =>
      await (await workspaceClient(workspace)).findOne(chunter.class.Channel, { _id: channel }),
    deliver: async (hook, post) =>
      await postMessage(await workspaceClient(hook.workspace), await botIdentity(), hook, post),
    resolveMentions: async (hook, tokens) =>
      await resolveMentions(workspaceDirectory(await workspaceClient(hook.workspace)), tokens),
    report: (event, fields) => {
      ctx.info(event, fields)
    }
  })
}
