import { AccountRole, type AccountUuid, type Ref, roleOrder } from '@hcengineering/core'
import type { Project } from '@hcengineering/tracker'
import {
  isObject,
  type Json,
  type JsonObject,
  malformed,
  serviceRequest,
  webhooksServiceUrl
} from '../../chunter-resources/webhooks/api'

export const TRACKER_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.status_changed',
  'issue.assigned',
  'comment.added',
  'issue.deleted'
] as const
export type TrackerEvent = (typeof TRACKER_EVENTS)[number]

export interface LastAttempt {
  at: number
  status: number
  error: string | undefined
}

export interface TrackerHook {
  id: string
  url: string
  events: TrackerEvent[]
  createdBy: AccountUuid
  createdOn: number
  disabledOn: number | undefined
  disabledReason: 'failures' | 'manual' | undefined
  consecutiveFailures: number
  lastAttempt: LastAttempt | undefined
}

export interface AttemptRecord {
  at: number
  deliveryId: string
  event: string
  attempt: number
  status: number
  error: string | undefined
  durationMs: number
  responseStart: string
}

export interface TestOutcome {
  status: number
  error: string | undefined
  durationMs: number
  responseStart: string
}

export interface CreatedHook {
  id: string
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

const isTrackerEvent = (name: Json): name is TrackerEvent => TRACKER_EVENTS.some((event) => event === name)

function readDisabledReason (object: JsonObject): TrackerHook['disabledReason'] {
  const raw = object.disabledReason
  if (raw === null || raw === undefined) return undefined
  if (raw === 'failures' || raw === 'manual') return raw
  throw malformed('hook')
}

function readHook (json: Json | undefined): TrackerHook {
  if (!isObject(json) || !Array.isArray(json.events)) throw malformed('hook')
  const last = json.lastAttempt
  return {
    id: readString(json, 'id', 'hook'),
    url: readString(json, 'url', 'hook'),
    events: json.events.filter(isTrackerEvent),
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

export function parseHookList (json: Json): TrackerHook[] {
  if (!isObject(json) || !Array.isArray(json.hooks)) throw malformed('hook list')
  return json.hooks.map(readHook)
}

export function parseHook (json: Json): TrackerHook {
  if (!isObject(json)) throw malformed('hook')
  return readHook(json.hook)
}

export function parseCreatedHook (json: Json): CreatedHook {
  if (!isObject(json)) throw malformed('created hook')
  return { id: readString(json, 'id', 'created hook'), secret: readString(json, 'secret', 'created hook') }
}

export function parseAttempts (json: Json): AttemptRecord[] {
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
      responseStart: readString(entry, 'responseStart', 'log entry')
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

export function hookState (hook: TrackerHook): HookState {
  if (hook.disabledOn === undefined) return 'active'
  return hook.disabledReason === 'failures' ? 'offAfterFailures' : 'off'
}

export function canManageHooks (role: AccountRole, account: AccountUuid, owners: readonly AccountUuid[]): boolean {
  return roleOrder[role] >= roleOrder[AccountRole.Maintainer] || owners.includes(account)
}

export function urlLabel (url: string): string {
  const parsed = new URL(url)
  return `${parsed.host}${parsed.pathname}`
}

export async function isServiceConfigured (): Promise<boolean> {
  return (await webhooksServiceUrl()) !== undefined
}

const TRACKER = '/v1/tracker'
const hookPath = (id: string): string => `${TRACKER}/hooks/${encodeURIComponent(id)}`

export async function listHooks (project: Ref<Project>): Promise<TrackerHook[]> {
  return parseHookList(await serviceRequest('GET', `${TRACKER}/projects/${encodeURIComponent(project)}/hooks`))
}

export async function createHook (project: Ref<Project>, url: string, events: TrackerEvent[]): Promise<CreatedHook> {
  return parseCreatedHook(await serviceRequest('POST', `${TRACKER}/projects/${encodeURIComponent(project)}/hooks`, { url, events }))
}

export async function editHook (id: string, edit: { events?: TrackerEvent[], isEnabled?: boolean }): Promise<TrackerHook> {
  return parseHook(await serviceRequest('PATCH', hookPath(id), edit))
}

export async function deleteHook (id: string): Promise<void> {
  await serviceRequest('DELETE', hookPath(id))
}

export async function readHookLog (id: string): Promise<AttemptRecord[]> {
  return parseAttempts(await serviceRequest('GET', `${hookPath(id)}/log`))
}

export async function sendTestEvent (id: string): Promise<TestOutcome> {
  return parseTestOutcome(await serviceRequest('POST', `${hookPath(id)}/test`))
}
