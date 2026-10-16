import type { Json } from '../http-json'
import { parsePayload, type WebhookPayload } from '../webhooks/payload'
import { parseSlackBody } from '../webhooks/slack'

export type Visibility = 'in_channel' | 'ephemeral'

export type AppReply =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'message', visibility: Visibility, payload: WebhookPayload }

type JsonFields = { [key: string]: Json }

const JSON_CONTENT_TYPE = 'application/json'
const NATIVE_BLOCK_TYPES: readonly string[] = ['heading', 'fields', 'button']

function isFields (json: Json): json is JsonFields {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

function parseJson (text: string): Json | undefined {
  try {
    // JSON.parse only ever yields values of the Json union.
    return JSON.parse(text) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

// Plain {text} goes through the Slack reader so Slack handlers' mrkdwn renders as it does in Slack.
function hasNativeParts (json: JsonFields): boolean {
  if (json.color !== undefined) return true
  const blocks = Array.isArray(json.blocks) ? json.blocks : []
  return blocks.some((block) => isFields(block) && typeof block.type === 'string' && NATIVE_BLOCK_TYPES.includes(block.type))
}

function slackReply (body: string, visibility: Visibility): AppReply {
  const parsed = parseSlackBody(body, JSON_CONTENT_TYPE)
  if (parsed.isValid) return { kind: 'message', visibility, payload: parsed.payload }
  return parsed.error === 'no_text' ? { kind: 'none' } : { kind: 'invalid' }
}

export function readAppReply (body: string): AppReply {
  const trimmed = body.trim()
  if (trimmed === '') return { kind: 'none' }
  // Slack shows a plain-text answer to the runner only.
  if (!trimmed.startsWith('{')) return slackReply(JSON.stringify({ text: trimmed }), 'ephemeral')
  const json = parseJson(trimmed)
  if (json === undefined || !isFields(json)) return { kind: 'invalid' }
  // Slack's default when response_type is absent.
  const visibility: Visibility = json.response_type === 'in_channel' ? 'in_channel' : 'ephemeral'
  if (!hasNativeParts(json)) return slackReply(trimmed, visibility)
  const native = Object.fromEntries(Object.entries(json).filter(([key]) => key !== 'response_type'))
  const parsed = parsePayload(JSON.stringify(native))
  return parsed.isValid ? { kind: 'message', visibility, payload: parsed.payload } : { kind: 'invalid' }
}
