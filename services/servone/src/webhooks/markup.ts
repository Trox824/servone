// Webhook text is untrusted: parse markdown, then keep only a whitelist of nodes and marks.
import { type Markup } from '@hcengineering/core'
import {
  type Attrs,
  isEmptyMarkup,
  jsonToMarkup,
  type MarkupMark,
  MarkupMarkType,
  type MarkupNode,
  MarkupNodeType
} from '@hcengineering/text-core'
import { MarkdownParser } from '@hcengineering/text-markdown'
import contact from '@hcengineering/contact'
import { TEAM_MENTION_ATTR } from '@servone/notify-rules'
import { randomUUID } from 'crypto'
import { type MentionLookup, mentionText, MENTION_TOKEN_PATTERN, type ResolvedMention } from './mentions'
import type { Block, WebhookPayload } from './payload'

// Webhook text never carries references; mentions come only from tokens the hook is allowed to resolve.
// Markers carry resolved tokens through markdown parsing. The per-call nonce matters: the parser decodes
// entities like &#xE000;, so a fixed marker could be forged from the payload text.
const MARKER_OPEN = '\uE000'
const MARKER_CLOSE = '\uE001'
const BLOCK_HEADING_LEVEL = 3
const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:']
const CODE_LANGUAGE_PATTERN = /^[\w+#.-]{1,30}$/

const INLINE_MARKS = new Set<string>([MarkupMarkType.bold, MarkupMarkType.em, MarkupMarkType.strike, MarkupMarkType.code])

// Inline HTML reaches the parser with comments rewritten to <comment> tags; undo that so it reads as typed.
function htmlAsText (html: string): MarkupNode {
  const text = html.replaceAll('<comment>', '<!--').replaceAll('</comment>', '-->')
  return { type: MarkupNodeType.doc, content: [{ type: MarkupNodeType.paragraph, content: [textNode(text)] }] }
}

const parser = new MarkdownParser({ refUrl: 'ref://', imageUrl: 'image://', htmlParser: htmlAsText })

function textNode (text: string, marks: MarkupMark[] = []): MarkupNode {
  return marks.length > 0 ? { type: MarkupNodeType.text, text, marks } : { type: MarkupNodeType.text, text }
}

function paragraph (content: MarkupNode[]): MarkupNode {
  return { type: MarkupNodeType.paragraph, content }
}

export function safeLinkHref (href: string): string | undefined {
  if (!URL.canParse(href)) return undefined
  const url = new URL(href)
  return LINK_PROTOCOLS.includes(url.protocol) ? url.toString() : undefined
}

function stringAttr (attrs: Attrs | undefined, name: string): string | undefined {
  const raw = attrs?.[name]
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function isTeamMention (node: MarkupNode): boolean {
  return node.attrs?.[TEAM_MENTION_ATTR] !== undefined
}

function plainText (node: MarkupNode): string {
  if (node.type === MarkupNodeType.text) return node.text ?? ''
  return (node.content ?? []).map(plainText).join('')
}

function keptMarks (marks: MarkupMark[] | undefined): MarkupMark[] {
  const kept: MarkupMark[] = []
  for (const mark of marks ?? []) {
    if (INLINE_MARKS.has(mark.type)) {
      kept.push({ type: mark.type })
      continue
    }
    if (mark.type !== MarkupMarkType.link) continue
    const href = safeLinkHref(stringAttr(mark.attrs, 'href') ?? '')
    if (href !== undefined) kept.push({ type: MarkupMarkType.link, attrs: { href } })
  }
  return kept
}

function sanitizeInline (nodes: MarkupNode[] | undefined): MarkupNode[] {
  const out: MarkupNode[] = []
  for (const node of nodes ?? []) {
    if (isTeamMention(node)) continue
    switch (node.type) {
      case MarkupNodeType.text:
        if ((node.text ?? '') !== '') out.push(textNode(node.text ?? '', keptMarks(node.marks)))
        break
      case MarkupNodeType.hard_break:
        out.push({ type: MarkupNodeType.hard_break })
        break
      case MarkupNodeType.reference: {
        const label = stringAttr(node.attrs, 'label') ?? plainText(node)
        if (label !== '') out.push(textNode(label))
        break
      }
      case MarkupNodeType.image: {
        const src = safeLinkHref(stringAttr(node.attrs, 'src') ?? '')
        const alt = stringAttr(node.attrs, 'alt')
        if (src !== undefined) out.push(textNode(alt ?? src, [{ type: MarkupMarkType.link, attrs: { href: src } }]))
        else if (alt !== undefined) out.push(textNode(alt))
        break
      }
      case MarkupNodeType.comment:
        break
      default:
        out.push(...sanitizeInline(node.content))
    }
  }
  return out
}

function listItems (nodes: MarkupNode[] | undefined): MarkupNode[] {
  const items: MarkupNode[] = []
  for (const node of nodes ?? []) {
    if (isTeamMention(node)) continue
    items.push({ type: MarkupNodeType.list_item, content: sanitizeBlocks(node.content) })
  }
  return items
}

const BLOCK_TYPES = new Set<string>([
  MarkupNodeType.paragraph,
  MarkupNodeType.heading,
  MarkupNodeType.code_block,
  MarkupNodeType.blockquote,
  MarkupNodeType.bullet_list,
  MarkupNodeType.ordered_list,
  MarkupNodeType.list_item,
  MarkupNodeType.horizontal_rule,
  MarkupNodeType.taskList,
  MarkupNodeType.taskItem,
  MarkupNodeType.todoList,
  MarkupNodeType.todoItem,
  MarkupNodeType.table,
  MarkupNodeType.table_row,
  MarkupNodeType.table_cell,
  MarkupNodeType.table_header,
  MarkupNodeType.mermaid
])

function hasBlockChildren (node: MarkupNode): boolean {
  return (node.content ?? []).some((child) => BLOCK_TYPES.has(child.type))
}

function sanitizeBlocks (nodes: MarkupNode[] | undefined): MarkupNode[] {
  const out: MarkupNode[] = []
  for (const node of nodes ?? []) {
    if (isTeamMention(node)) continue
    switch (node.type) {
      case MarkupNodeType.paragraph:
        out.push(paragraph(sanitizeInline(node.content)))
        break
      case MarkupNodeType.heading: {
        const level = node.attrs?.level
        const safeLevel = typeof level === 'number' && level >= 1 && level <= 6 ? level : BLOCK_HEADING_LEVEL
        out.push({ type: MarkupNodeType.heading, attrs: { level: safeLevel }, content: sanitizeInline(node.content) })
        break
      }
      case MarkupNodeType.code_block: {
        const language = stringAttr(node.attrs, 'language')
        const text = plainText(node)
        out.push({
          type: MarkupNodeType.code_block,
          attrs: { language: language !== undefined && CODE_LANGUAGE_PATTERN.test(language) ? language : '' },
          content: text === '' ? [] : [textNode(text)]
        })
        break
      }
      case MarkupNodeType.blockquote:
        out.push({ type: MarkupNodeType.blockquote, content: sanitizeBlocks(node.content) })
        break
      case MarkupNodeType.bullet_list:
        out.push({ type: MarkupNodeType.bullet_list, content: listItems(node.content) })
        break
      case MarkupNodeType.ordered_list: {
        const order = stringAttr(node.attrs, 'order')
        out.push({
          type: MarkupNodeType.ordered_list,
          attrs: { order: order !== undefined && /^\d{1,9}$/.test(order) ? order : '1' },
          content: listItems(node.content)
        })
        break
      }
      case MarkupNodeType.horizontal_rule:
        out.push({ type: MarkupNodeType.horizontal_rule })
        break
      case MarkupNodeType.comment:
        break
      default:
        if (hasBlockChildren(node)) {
          out.push(...sanitizeBlocks(node.content))
        } else {
          const inline = sanitizeInline([node])
          if (inline.length > 0) out.push(paragraph(inline))
        }
    }
  }
  return out
}

export function sanitizeMarkdown (markdown: string): MarkupNode[] {
  return sanitizeBlocks(parser.parse(markdown).content)
}

function renderBlock (block: Block): MarkupNode[] {
  switch (block.type) {
    case 'heading':
      return [{ type: MarkupNodeType.heading, attrs: { level: BLOCK_HEADING_LEVEL }, content: [textNode(block.text)] }]
    case 'fields':
      return block.fields.map((field) =>
        paragraph([textNode(`${field.label}:`, [{ type: MarkupMarkType.bold }]), textNode(` ${field.value}`)])
      )
    case 'button':
      return [paragraph([textNode(block.text, [{ type: MarkupMarkType.link, attrs: { href: block.url } }])])]
  }
}

interface MarkedText {
  marked: string
  split: RegExp
  tokens: string[]
  found: ResolvedMention[]
}

function markMentions (text: string, mentions: MentionLookup): MarkedText {
  const nonce = randomUUID()
  const tokens: string[] = []
  const found: ResolvedMention[] = []
  const marked = text.replace(MENTION_TOKEN_PATTERN, (token) => {
    const mention = mentions.get(token)
    if (mention === undefined) return mentionText(token)
    tokens.push(token)
    found.push(mention)
    return `${MARKER_OPEN}${nonce}:${found.length - 1}${MARKER_CLOSE}`
  })
  return { marked, split: new RegExp(`${MARKER_OPEN}${nonce}:(\\d+)${MARKER_CLOSE}`), tokens, found }
}

// Tokens inside code stay literal: code_block allows only text, and code is not meant to notify anyone.
function restoreTokens (text: string, placed: MarkedText): string {
  return text
    .split(placed.split)
    .map((part, i) => (i % 2 === 0 ? part : mentionText(placed.tokens[Number(part)])))
    .join('')
}

function mentionNodes (mention: ResolvedMention): MarkupNode[] {
  const reference: MarkupNode = {
    type: MarkupNodeType.reference,
    attrs: { id: mention.id, objectclass: mention.objectclass, label: mention.label }
  }
  const hidden: MarkupNode[] = mention.teamMembers.map((person) => ({
    type: MarkupNodeType.reference,
    attrs: { id: person, objectclass: contact.class.Person, label: '', [TEAM_MENTION_ATTR]: mention.id }
  }))
  return [reference, ...hidden]
}

function expandMentions (nodes: MarkupNode[], placed: MarkedText): MarkupNode[] {
  return nodes.flatMap((node) => {
    if (node.type === MarkupNodeType.code_block) {
      const content = (node.content ?? []).map((child) => textNode(restoreTokens(child.text ?? '', placed)))
      return [{ ...node, content }]
    }
    if (node.type !== MarkupNodeType.text) {
      return node.content === undefined ? [node] : [{ ...node, content: expandMentions(node.content, placed) }]
    }
    const text = node.text ?? ''
    if (!placed.split.test(text)) return [node]
    if ((node.marks ?? []).some((mark) => mark.type === MarkupMarkType.code)) {
      return [textNode(restoreTokens(text, placed), node.marks ?? [])]
    }
    return text.split(placed.split).flatMap((part, i) => {
      if (i % 2 === 0) return part === '' ? [] : [textNode(part, node.marks ?? [])]
      const mention = placed.found[Number(part)]
      return mention === undefined ? [] : mentionNodes(mention)
    })
  })
}

export function renderPayload (payload: WebhookPayload, mentions: MentionLookup): Markup | undefined {
  const placed = markMentions(payload.text, mentions)
  const content = [...expandMentions(sanitizeMarkdown(placed.marked), placed), ...payload.blocks.flatMap(renderBlock)]
  const markup = jsonToMarkup({ type: MarkupNodeType.doc, content })
  return isEmptyMarkup(markup) ? undefined : markup
}
