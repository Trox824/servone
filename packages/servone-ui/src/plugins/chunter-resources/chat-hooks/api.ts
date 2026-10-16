import type { Channel } from '@hcengineering/chunter'
import type { AccountUuid, Ref } from '@hcengineering/core'
import { isObject, type Json, type JsonObject, malformed, serviceRequest } from '../webhooks/api'

export const CHAT_EVENTS = ['message.posted', 'message.updated', 'message.deleted', 'thread.reply', 'reaction.added'] as const
export type ChatEventName = (typeof CHAT_EVENTS)[number]

export interface ChatHookSettings {
  url: string
  events: ChatEventName[]
  mentionsOnly: boolean
  peopleOnly: boolean
  includeIntegrations: boolean
}

export interface LastAttempt {
  at: number
  status: number
  error: string | undefined
}

export interface ChatHook extends ChatHookSettings {
  id: string
  channel: Ref<Channel>
  createdBy: AccountUuid
  createdOn: number
  disabledOn: number | undefined
  disabledReason: 'failures' | 'manual' | undefined
  consecutiveFailures: number
  lastAttempt: LastAttempt | undefined
}

export interface ChatAttempt {
  at: number
  deliveryId: string
  event: string
  attempt: number
  status: number
  error: string | undefined
  durationMs: number
  responseStart: string
  dropped: number | undefined
}

export interface TestOutcome {
  status: number
  error: string | undefined
  durationMs: number
  responseStart: string
}

export interface CreatedChatHook {
  hook: ChatHook
  secret: string
}

function readString (object: JsonObject, key: string, what: string): string {
  const raw = object[key]
  if (typeof raw !== 'string') throw malformed(what)
  return raw
}

function readNumber (object: JsonObject, key: string, what: string): number {
  const raw = object[key]
  if (typeof raw !== 'number') throw malformed(what)
  return raw
}

function readBoolean (object: JsonObject, key: string, what: string): boolean {
  const raw = object[key]
  if (typeof raw !== 'boolean') throw malformed(what)
  return raw
}

function readOptionalNumber (object: JsonObject, key: string, what: string): number | undefined {
  const raw = object[key]
  if (raw === null || raw === undefined) return undefined
  if (typeof raw !== 'number') throw malformed(what)
  return raw
}

function readOptionalString (object: JsonObject, key: string, what: string): string | undefined {
  const raw = object[key]
  if (raw === null || raw === undefined) return undefined
  if (typeof raw !== 'string') throw malformed(what)
  return raw
}

const isChatEvent = (name: Json): name is ChatEventName => CHAT_EVENTS.some((event) => event === name)

function readDisabledReason (object: JsonObject): ChatHook['disabledReason'] {
  const raw = object.disabledReason
  if (raw === null || raw === undefined) return undefined
  if (raw === 'failures' || raw === 'manual') return raw
  throw malformed('hook')
}

function readHook (json: Json | undefined): ChatHook {
  if (!isObject(json) || !Array.isArray(json.events)) throw malformed('hook')
  const last = json.lastAttempt
  return {
    id: readString(json, 'id', 'hook'),
    channel: readString(json, 'channel', 'hook') as Ref<Channel>,
    url: readString(json, 'url', 'hook'),
    events: json.events.filter(isChatEvent),
    mentionsOnly: readBoolean(json, 'mentionsOnly', 'hook'),
    peopleOnly: readBoolean(json, 'peopleOnly', 'hook'),
    includeIntegrations: readBoolean(json, 'includeIntegrations', 'hook'),
    createdBy: readString(json, 'createdBy', 'hook') as AccountUuid,
    createdOn: readNumber(json, 'createdOn', 'hook'),
    disabledOn: readOptionalNumber(json, 'disabledOn', 'hook'),
    disabledReason: readDisabledReason(json),
    consecutiveFailures: readNumber(json, 'consecutiveFailures', 'hook'),
    lastAttempt: isObject(last)
      ? {
          at: readNumber(last, 'at', 'last attempt'),
          status: readNumber(last, 'status', 'last attempt'),
          error: readOptionalString(last, 'error', 'last attempt')
        }
      : undefined
  }
}

export function parseChatHookList (json: Json): ChatHook[] {
  if (!isObject(json) || !Array.isArray(json.hooks)) throw malformed('hook list')
  return json.hooks.map(readHook)
}

export function parseChatHook (json: Json): ChatHook {
  if (!isObject(json)) throw malformed('hook')
  return readHook(json.hook)
}

export function parseCreatedChatHook (json: Json): CreatedChatHook {
  if (!isObject(json)) throw malformed('created hook')
  return { hook: readHook(json.hook), secret: readString(json, 'secret', 'created hook') }
}

export function parseChatAttempts (json: Json): ChatAttempt[] {
  if (!isObject(json) || !Array.isArray(json.attempts)) throw malformed('log')
  return json.attempts.map((entry) => {
    if (!isObject(entry)) throw malformed('log entry')
    return {
      at: readNumber(entry, 'at', 'log entry'),
      deliveryId: readString(entry, 'deliveryId', 'log entry'),
      event: readString(entry, 'event', 'log entry'),
      attempt: readNumber(entry, 'attempt', 'log entry'),
      status: readNumber(entry, 'status', 'log entry'),
      error: readOptionalString(entry, 'error', 'log entry'),
      durationMs: readNumber(entry, 'durationMs', 'log entry'),
      responseStart: readString(entry, 'responseStart', 'log entry'),
      dropped: readOptionalNumber(entry, 'dropped', 'log entry')
    }
  })
}

export function parseTestOutcome (json: Json): TestOutcome {
  if (!isObject(json)) throw malformed('test outcome')
  return {
    status: readNumber(json, 'status', 'test outcome'),
    error: readOptionalString(json, 'error', 'test outcome'),
    durationMs: readNumber(json, 'durationMs', 'test outcome'),
    responseStart: readString(json, 'responseStart', 'test outcome')
  }
}

export type HookState = 'active' | 'offAfterFailures' | 'off'

export function hookState (hook: Pick<ChatHook, 'disabledOn' | 'disabledReason'>): HookState {
  if (hook.disabledOn === undefined) return 'active'
  return hook.disabledReason === 'failures' ? 'offAfterFailures' : 'off'
}

export type ChatHookEdit = Partial<ChatHookSettings> & { isEnabled?: boolean }
const HOOKS = '/v1/chat/hooks'
const hookPath = (id: string): string => `${HOOKS}/${encodeURIComponent(id)}`

export async function listChatHooks (channel: Ref<Channel>): Promise<ChatHook[]> {
  return parseChatHookList(await serviceRequest('GET', `${HOOKS}?channel=${encodeURIComponent(channel)}`))
}

export async function createChatHook (channel: Ref<Channel>, settings: ChatHookSettings): Promise<CreatedChatHook> {
  return parseCreatedChatHook(await serviceRequest('POST', HOOKS, { channel, ...settings }))
}

export async function editChatHook (id: string, edit: ChatHookEdit): Promise<ChatHook> {
  return parseChatHook(await serviceRequest('PATCH', hookPath(id), edit))
}

export async function deleteChatHook (id: string): Promise<void> {
  await serviceRequest('DELETE', hookPath(id))
}

export async function readChatHookLog (id: string): Promise<ChatAttempt[]> {
  return parseChatAttempts(await serviceRequest('GET', `${hookPath(id)}/log`))
}

export async function sendChatTestEvent (id: string): Promise<TestOutcome> {
  return parseTestOutcome(await serviceRequest('POST', `${hookPath(id)}/test`))
}
