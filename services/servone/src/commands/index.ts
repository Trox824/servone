// App slash commands: admins register /name with an https URL; runs go out as signed Slack-style form POSTs.
import type { RestClient } from '@hcengineering/api-client'
import chunter from '@hcengineering/chunter'
import contact, { formatName } from '@hcengineering/contact'
import { type MeasureContext, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { getClient as getKvsClient } from '@hcengineering/kvs-client'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import { postJson, publicTransport } from '../outgoing/send'
import { signatureHeaders } from '../outgoing/sign'
import type { RequestHandler } from '../router'
import { parseSealKeys, seal, unseal } from '../seal'
import { authenticate } from '../webhooks/auth'
import { type BotIdentity, ensureBotEmployee, loadBotIdentity, WEBHOOKS_BOT } from '../webhooks/bot'
import { ensureWebhookAttributes } from '../webhooks/post'
import { TokenBuckets } from '../webhooks/rate'
import { findRecipient, getWorkspaceClient } from '../workspaces'
import { postToTarget } from './post'
import { FORM_CONTENT_TYPE } from './request'
import {
  APP_TIMEOUT_MS,
  type AppAnswer,
  COMMAND_BURST,
  COMMAND_REFILL_PER_SECOND,
  USER_BURST,
  USER_REFILL_PER_SECOND
} from './run'
import { createNotConfiguredHandler, createRequestHandler } from './server'
import { CommandStore, KVS_NAMESPACE, type StoredCommand } from './store'

// Spec: the app's answer body is read up to 16 KB.
const MAX_APP_REPLY_BYTES = 16 * 1024
const RESPONSE_SWEEP_MS = 60 * 60_000

export interface ChatCommands {
  handler: RequestHandler
  stop: () => void
}

// Binds a sealed secret to its command, so a secret copied onto another command does not open.
const secretAad = (workspace: WorkspaceUuid, commandId: string): string => `${workspace}:${commandId}`

export function createChatCommands (ctx: MeasureContext): ChatCommands {
  const { ServiceId } = config.chatCommands
  const sealKeysText = config.trackerHooks.SealKeys
  if (sealKeysText === undefined) {
    ctx.info('chat commands off: TRACKER_HOOKS_KEYS is unset')
    return { handler: createNotConfiguredHandler(config.FrontUrl), stop: () => {} }
  }
  const keys = parseSealKeys(sealKeysText, 'TRACKER_HOOKS_KEYS')
  const kvsToken = generateToken(systemAccountUuid, undefined, { service: ServiceId })
  const store = new CommandStore(getKvsClient(KVS_NAMESPACE, config.KvsUrl, kvsToken))
  const report = (event: string, fields: Record<string, string | number>): void => {
    ctx.info(event, fields)
  }

  let bot: Promise<BotIdentity> | undefined
  const botIdentity = async (): Promise<BotIdentity> => {
    bot ??= loadBotIdentity(ServiceId, WEBHOOKS_BOT)
    try {
      return await bot
    } catch (error) {
      bot = undefined
      throw error
    }
  }

  // Cached as promises so concurrent first posts share one setup; a failed setup is dropped and retried.
  const prepared = new Map<WorkspaceUuid, Promise<RestClient>>()
  async function prepare (workspace: WorkspaceUuid): Promise<RestClient> {
    const client = await getWorkspaceClient(ServiceId, workspace)
    await ensureWebhookAttributes(client)
    await ensureBotEmployee(ctx, client, await botIdentity(), ServiceId)
    return client
  }
  async function postingClient (workspace: WorkspaceUuid): Promise<RestClient> {
    let pending = prepared.get(workspace)
    if (pending === undefined) {
      pending = prepare(workspace)
      prepared.set(workspace, pending)
    }
    try {
      return await pending
    } catch (error) {
      prepared.delete(workspace)
      throw error
    }
  }

  const appTransport = { ...publicTransport, timeoutMs: APP_TIMEOUT_MS }
  async function sendToApp (command: StoredCommand, body: string): Promise<AppAnswer> {
    const secret = unseal(keys, secretAad(command.workspace, command.id), command.sealedSecret)
    const headers = {
      'Content-Type': FORM_CONTENT_TYPE,
      'Servone-Event': 'command',
      ...signatureHeaders(secret, body, Date.now())
    }
    const outcome = await postJson(command.url, headers, body, appTransport, MAX_APP_REPLY_BYTES)
    return { status: outcome.status, error: outcome.error, body: outcome.responseBody }
  }

  const sweep = setInterval(() => {
    store.sweepExpiredResponseUrls(Date.now()).catch((error: Error) => {
      report('command response URL sweep failed', { error: error.message })
    })
  }, RESPONSE_SWEEP_MS)
  // Expired tokens are refused on read anyway; the sweep must not hold the process open.
  sweep.unref()

  const handler = createRequestHandler({
    store,
    userBuckets: new TokenBuckets(USER_BURST, USER_REFILL_PER_SECOND),
    commandBuckets: new TokenBuckets(COMMAND_BURST, COMMAND_REFILL_PER_SECOND),
    publicUrl: config.PublicUrl,
    frontUrl: config.FrontUrl,
    now: Date.now,
    sleep: async (ms) => {
      await new Promise<void>((resolve) => setTimeout(resolve, ms))
    },
    authenticate: async (authorization) => await authenticate(authorization, Date.now()),
    resolveHost: publicTransport.resolveHost,
    sealSecret: (workspace, commandId, secret) => seal(keys, secretAad(workspace, commandId), secret),
    findChannel: async (workspace, channelId) => {
      const channel = await (await getWorkspaceClient(ServiceId, workspace)).findOne(chunter.class.Channel, { _id: channelId })
      if (channel === undefined) return undefined
      return { name: channel.name, isPrivate: channel.private, isArchived: channel.archived, members: channel.members }
    },
    describeRunner: async (workspace, account) => {
      const client = await getWorkspaceClient(ServiceId, workspace)
      const person = await client.findOne(contact.class.Person, { personUuid: account })
      if (person === undefined) return { name: '', email: undefined }
      return { name: formatName(person.name), email: await findRecipient(client, person._id) }
    },
    send: sendToApp,
    post: async (workspace, target, commandName, message) =>
      await postToTarget(await postingClient(workspace), await botIdentity(), target, commandName, message),
    report
  })

  return {
    handler,
    stop: () => {
      clearInterval(sweep)
    }
  }
}
