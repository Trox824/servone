// Slack incoming-webhook bodies. Lenient on purpose: unsupported parts are dropped and oversize parts cut, as Slack does.
import type { Json } from '../http-json'
import {
  type Block,
  isObject,
  type JsonObject,
  type Field,
  MAX_BLOCKS,
  MAX_BUTTON_TEXT_LENGTH,
  MAX_BUTTON_URL_LENGTH,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FIELD_VALUE_LENGTH,
  MAX_FIELDS,
  MAX_HEADING_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_THREAD_KEY_LENGTH,
  type MessageColor,
  readColor,
  type WebhookPayload
} from './payload'

export type SlackError = 'invalid_payload' | 'no_text'
export type ParsedSlack = { isValid: true, payload: WebhookPayload } | { isValid: false, error: SlackError }

interface Draft {
  paragraphs: string[]
  fields: Field[]
  buttons: Block[]
}

const ELLIPSIS = '…'
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'
const SLACK_TOKEN = /<([^<>\s][^<>]*)>/g
const CODE_SPAN = /(```[\s\S]*?```|`[^`\n]+`)/
const MARKDOWN_SPECIAL = /([\\`*_[\]#<>~|])/g

function objects (json: Json | undefined): JsonObject[] {
  return Array.isArray(json) ? json.filter(isObject) : []
}

function stringOf (json: Json | undefined): string | undefined {
  return typeof json === 'string' && json.trim() !== '' ? json : undefined
}

function clip (text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}${ELLIPSIS}`
}

function escapeMarkdown (text: string): string {
  return text.replace(MARKDOWN_SPECIAL, '\\$1')
}

// Slack escapes only &, < and > in text.
function decodeEntities (text: string): string {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

function convertEmphasis (text: string): string {
  return text
    .split(CODE_SPAN)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
          .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1**$2**')
          .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1*$2*')
          .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?:;])/g, '$1~~$2~~')
    )
    .join('')
}

export function mrkdwnToMarkdown (mrkdwn: string): string {
  const linked = mrkdwn.replace(SLACK_TOKEN, (token, inner: string) => {
    // Mention tokens are resolved later, in markup.ts.
    if (inner.startsWith('@') || inner.startsWith('!')) return token
    const bar = inner.indexOf('|')
    const url = bar === -1 ? inner : inner.slice(0, bar)
    const label = bar === -1 ? '' : inner.slice(bar + 1)
    if (url.startsWith('#')) return label === '' ? url : `#${label}`
    return label === '' ? url : `[${label}](${url})`
  })
  return decodeEntities(convertEmphasis(linked))
}

function textObject (json: Json | undefined): string | undefined {
  if (!isObject(json)) return undefined
  const text = stringOf(json.text)
  if (text === undefined) return undefined
  return json.type === 'mrkdwn' ? mrkdwnToMarkdown(text) : escapeMarkdown(text)
}

function isHttpsUrl (raw: string): boolean {
  return raw.length <= MAX_BUTTON_URL_LENGTH && URL.canParse(raw) && new URL(raw).protocol === 'https:'
}

function readButton (element: JsonObject, draft: Draft): void {
  if (element.type !== 'button') return
  const url = stringOf(element.url)
  const text = isObject(element.text) ? stringOf(element.text.text) : undefined
  if (url === undefined || text === undefined || !isHttpsUrl(url)) return
  draft.buttons.push({ type: 'button', text: clip(text, MAX_BUTTON_TEXT_LENGTH), url: new URL(url).toString() })
}

function addField (label: string, fieldValue: string, draft: Draft): void {
  draft.fields.push({
    label: clip(label, MAX_FIELD_LABEL_LENGTH),
    value: clip(decodeEntities(fieldValue), MAX_FIELD_VALUE_LENGTH)
  })
}

// Section fields are mrkdwn like "*Label*\nvalue"; without a label line they read as text.
function readSectionField (element: JsonObject, draft: Draft): void {
  const raw = stringOf(element.text)
  if (raw === undefined) return
  const newline = raw.indexOf('\n')
  const label = newline === -1 ? '' : raw.slice(0, newline).replace(/^\*(.+)\*$/, '$1').trim()
  const fieldValue = newline === -1 ? '' : raw.slice(newline + 1).trim()
  if (label === '' || fieldValue === '') {
    const text = textObject(element)
    if (text !== undefined) draft.paragraphs.push(text)
    return
  }
  addField(label, fieldValue, draft)
}

