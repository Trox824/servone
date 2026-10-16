import { parseCsv } from './csv'
import type { DocImport, ExportFile, ImportBundle } from './types'
import { decodeText, readZip } from './zip'

const NOTION_ID = /\s?(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

interface PageNode {
  doc: DocImport
  key: string
}

export function parseNotion (file: ExportFile): ImportBundle {
  const entries = expandZips(readZip(file.bytes))
  const pages = new Map<string, PageNode>()
  let attachments = 0

  for (const [path, bytes] of entries) {
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    if (extension !== 'md' && extension !== 'csv') {
      attachments++
      continue
    }
    const isFullTable = path.endsWith('_all.csv')
    const key = path.replace(/(_all)?\.(md|csv)$/i, '')
    if (pages.has(key) && extension === 'csv' && !isFullTable) continue
    const title = stripId(key.slice(key.lastIndexOf('/') + 1))
    const text = decodeText(bytes)
    const markdown = extension === 'md' ? pageMarkdown(text, title) : csvTable(text)
    pages.set(key, { key, doc: { title, markdown, children: [] } })
  }

  const roots: DocImport[] = []
  for (const page of pages.values()) {
    const parent = findParent(page.key, pages)
    if (parent === undefined) roots.push(page.doc)
    else parent.doc.children.push(page.doc)
  }
  sortTree(roots)

  const warnings = attachments > 0 ? [`${attachments} images and attachments were not imported`] : []
  const teamspaces = roots.length > 0 ? [{ name: 'Notion', docs: roots }] : []
  return { projects: [], channels: [], teamspaces, warnings }
}

function expandZips (entries: Map<string, Uint8Array>): Map<string, Uint8Array> {
  const expanded = new Map<string, Uint8Array>()
  for (const [path, bytes] of entries) {
    if (path.toLowerCase().endsWith('.zip')) {
      for (const [innerPath, innerBytes] of expandZips(readZip(bytes))) expanded.set(innerPath, innerBytes)
    } else {
      expanded.set(path, bytes)
    }
  }
  return expanded
}

function findParent (key: string, pages: Map<string, PageNode>): PageNode | undefined {
  let folder = key
  while (folder.includes('/')) {
    folder = folder.slice(0, folder.lastIndexOf('/'))
    const parent = pages.get(folder)
    if (parent !== undefined) return parent
  }
  return undefined
}

function stripId (name: string): string {
  const stripped = name.replace(NOTION_ID, '').trim()
  return stripped !== '' ? stripped : 'Untitled'
}

function pageMarkdown (text: string, title: string): string {
  const lines = text.split(/\r?\n/)
  const body = lines[0]?.trim() === `# ${title}` ? lines.slice(1).join('\n').replace(/^\s*\n/, '') : text
  return body.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, alt: string, target: string) => {
    const fileName = target.slice(target.lastIndexOf('/') + 1).replace(/%20/g, ' ')
    return `[image: ${alt !== '' ? alt : fileName}]`
  })
}

function csvTable (text: string): string {
  const [header, ...rows] = parseCsv(text)
  if (header === undefined) return ''
  const cell = (raw: string | undefined): string => (raw ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const line = (row: string[]): string => `| ${header.map((_, index) => cell(row[index])).join(' | ')} |`
  return [line(header), `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n')
}

function sortTree (docs: DocImport[]): void {
  docs.sort((a, b) => a.title.localeCompare(b.title))
  for (const doc of docs) sortTree(doc.children)
}
