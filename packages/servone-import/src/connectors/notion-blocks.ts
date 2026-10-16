import { z } from 'zod'

const richTextItem = z.object({
  plain_text: z.string(),
  href: z.string().nullish(),
  annotations: z.object({ bold: z.boolean(), italic: z.boolean(), strikethrough: z.boolean(), code: z.boolean() }).optional()
})

export const richText = z.array(richTextItem)

const fileSource = z.object({ url: z.string() })

const blockContent = z.object({
  rich_text: richText.optional(),
  caption: richText.optional(),
  checked: z.boolean().optional(),
  language: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  expression: z.string().optional(),
  icon: z.object({ emoji: z.string().optional() }).nullish(),
  cells: z.array(richText).optional(),
  external: fileSource.optional(),
  file: fileSource.optional()
})

export const notionBlock = z
  .looseObject({ id: z.string(), type: z.string(), has_children: z.boolean() })
  .transform((raw) => ({ id: raw.id, type: raw.type, hasChildren: raw.has_children, content: blockContent.parse(raw[raw.type] ?? {}) }))

export type NotionBlock = z.infer<typeof notionBlock>

export interface BlockNode {
  block: NotionBlock
  children: BlockNode[]
}

export const ATTACHMENT_TYPES = new Set(['image', 'file', 'pdf', 'video', 'audio'])
const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle'])
const HEADING = /^heading_([1-3])$/

export function richTextMarkdown (items: z.infer<typeof richText>): string {
  return items.map((item) => {
    const marks = item.annotations
    let text = item.plain_text
    if (marks?.code === true) text = `\`${text}\``
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? ['', '', text, '']
    let wrapped = core
    if (core !== '' && marks?.code !== true) {
      if (marks?.bold === true) wrapped = `**${wrapped}**`
      if (marks?.italic === true) wrapped = `*${wrapped}*`
      if (marks?.strikethrough === true) wrapped = `~~${wrapped}~~`
    }
    if (item.href != null && core !== '') wrapped = `[${wrapped}](${item.href})`
    return `${lead}${wrapped}${trail}`
  }).join('')
}

function indent (text: string, prefix: string): string {
  return text.split('\n').map((line) => (line === '' ? line : `${prefix}${line}`)).join('\n')
}

function listItem (marker: string, text: string, children: BlockNode[]): string {
  const nested = blocksToMarkdown(children)
  return nested === '' ? `${marker}${text}` : `${marker}${text}\n${indent(nested, ' '.repeat(marker.length))}`
}

function fileName (block: NotionBlock): string {
  const caption = richTextMarkdown(block.content.caption ?? [])
  if (caption !== '') return caption
  if (block.content.name !== undefined && block.content.name !== '') return block.content.name
  const url = block.content.file?.url ?? block.content.external?.url ?? ''
  const path = url.split('?')[0]
  const base = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
  return base !== '' ? base : block.type
}

function quote (text: string): string {
  return text.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')
}

function tableMarkdown (rows: BlockNode[]): string {
  const lines = rows.map((row) => `| ${(row.block.content.cells ?? []).map((cell) => richTextMarkdown(cell).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)
  if (lines.length === 0) return ''
  const width = rows[0].block.content.cells?.length ?? 0
  return [lines[0], `|${' --- |'.repeat(width)}`, ...lines.slice(1)].join('\n')
}

function blockMarkdown (node: BlockNode, number: number): string {
  const { block, children } = node
  const text = richTextMarkdown(block.content.rich_text ?? [])
  const withChildren = (head: string): string => [head, blocksToMarkdown(children)].filter((part) => part !== '').join('\n\n')
  const heading = HEADING.exec(block.type)
  if (heading !== null) return withChildren(`${'#'.repeat(Number(heading[1]))} ${text}`)
  switch (block.type) {
    case 'bulleted_list_item':
    case 'toggle':
      return listItem('- ', text, children)
    case 'numbered_list_item':
      return listItem(`${number}. `, text, children)
    case 'to_do':
      return listItem(`- [${block.content.checked === true ? 'x' : ' '}] `, text, children)
    case 'quote':
      return quote(withChildren(text))
    case 'callout':
      return quote(withChildren([block.content.icon?.emoji, text].filter((part) => part !== undefined && part !== '').join(' ')))
    case 'code':
      return `\`\`\`${block.content.language === 'plain text' ? '' : block.content.language ?? ''}\n${(block.content.rich_text ?? []).map((item) => item.plain_text).join('')}\n\`\`\``
    case 'equation':
      return `$$${block.content.expression ?? ''}$$`
    case 'divider':
      return '---'
    case 'table':
      return tableMarkdown(children)
    case 'bookmark':
    case 'link_preview':
    case 'embed': {
      const url = block.content.url ?? ''
      const caption = richTextMarkdown(block.content.caption ?? [])
      return url === '' ? '' : `[${caption !== '' ? caption : url}](${url})`
    }
    case 'image':
      return `[image: ${fileName(block)}]`
    case 'file':
    case 'pdf':
    case 'video':
    case 'audio':
      return `[file: ${fileName(block)}]`
    case 'child_database':
      return `[database: ${block.content.title ?? 'Untitled'}]`
    case 'child_page':
    case 'table_of_contents':
    case 'breadcrumb':
    case 'link_to_page':
    case 'unsupported':
      return ''
    default:
      return withChildren(text)
  }
}

export function blocksToMarkdown (nodes: BlockNode[]): string {
  let markdown = ''
  let number = 0
  let isPreviousList = false
  for (const node of nodes) {
    number = node.block.type === 'numbered_list_item' ? number + 1 : 0
    const text = blockMarkdown(node, number)
    if (text === '') continue
    const isList = LIST_TYPES.has(node.block.type)
    markdown += markdown === '' ? text : `${isList && isPreviousList ? '\n' : '\n\n'}${text}`
    isPreviousList = isList
  }
  return markdown
}
