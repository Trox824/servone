// Webhook payload v1. Strict on purpose: unknown fields fail so a v2 field is never silently dropped.
import type { Json } from '../http-json'

export const MAX_TEXT_LENGTH = 4000
export const MAX_BLOCKS = 20
export const MAX_HEADING_LENGTH = 150
export const MAX_FIELDS = 10
export const MAX_FIELD_LABEL_LENGTH = 50
export const MAX_FIELD_VALUE_LENGTH = 300
export const MAX_BUTTON_TEXT_LENGTH = 40
export const MAX_BUTTON_URL_LENGTH = 2000
export const MAX_THREAD_KEY_LENGTH = 128

export const NAMED_COLORS = ['danger', 'warning', 'good', 'info'] as const
export type NamedColor = (typeof NAMED_COLORS)[number]
export type MessageColor = NamedColor | `#${string}`
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function readColor (raw: string): MessageColor | undefined {
  const named = NAMED_COLORS.find((color) => color === raw)
  if (named !== undefined) return named
  return HEX_COLOR_PATTERN.test(raw) ? `#${raw.slice(1).toLowerCase()}` : undefined
}

export interface HeadingBlock {
  type: 'heading'
  text: string
}

export interface Field {
  label: string
  value: string
}

export interface FieldsBlock {
  type: 'fields'
  fields: Field[]
}

export interface ButtonBlock {
  type: 'button'
  text: string
  url: string
}

export type Block = HeadingBlock | FieldsBlock | ButtonBlock

export interface WebhookPayload {
  text: string
  blocks: Block[]
  color?: MessageColor
  threadKey?: string
  replyBroadcast?: boolean
}

export type PayloadError =
  | 'invalid_json'
  | 'invalid_type'
  | 'unknown_field'
  | 'missing_field'
  | 'too_long'
  | 'empty'
  | 'too_many'
  | 'invalid_url'
  | 'invalid_color'

export type ParsedPayload = { isValid: true, payload: WebhookPayload } | { isValid: false, error: PayloadError, field: string }

export type JsonObject = Record<string, Json>

class PayloadRejection extends Error {
  constructor (readonly error: PayloadError, readonly field: string) {
    super(`${error}: ${field}`)
  }
}

export function isObject (json: Json | undefined): json is JsonObject {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

function objectAt (json: Json | undefined, field: string): JsonObject {
  if (!isObject(json)) throw new PayloadRejection('invalid_type', field)
  return json
}

function onlyKeys (object: JsonObject, allowed: readonly string[], field: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new PayloadRejection('unknown_field', field === '' ? key : `${field}.${key}`)
  }
}

function stringAt (object: JsonObject, key: string, maxLength: number, field: string): string {
  const raw = object[key]
  if (raw === undefined) throw new PayloadRejection('missing_field', field)
  if (typeof raw !== 'string') throw new PayloadRejection('invalid_type', field)
  if (raw.trim().length === 0) throw new PayloadRejection('empty', field)
  if (raw.length > maxLength) throw new PayloadRejection('too_long', field)
  return raw
}

function httpsUrlAt (object: JsonObject, key: string, field: string): string {
  const raw = stringAt(object, key, MAX_BUTTON_URL_LENGTH, field)
  if (!URL.canParse(raw)) throw new PayloadRejection('invalid_url', field)
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new PayloadRejection('invalid_url', field)
  return url.toString()
}

function readField (json: Json, field: string): Field {
  const object = objectAt(json, field)
  onlyKeys(object, ['label', 'value'], field)
  return {
    label: stringAt(object, 'label', MAX_FIELD_LABEL_LENGTH, `${field}.label`),
    value: stringAt(object, 'value', MAX_FIELD_VALUE_LENGTH, `${field}.value`)
  }
}

function readBlock (json: Json, field: string): Block {
  const object = objectAt(json, field)
  switch (object.type) {
    case 'heading':
      onlyKeys(object, ['type', 'text'], field)
      return { type: 'heading', text: stringAt(object, 'text', MAX_HEADING_LENGTH, `${field}.text`) }
    case 'fields': {
      onlyKeys(object, ['type', 'fields'], field)
      const fields = object.fields
      if (!Array.isArray(fields)) throw new PayloadRejection('invalid_type', `${field}.fields`)
      if (fields.length === 0) throw new PayloadRejection('empty', `${field}.fields`)
      if (fields.length > MAX_FIELDS) throw new PayloadRejection('too_many', `${field}.fields`)
      return { type: 'fields', fields: fields.map((entry, i) => readField(entry, `${field}.fields[${i}]`)) }
    }
    case 'button':
      onlyKeys(object, ['type', 'text', 'url'], field)
      return {
        type: 'button',
        text: stringAt(object, 'text', MAX_BUTTON_TEXT_LENGTH, `${field}.text`),
        url: httpsUrlAt(object, 'url', `${field}.url`)
      }
    case undefined:
      throw new PayloadRejection('missing_field', `${field}.type`)
    default:
      throw new PayloadRejection('invalid_type', `${field}.type`)
  }
}

function readColorField (raw: Json | undefined): MessageColor {
  if (typeof raw !== 'string') throw new PayloadRejection('invalid_type', 'color')
  const color = readColor(raw)
  if (color === undefined) throw new PayloadRejection('invalid_color', 'color')
  return color
}

function readBlocks (rawBlocks: Json | undefined): Block[] {
  if (rawBlocks === undefined) return []
  if (!Array.isArray(rawBlocks)) throw new PayloadRejection('invalid_type', 'blocks')
  if (rawBlocks.length > MAX_BLOCKS) throw new PayloadRejection('too_many', 'blocks')
  return rawBlocks.map((block, i) => readBlock(block, `blocks[${i}]`))
}

function readPayload (json: Json): WebhookPayload {
  const root = objectAt(json, 'body')
  onlyKeys(root, ['text', 'blocks', 'color', 'thread_key', 'reply_broadcast'], '')
  const payload: WebhookPayload = { text: stringAt(root, 'text', MAX_TEXT_LENGTH, 'text'), blocks: readBlocks(root.blocks) }
  if (root.color !== undefined) payload.color = readColorField(root.color)
  if (root.thread_key !== undefined) payload.threadKey = stringAt(root, 'thread_key', MAX_THREAD_KEY_LENGTH, 'thread_key')
  if (root.reply_broadcast !== undefined) {
    if (typeof root.reply_broadcast !== 'boolean') throw new PayloadRejection('invalid_type', 'reply_broadcast')
    payload.replyBroadcast = root.reply_broadcast
  }
  return payload
}

export function parsePayload (body: string): ParsedPayload {
  let json: Json
  try {
    // JSON.parse only ever yields values of the Json union.
    json = JSON.parse(body) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return { isValid: false, error: 'invalid_json', field: 'body' }
    throw error
  }
  try {
    return { isValid: true, payload: readPayload(json) }
  } catch (error) {
    if (error instanceof PayloadRejection) return { isValid: false, error: error.error, field: error.field }
    throw error
  }
}
