import { teamAttr } from '../../../lib/team-mentions'

type AttrValue = string | number | boolean | null
interface MarkupMark {
  type: string
  attrs?: Record<string, AttrValue>
}
interface MarkupNode {
  type: string
  attrs?: Record<string, AttrValue>
  content?: MarkupNode[]
  marks?: MarkupMark[]
  text?: string
}

function textNode (text: string): MarkupNode {
  return { type: 'text', text }
}

function paragraph (text: string): MarkupNode {
  return text === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [textNode(text)] }
}

function isPlainText (node: MarkupNode): boolean {
  return node.type === 'text' && (node.marks === undefined || node.marks.length === 0)
}

function mergeText (nodes: MarkupNode[]): MarkupNode[] {
  const merged: MarkupNode[] = []
  for (const node of nodes) {
    const last = merged[merged.length - 1]
    if (last !== undefined && isPlainText(last) && isPlainText(node)) {
      merged[merged.length - 1] = textNode(`${last.text ?? ''}${node.text ?? ''}`)
    } else {
      merged.push(node)
    }
  }
  return merged
}

function flattenMentions (node: MarkupNode): MarkupNode[] {
  if (node.type === 'reference') {
    if (node.attrs?.[teamAttr] != null) return []
    const label = node.attrs?.label
    return typeof label === 'string' && label !== '' ? [textNode(`@${label}`)] : []
  }
  if (node.content === undefined) return [node]
  return [{ ...node, content: mergeText(node.content.flatMap(flattenMentions)) }]
}

function originalBlocks (original: string): MarkupNode[] {
  if (!original.startsWith('{')) return [paragraph(original)]
  const doc: MarkupNode = JSON.parse(original)
  const [flat] = flattenMentions(doc)
  const blocks = flat?.content ?? []
  return blocks.length > 0 ? blocks : [paragraph('')]
}

export function buildForwardMarkup (original: string, note: string): string {
  const noteBlocks = note
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(paragraph)
  const doc: MarkupNode = {
    type: 'doc',
    content: [...noteBlocks, { type: 'blockquote', content: originalBlocks(original) }]
  }
  return JSON.stringify(doc)
}
