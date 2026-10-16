import { z } from 'zod'

const optionalString = z.string().optional().catch(undefined)
const optionalNumber = z.number().optional().catch(undefined)

const adfAttrs = z.object({
  level: optionalNumber,
  order: optionalNumber,
  language: optionalString,
  text: optionalString,
  shortName: optionalString,
  url: optionalString,
  href: optionalString,
  alt: optionalString,
  name: optionalString,
  state: optionalString,
  title: optionalString,
  timestamp: z.union([z.string(), z.number()]).optional().catch(undefined)
})

const adfMark = z.object({
  type: z.string(),
  attrs: adfAttrs.optional().catch(undefined)
})

export interface AdfNode {
  type: string
  text?: string
  attrs?: z.infer<typeof adfAttrs>
  marks?: Array<z.infer<typeof adfMark>>
  content?: AdfNode[]
}

export const adfNode: z.ZodType<AdfNode> = z.object({
  type: z.string(),
  text: z.string().optional(),
  attrs: adfAttrs.optional().catch(undefined),
  marks: z.array(adfMark).optional(),
  get content () {
    return z.array(adfNode).optional()
  }
})

const INLINE_MARKS = new Map([
  ['strong', '**'],
  ['em', '*'],
  ['strike', '~~'],
  ['code', '`']
])

function markText (node: AdfNode): string {
  let text = node.text ?? ''
  if (text === '') return ''
  for (const mark of node.marks ?? []) {
    const wrap = INLINE_MARKS.get(mark.type)
    if (wrap !== undefined) text = `${wrap}${text}${wrap}`
    else if (mark.type === 'link' && mark.attrs?.href !== undefined) text = `[${text}](${mark.attrs.href})`
  }
  return text
}

function inline (nodes: AdfNode[] | undefined): string {
  return (nodes ?? []).map(inlineNode).join('')
}

function inlineNode (node: AdfNode): string {
  const attrs = node.attrs
  switch (node.type) {
    case 'text':
      return markText(node)
    case 'hardBreak':
      return '\n'
    case 'mention':
      return attrs?.text?.startsWith('@') === true ? attrs.text : `@${attrs?.text ?? 'someone'}`
    case 'emoji':
      return attrs?.text ?? attrs?.shortName ?? ''
    case 'inlineCard':
      return attrs?.url ?? ''
    case 'status':
      return `[${attrs?.text ?? ''}]`
    case 'date': {
      const ms = Number(attrs?.timestamp)
      return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
    }
    case 'mediaInline':
      return `[file: ${attrs?.name ?? 'attachment'}]`
    default:
      return inline(node.content)
  }
}

function indent (text: string, prefix: string): string {
  return text.replace(/\n(?=.)/g, `\n${' '.repeat(prefix.length)}`)
}

function listItems (node: AdfNode, marker: (index: number) => string): string {
  return (node.content ?? [])
    .map((item, index) => {
      const prefix = marker(index)
      return `${prefix}${indent(blocks(item.content, '\n'), prefix)}`
    })
    .join('\n')
}

function media (node: AdfNode): string {
  return `[image: ${node.attrs?.alt ?? node.attrs?.name ?? 'image'}]`
}

function block (node: AdfNode): string {
  const attrs = node.attrs
  switch (node.type) {
    case 'paragraph':
      return inline(node.content)
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(attrs?.level ?? 1, 1), 6))} ${inline(node.content)}`
    case 'bulletList':
      return listItems(node, () => '- ')
    case 'orderedList':
      return listItems(node, (index) => `${(attrs?.order ?? 1) + index}. `)
    case 'taskList':
      return (node.content ?? [])
        .map((item) => item.type === 'taskList' ? block(item).replace(/^/gm, '  ') : `- [${item.attrs?.state === 'DONE' ? 'x' : ' '}] ${inline(item.content)}`)
        .join('\n')
    case 'decisionList':
      return (node.content ?? []).map((item) => `- ${inline(item.content)}`).join('\n')
    case 'codeBlock':
      return `\`\`\`${attrs?.language ?? ''}\n${(node.content ?? []).map((part) => part.text ?? '').join('')}\n\`\`\``
    case 'blockquote':
    case 'panel':
      return blocks(node.content).split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')
    case 'rule':
      return '---'
    case 'expand':
    case 'nestedExpand':
      return blocks([{ type: 'paragraph', content: [{ type: 'text', text: attrs?.title ?? '', marks: [{ type: 'strong' }] }] }, ...(node.content ?? [])])
    case 'mediaSingle':
    case 'mediaGroup':
      return (node.content ?? []).map((child) => child.type === 'media' ? media(child) : '').filter((text) => text !== '').join('\n')
    case 'media':
      return media(node)
    case 'blockCard':
    case 'embedCard':
      return attrs?.url ?? ''
    case 'table':
      return table(node)
    default:
      return node.content === undefined ? inlineNode(node) : blocks(node.content)
  }
}

function table (node: AdfNode): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => blocks(cell.content, ' ').replace(/\n/g, ' ').replace(/\|/g, '\\|')))
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const line = (cells: string[]): string => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

function blocks (nodes: AdfNode[] | undefined, separator = '\n\n'): string {
  return (nodes ?? []).map(block).filter((text) => text.trim() !== '').join(separator)
}

export function adfToMarkdown (doc: AdfNode | null | undefined): string {
  return doc === null || doc === undefined ? '' : blocks(doc.type === 'doc' ? doc.content : [doc]).trim()
}
