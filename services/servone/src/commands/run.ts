import type { Channel } from '@hcengineering/chunter'
import { AccountRole, type AccountUuid, type Markup, type Ref, roleOrder, type WorkspaceUuid } from '@hcengineering/core'
import type { SendError } from '../outgoing/send'
import type { Caller } from '../webhooks/auth'
import { renderPayload } from '../webhooks/markup'
import { NO_MENTIONS } from '../webhooks/mentions'
import type { WebhookPayload } from '../webhooks/payload'
import type { TokenBuckets } from '../webhooks/rate'
import { newHookId, newSecret } from '../webhooks/secret'
import { formBody } from './request'
import { readAppReply } from './reply'
import { type CommandStore, RESPONSE_URL_TTL_MS, type StoredCommand } from './store'

// Slack's limit; handlers written for Slack answer within it.
export const APP_TIMEOUT_MS = 3_000
export const USER_BURST = 5
export const USER_REFILL_PER_SECOND = 0.5
export const COMMAND_BURST = 60
export const COMMAND_REFILL_PER_SECOND = 1
export const RESPOND_PATH = '/v1/chat/commands/respond/'

export interface RunRequest {
  command: string
  text: string
  channel: Ref<Channel>
}

export interface RunChannel {
  name: string
  isPrivate: boolean
  isArchived: boolean
  members: AccountUuid[]
}

export interface Runner {
  name: string
  email: string | undefined
}

export interface AppAnswer {
  status: number
  error: SendError | undefined
  body: string
}

export type PostTarget = { kind: 'channel', channel: Ref<Channel> } | { kind: 'direct', account: AccountUuid }

export type RunOutcome =
  | { shown: 'posted' }
  | { shown: 'private', markup: Markup }
  | { shown: 'sent' }
  | { shown: 'failed', status: number }
  | { shown: 'failed', error: SendError | 'invalid_reply' }
  | { shown: 'unknown_command' }
  | { shown: 'channel_denied' }
  | { shown: 'rate_limited', retryAfterSeconds: number }

export type RespondOutcome = { kind: 'posted' | 'not_found' | 'invalid' | 'empty' | 'channel_closed' }

export interface RunDeps {
  store: CommandStore
  userBuckets: TokenBuckets
  commandBuckets: TokenBuckets
  publicUrl: string
  now: () => number
  sleep: (ms: number) => Promise<void>
  // Undefined for anything that is not a Channel, direct messages included.
  findChannel: (workspace: WorkspaceUuid, channel: Ref<Channel>) => Promise<RunChannel | undefined>
  describeRunner: (workspace: WorkspaceUuid, account: AccountUuid) => Promise<Runner>
  send: (command: StoredCommand, body: string) => Promise<AppAnswer>
  // False when the channel is gone or archived.
  post: (workspace: WorkspaceUuid, target: PostTarget, commandName: string, message: Markup) => Promise<boolean>
}