function readBlocks (blocks: JsonObject[], draft: Draft): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'header': {
        const text = isObject(block.text) ? stringOf(block.text.text) : undefined
        if (text !== undefined) draft.paragraphs.push(`### ${escapeMarkdown(clip(text, MAX_HEADING_LENGTH))}`)
        break
      }
      case 'section': {
        const text = textObject(block.text)
        if (text !== undefined) draft.paragraphs.push(text)
        for (const field of objects(block.fields)) readSectionField(field, draft)
        if (isObject(block.accessory)) readButton(block.accessory, draft)
        break
      }
      case 'context': {
        const parts = objects(block.elements)
          .map(textObject)
          .filter((part): part is string => part !== undefined)
        if (parts.length > 0) draft.paragraphs.push(parts.join('  '))
        break
      }
      case 'divider':
        draft.paragraphs.push('---')
        break
      case 'actions':
        for (const element of objects(block.elements)) readButton(element, draft)
        break
    }
  }
}

function readAttachment (attachment: JsonObject, draft: Draft): void {
  const pretext = stringOf(attachment.pretext)
  if (pretext !== undefined) draft.paragraphs.push(mrkdwnToMarkdown(pretext))
  const title = stringOf(attachment.title)
  if (title !== undefined) {
    const heading = escapeMarkdown(clip(title, MAX_HEADING_LENGTH))
    const link = stringOf(attachment.title_link)
    draft.paragraphs.push(link === undefined ? `### ${heading}` : `### [${heading}](${link})`)
  }
  const text = stringOf(attachment.text)
  if (text !== undefined) draft.paragraphs.push(mrkdwnToMarkdown(text))
  for (const field of objects(attachment.fields)) {
    const label = stringOf(field.title)
    const fieldValue = stringOf(field.value)
    if (label !== undefined && fieldValue !== undefined) addField(label, fieldValue, draft)
    else if (fieldValue !== undefined) draft.paragraphs.push(mrkdwnToMarkdown(fieldValue))
  }
  readBlocks(objects(attachment.blocks), draft)
  const footer = stringOf(attachment.footer)
  if (footer !== undefined) draft.paragraphs.push(mrkdwnToMarkdown(footer))
}

// Slack accepts hex with or without the leading #.
function slackColor (raw: string | undefined): MessageColor | undefined {
  if (raw === undefined) return undefined
  return readColor(raw) ?? readColor(`#${raw}`)
}

function readJson (body: string, contentType: string | undefined): Json | undefined {
  const raw = contentType?.startsWith(FORM_CONTENT_TYPE) === true ? new URLSearchParams(body).get('payload') : body
  if (raw === null) return undefined
  try {
    // JSON.parse only ever yields values of the Json union.
    return JSON.parse(raw) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function isEmptyDraft (draft: Draft): boolean {
  return draft.paragraphs.length === 0 && draft.fields.length === 0 && draft.buttons.length === 0
}

export function parseSlackBody (body: string, contentType: string | undefined): ParsedSlack {
  const json = readJson(body, contentType)
  if (!isObject(json)) return { isValid: false, error: 'invalid_payload' }

  const draft: Draft = { paragraphs: [], fields: [], buttons: [] }
  readBlocks(objects(json.blocks), draft)
  // With rendered blocks, Slack shows top-level text only in notifications.
  const text = stringOf(json.text)
  if (text !== undefined && isEmptyDraft(draft)) draft.paragraphs.push(mrkdwnToMarkdown(text))
  for (const attachment of objects(json.attachments)) readAttachment(attachment, draft)

  const blocks: Block[] = []
  for (let start = 0; start < draft.fields.length; start += MAX_FIELDS) {
    blocks.push({ type: 'fields', fields: draft.fields.slice(start, start + MAX_FIELDS) })
  }
  blocks.push(...draft.buttons)
  const markdown = clip(draft.paragraphs.join('\n\n'), MAX_TEXT_LENGTH)
  if (markdown.trim() === '' && blocks.length === 0) return { isValid: false, error: 'no_text' }
  const payload: WebhookPayload = { text: markdown, blocks: blocks.slice(0, MAX_BLOCKS) }
  const color = slackColor(stringOf(objects(json.attachments)[0]?.color))
  if (color !== undefined) payload.color = color
  const threadKey = stringOf(json.thread_key)
  if (threadKey !== undefined && threadKey.length <= MAX_THREAD_KEY_LENGTH) payload.threadKey = threadKey
  if (typeof json.reply_broadcast === 'boolean') payload.replyBroadcast = json.reply_broadcast
  return { isValid: true, payload }
}
