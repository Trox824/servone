import type { ChangeId, DiffLine, Json, JsonObject, RiskLevel } from '@servone/config'
import type { SaveResult } from './save'
import { text, type StringKey } from './strings'

export const MAX_HISTORY_TURNS = 20
export const MAX_TEXT_CHARS = 4000

export type AssistantStop = 'done' | 'turn_limit' | 'max_tokens' | 'refusal'

export interface AssistantDraft {
  id: ChangeId
  summary: string
  risk: RiskLevel
  diff: DiffLine[]
}

export interface AssistantReply {
  reply: string
  stop: AssistantStop
  drafts: AssistantDraft[]
}

export type DraftState = 'ready' | 'applying' | 'applied' | 'pending' | 'stale' | 'unchanged' | 'failed'

export interface DraftEntry {
  draft: AssistantDraft
  state: DraftState
}

export interface AssistantEntry {
  id: number
  role: 'user' | 'assistant'
  text: string
  note: string | undefined
  drafts: DraftEntry[]
}

export interface AssistantState {
  entries: AssistantEntry[]
  isSending: boolean
  error: string | undefined
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatRequestBody {
  messages: ChatTurn[]
  typeKey?: string
}

export type AssistantErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'model_unavailable'
  | 'invalid_request'
  | 'network'
  | 'malformed'
  | 'failed'

export class AssistantError extends Error {
  constructor (readonly code: AssistantErrorCode) {
    super(`Studio assistant: ${code}`)
  }
}

const RISKS: readonly RiskLevel[] = ['safe', 'destructive', 'sensitive']
const STOPS: readonly AssistantStop[] = ['done', 'turn_limit', 'max_tokens', 'refusal']

function isObject (json: Json | undefined): json is JsonObject {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

function malformed (): AssistantError {
  return new AssistantError('malformed')
}

function readString (object: JsonObject, key: string): string {
  const raw = object[key]
  if (typeof raw !== 'string') throw malformed()
  return raw
}

function readRisk (json: Json | undefined): RiskLevel {
  const risk = RISKS.find((it) => it === json)
  if (risk === undefined) throw malformed()
  return risk
}

function readLine (json: Json): DiffLine {
  if (!isObject(json)) throw malformed()
  const affected = json.affected
  if (affected !== null && typeof affected !== 'number') throw malformed()
  const line: DiffLine = { text: readString(json, 'text'), risk: readRisk(json.risk) }
  if (affected !== null) line.affected = affected
  return line
}

function readDraft (json: Json): AssistantDraft {
  if (!isObject(json) || !Array.isArray(json.diff)) throw malformed()
  return {
    id: readString(json, 'id') as ChangeId,
    summary: readString(json, 'summary'),
    risk: readRisk(json.risk),
    diff: json.diff.map(readLine)
  }
}

export function parseAssistantReply (json: Json): AssistantReply {
  if (!isObject(json) || !Array.isArray(json.drafts)) throw malformed()
  const stop = STOPS.find((it) => it === json.stop)
  if (stop === undefined) throw malformed()
  return { reply: readString(json, 'reply'), stop, drafts: json.drafts.map(readDraft) }
}

export function errorCodeFor (status: number, json: Json): AssistantErrorCode {
  const code = isObject(json) && typeof json.error === 'string' ? json.error : undefined
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (status === 502) return 'model_unavailable'
  if (status === 503 && code === 'not_configured') return 'not_configured'
  if (status === 400) return 'invalid_request'
  return 'failed'
}

const ERROR_KEY: Record<AssistantErrorCode, StringKey> = {
  not_configured: 'AssistantNotConfigured',
  unauthorized: 'AssistantUnauthorized',
  forbidden: 'AssistantForbidden',
  rate_limited: 'AssistantRateLimited',
  model_unavailable: 'AssistantUnavailable',
  invalid_request: 'AssistantInvalid',
  network: 'AssistantNetwork',
  malformed: 'AssistantFailed',
  failed: 'AssistantFailed'
}

export function errorText (code: AssistantErrorCode): string {
  return text(ERROR_KEY[code])
}

const STOP_KEY: Record<Exclude<AssistantStop, 'done'>, StringKey> = {
  turn_limit: 'StopTurnLimit',
  max_tokens: 'StopMaxTokens',
  refusal: 'StopRefusal'
}

export function stopNote (stop: AssistantStop): string | undefined {
  return stop === 'done' ? undefined : text(STOP_KEY[stop])
}

const DRAFT_KEY: Record<DraftState, StringKey> = {
  ready: 'DraftReady',
  applying: 'DraftApplying',
  applied: 'DraftApplied',
  pending: 'DraftPending',
  stale: 'DraftStale',
  unchanged: 'DraftUnchanged',
  failed: 'DraftFailed'
}

export function draftStateText (state: DraftState): string {
  return text(DRAFT_KEY[state])
}

export function canApply (state: DraftState): boolean {
  return state === 'ready'
}

export function draftStateOf (outcome: SaveResult): DraftState {
  switch (outcome.kind) {
    case 'applied':
      return 'applied'
    case 'pending':
      return 'pending'
    case 'cancelled':
      return 'ready'
    case 'stale':
      return 'stale'
    case 'unchanged':
      return 'unchanged'
    case 'invalid':
    case 'failed':
      return 'failed'
    case 'partial':
      return draftStateOf(outcome.stopped)
  }
}

export function initialAssistant (): AssistantState {
  return { entries: [], isSending: false, error: undefined }
}

export function canSend (state: AssistantState, question: string): boolean {
  const trimmed = question.trim()
  return !state.isSending && trimmed !== '' && trimmed.length <= MAX_TEXT_CHARS
}

export function withQuestion (state: AssistantState, question: string): AssistantState {
  const entry: AssistantEntry = { id: state.entries.length, role: 'user', text: question.trim(), note: undefined, drafts: [] }
  return { entries: [...state.entries, entry], isSending: true, error: undefined }
}

export function withReply (state: AssistantState, reply: AssistantReply): AssistantState {
  const entry: AssistantEntry = {
    id: state.entries.length,
    role: 'assistant',
    text: reply.reply,
    note: stopNote(reply.stop),
    drafts: reply.drafts.map((draft) => ({ draft, state: 'ready' }))
  }
  return { entries: [...state.entries, entry], isSending: false, error: undefined }
}

export function withFailure (state: AssistantState, code: AssistantErrorCode): AssistantState {
  return { ...state, isSending: false, error: errorText(code) }
}

export function withDraftState (state: AssistantState, id: ChangeId, next: DraftState): AssistantState {
  return {
    ...state,
    entries: state.entries.map((entry) => ({
      ...entry,
      drafts: entry.drafts.map((planned) => (planned.draft.id === id ? { ...planned, state: next } : planned))
    }))
  }
}

function turnText (entry: AssistantEntry): string {
  const planLines = entry.drafts.map((planned) =>
    text('DraftHistory', { summary: planned.draft.summary, state: draftStateText(planned.state) })
  )
  const body = entry.text === '' ? entry.note ?? '' : entry.text
  return [...planLines, body]
    .filter((line) => line !== '')
    .join('\n')
    .slice(0, MAX_TEXT_CHARS)
}

export function requestFor (state: AssistantState, typeKey: string | undefined): ChatRequestBody {
  const turns = state.entries
    .map((entry) => ({ role: entry.role, text: turnText(entry) }))
    .filter((turn) => turn.text !== '')
    .slice(-MAX_HISTORY_TURNS)
  const firstUser = turns.findIndex((turn) => turn.role === 'user')
  const body: ChatRequestBody = { messages: firstUser < 0 ? [] : turns.slice(firstUser) }
  if (typeKey !== undefined) body.typeKey = typeKey
  return body
}