const TIMED_OUT: AppAnswer = { status: 0, error: 'timeout', body: '' }
const MARKDOWN_SPECIAL = /([\\`*_[\]#<>~|])/g

// Escaped so a display name cannot add links or formatting to the message.
export function withRunnerLine (payload: WebhookPayload, runnerName: string): WebhookPayload {
  if (runnerName === '') return payload
  return { ...payload, text: `${payload.text}\n\n*used by ${runnerName.replace(MARKDOWN_SPECIAL, '\\$1')}*` }
}

function canPostIn (caller: Caller, channel: RunChannel): boolean {
  if (channel.isArchived) return false
  return !channel.isPrivate || channel.members.includes(caller.account)
}

async function showAnswer (
  deps: RunDeps,
  workspace: WorkspaceUuid,
  command: StoredCommand,
  channel: Ref<Channel>,
  runner: Runner,
  answer: AppAnswer
): Promise<RunOutcome> {
  // A slow app may still answer through the response URL, so it counts as sent, not failed.
  if (answer.error === 'timeout') return { shown: 'sent' }
  if (answer.error !== undefined) return { shown: 'failed', error: answer.error }
  if (answer.status < 200 || answer.status >= 300) return { shown: 'failed', status: answer.status }
  const reply = readAppReply(answer.body)
  if (reply.kind === 'none') return { shown: 'sent' }
  if (reply.kind === 'invalid') return { shown: 'failed', error: 'invalid_reply' }
  if (reply.visibility === 'ephemeral') {
    const markup = renderPayload(reply.payload, NO_MENTIONS)
    return markup === undefined ? { shown: 'sent' } : { shown: 'private', markup }
  }
  const markup = renderPayload(withRunnerLine(reply.payload, runner.name), NO_MENTIONS)
  if (markup === undefined) return { shown: 'sent' }
  const isPosted = await deps.post(workspace, { kind: 'channel', channel }, command.name, markup)
  return isPosted ? { shown: 'posted' } : { shown: 'channel_denied' }
}

export async function runCommand (deps: RunDeps, caller: Caller, request: RunRequest): Promise<RunOutcome> {
  if (roleOrder[caller.role] < roleOrder[AccountRole.User]) return { shown: 'channel_denied' }
  const userLimit = deps.userBuckets.take(`${caller.workspace}/${caller.account}`, deps.now())
  if (!userLimit.isAllowed) return { shown: 'rate_limited', retryAfterSeconds: userLimit.retryAfterSeconds }
  const command = await deps.store.findByName(caller.workspace, request.command)
  if (command === undefined) return { shown: 'unknown_command' }
  const channel = await deps.findChannel(caller.workspace, request.channel)
  if (channel === undefined || !canPostIn(caller, channel)) return { shown: 'channel_denied' }
  const commandLimit = deps.commandBuckets.take(command.id, deps.now())
  if (!commandLimit.isAllowed) return { shown: 'rate_limited', retryAfterSeconds: commandLimit.retryAfterSeconds }

  const runner = await deps.describeRunner(caller.workspace, caller.account)
  const token = newSecret()
  await deps.store.saveResponseUrl(token, {
    workspace: caller.workspace,
    commandId: command.id,
    commandName: command.name,
    channel: request.channel,
    runner: caller.account,
    runnerName: runner.name,
    expiresOn: deps.now() + RESPONSE_URL_TTL_MS,
    uses: 0
  })
  const body = formBody({
    command: command.name,
    text: request.text,
    channelId: request.channel,
    channelName: channel.name,
    userId: caller.account,
    userName: runner.name,
    userEmail: runner.email,
    workspaceId: caller.workspace,
    responseUrl: `${deps.publicUrl}${RESPOND_PATH}${token}`,
    triggerId: newHookId()
  })
  const answer = await Promise.race([deps.send(command, body), deps.sleep(APP_TIMEOUT_MS).then(() => TIMED_OUT)])
  return await showAnswer(deps, caller.workspace, command, request.channel, runner, answer)
}

export async function respondToCommand (deps: RunDeps, token: string, body: string): Promise<RespondOutcome> {
  const use = await deps.store.useResponseUrl(token, deps.now())
  if (!use.isAllowed) return { kind: 'not_found' }
  const reply = readAppReply(body)
  if (reply.kind === 'none') return { kind: 'empty' }
  if (reply.kind === 'invalid') return { kind: 'invalid' }
  const { response } = use
  const isInChannel = reply.visibility === 'in_channel'
  const payload = isInChannel ? withRunnerLine(reply.payload, response.runnerName) : reply.payload
  const markup = renderPayload(payload, NO_MENTIONS)
  if (markup === undefined) return { kind: 'empty' }
  // The runner's reply panel may be gone by now; a direct message is the closest saved form of a private reply.
  const target: PostTarget = isInChannel
    ? { kind: 'channel', channel: response.channel }
    : { kind: 'direct', account: response.runner }
  const isPosted = await deps.post(response.workspace, target, response.commandName, markup)
  return isPosted ? { kind: 'posted' } : { kind: 'channel_closed' }
}
