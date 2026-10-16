import type { Markup } from '@hcengineering/core'
import { jsonToMarkup, MarkupMarkType, type MarkupNode, MarkupNodeType } from '@hcengineering/text-core'

import { buildForwardMarkup } from '../forward/markup'
import { issueCopy } from './strings'

const MAX_TITLE_LENGTH = 100 // spec D3
const ELLIPSIS = '...'
const HTML_LINE_END = /<br\s*\/?>|<\/(p|div|li|h[1-6]|pre|blockquote)>/gi
const INLINE_PARENTS = new Set<string>([MarkupNodeType.paragraph, MarkupNodeType.heading, MarkupNodeType.code_block])

export interface MessageOrigin {
  kind: 'channel' | 'direct'
  name: string
}

export interface DraftSource {
  markup: Markup
  isWebhook: boolean
  origin: MessageOrigin
  author: string
  sentAt: string
  link: string
}

export interface IssueText {
  title: string
  description: Markup
}

function plainText (node: MarkupNode): string {
  if (node.type === MarkupNodeType.text) return node.text ?? ''
  if (node.type === MarkupNodeType.hard_break) return '\n'
  const joiner = INLINE_PARENTS.has(node.type) ? '' : '\n'
  return (node.content ?? []).map(plainText).join(joiner)
}

function htmlText (html: string): string {
  return new DOMParser().parseFromString(html.replace(HTML_LINE_END, '\n'), 'text/html').body.textContent ?? ''
}

function cleanLines (node: MarkupNode, isLegacy: boolean): string[] {
  const raw = isLegacy ? htmlText(plainText(node)) : plainText(node)
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
}

function titleLine (blocks: MarkupNode[], isLegacy: boolean): string | undefined {
  const hasText = (block: MarkupNode): boolean => cleanLines(block, isLegacy).length > 0
  const heading = blocks.find((block) => block.type === MarkupNodeType.heading && hasText(block))
  if (heading !== undefined) return cleanLines(heading, isLegacy).join(' ')
  const source = blocks.find((block) => block.type === MarkupNodeType.paragraph && hasText(block)) ?? blocks.find(hasText)
  return source === undefined ? undefined : cleanLines(source, isLegacy)[0]
}

function cutTitle (line: string): string {
  if (line.length <= MAX_TITLE_LENGTH) return line
  const room = line.slice(0, MAX_TITLE_LENGTH - ELLIPSIS.length)
  const lastSpace = room.lastIndexOf(' ')
  const isAtWordEnd = line[room.length] === ' '
  const cut = isAtWordEnd || lastSpace <= 0 ? room : room.slice(0, lastSpace)
  return `${cut.trimEnd()}${ELLIPSIS}`
}

function isFieldLine (block: MarkupNode): boolean {
  const first = block.content?.[0]
  return (
    block.type === MarkupNodeType.paragraph &&
    first?.type === MarkupNodeType.text &&
    (first.marks ?? []).some((mark) => mark.type === MarkupMarkType.bold) &&
    (first.text ?? '').endsWith(':')
  )
}

function listFields (blocks: MarkupNode[]): MarkupNode[] {
  const out: MarkupNode[] = []
  let fieldItems: MarkupNode[] | undefined
  for (const block of blocks) {
    if (!isFieldLine(block)) {
      fieldItems = undefined
      out.push(block)
      continue
    }
    if (fieldItems === undefined) {
      fieldItems = []
      out.push({ type: MarkupNodeType.bullet_list, content: fieldItems })
    }
    fieldItems.push({ type: MarkupNodeType.list_item, content: [block] })
  }
  return out
}

function originLine (source: DraftSource): MarkupNode {
  const where = source.origin.kind === 'channel' ? `#${source.origin.name}` : source.origin.name
  const line = [`${issueCopy.From} ${where}`, source.author, source.sentAt].join(' · ')
  return {
    type: MarkupNodeType.paragraph,
    content: [
      { type: MarkupNodeType.text, text: `${line} · ` },
      {
        type: MarkupNodeType.text,
        text: issueCopy.OpenMessage,
        marks: [{ type: MarkupMarkType.link, attrs: { href: source.link } }]
      }
    ]
  }
}

export function messageToDraft (source: DraftSource): IssueText {
  const quoted: MarkupNode = JSON.parse(buildForwardMarkup(source.markup, ''))
  const blocks = quoted.content?.[0]?.content ?? []
  const isLegacy = !source.markup.startsWith('{')
  const line = titleLine(blocks, isLegacy)
  const title = line === undefined ? `${issueCopy.MessageFrom} ${source.author}` : cutTitle(line)
  const body = source.isWebhook ? listFields(blocks) : blocks
  const content =
    line === undefined ? [originLine(source)] : [{ type: MarkupNodeType.blockquote, content: body }, originLine(source)]
  return { title, description: jsonToMarkup({ type: MarkupNodeType.doc, content }) }
}
