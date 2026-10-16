import { z } from 'zod'
import type { ApiCall, Connector, DocImport, Json, ScopeOption, TeamspaceImport } from '../types'
import { callApi } from './api'
import { htmlToMarkdown } from './html'
import { atlassianSites } from './jira'

const SPACE_LIMIT = 250
const PAGE_LIMIT = 100
const SCOPE_SEPARATOR = '/'
const LINK_BASE = 'https://confluence.invalid'
const PLACEHOLDER = /(\d+)/g
const MACRO = /<ac:structured-macro\b([^>]*?)(?:\/>|>((?:(?!<ac:structured-macro\b)[\s\S])*?)<\/ac:structured-macro>)/g
const QUOTE_MACROS = new Set(['info', 'note', 'warning', 'tip', 'panel'])
const CODE_MACROS = new Set(['code', 'noformat'])
const FILE_MACROS = new Set(['view-file', 'viewpdf', 'viewdoc', 'viewxls', 'viewppt', 'multimedia'])

const links = z.object({ next: z.string().optional() })

const spacesResponse = z.object({
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.string(),
    homepageId: z.string().nullish()
  })),
  _links: links
})

const pagesResponse = z.object({
  results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    parentId: z.string().nullish(),
    position: z.number().nullish(),
    body: z.object({ storage: z.object({ value: z.string() }).optional() }).optional()
  })),
  _links: links
})

interface ConfluenceSpace {
  cloudId: string
  siteName: string
  id: string
  name: string
  homepageId?: string
  isDefault: boolean
}

interface PageNode {
  id: string
  title: string
  markdown: string
  parentId?: string
  position: number
}

interface StorageStats {
  attachments: number
  macros: Set<string>
}

function scopeId (space: ConfluenceSpace): string {
  return `${space.cloudId}${SCOPE_SEPARATOR}${space.id}`
}

function nextCursor (next: string | undefined): string | undefined {
  return next === undefined ? undefined : new URL(next, LINK_BASE).searchParams.get('cursor') ?? undefined
}

async function pagedResults<T> (
  api: ApiCall,
  path: string,
  query: Array<[string, string]>,
  parse: (body: Json) => { results: T[], _links: { next?: string } },
  signal: AbortSignal,
  onPage: (count: number) => void = () => {}
): Promise<T[]> {
  const results: T[] = []
  let cursor: string | undefined
  do {
    const page = parse(await callApi(api, { method: 'GET', path, query: cursor === undefined ? query : [...query, ['cursor', cursor]] }, signal))
    results.push(...page.results)
    onPage(results.length)
    cursor = nextCursor(page._links.next)
  } while (cursor !== undefined)
  return results
}

async function listSpaces (api: ApiCall, signal: AbortSignal): Promise<ConfluenceSpace[]> {
  const spaces: ConfluenceSpace[] = []
  for (const site of await atlassianSites(api, signal)) {
    const results = await pagedResults(api, `/ex/confluence/${site.id}/wiki/api/v2/spaces`, [['limit', String(SPACE_LIMIT)]], (body) => spacesResponse.parse(body), signal)
    spaces.push(...results.map((space) => ({
      cloudId: site.id,
      siteName: site.name,
      id: space.id,
      name: space.name,
      homepageId: space.homepageId ?? undefined,
      isDefault: space.type !== 'personal' && space.status === 'current'
    })))
  }
  return spaces
}

function attribute (tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

function element (xml: string, name: string): string | undefined {
  return new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]
}

function escapeHtml (text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function storageToMarkdown (storage: string, stats: StorageStats): string {
  const stash: string[] = []
  const hold = (markdown: string): string => `${stash.push(markdown) - 1}`
  const file = (name: string | undefined): string => {
    stats.attachments++
    return hold(`[file: ${name ?? 'attachment'}]`)
  }

  let html = storage.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, text: string) => escapeHtml(text))
  for (let previous = ''; previous !== html;) {
    previous = html
    html = html.replace(MACRO, (_, attrs: string, inner: string | undefined) => {
      const name = attribute(attrs, 'ac:name') ?? 'macro'
      const body = inner ?? ''
      const parameter = (key: string): string | undefined => new RegExp(`<ac:parameter ac:name="${key}"[^>]*>([\\s\\S]*?)</ac:parameter>`).exec(body)?.[1]
      const richBody = element(body, 'ac:rich-text-body')
      if (CODE_MACROS.has(name)) {
        const language = parameter('language')
        return `<pre><code${language === undefined ? '' : ` class="language-${language}"`}>${element(body, 'ac:plain-text-body') ?? ''}</code></pre>`
      }
      if (QUOTE_MACROS.has(name)) return `<blockquote>${richBody ?? ''}</blockquote>`
      if (name === 'expand') return `<p><strong>${parameter('title') ?? 'Details'}</strong></p>${richBody ?? ''}`
      if (FILE_MACROS.has(name)) return `<p>${file(attribute(body, 'ri:filename'))}</p>`
      if (richBody !== undefined) return richBody
      stats.macros.add(name)
      return ''
    })
  }

  html = html
    .replace(/<ac:image\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ac:image>)/g, (_, attrs: string, inner: string | undefined) => {
      stats.attachments++
      const alt = attribute(attrs, 'ac:alt') ?? attribute(inner ?? '', 'ri:filename') ?? 'image'
      return hold(`[image: ${alt}]`)
    })
    .replace(/<ac:link\b[^>]*>([\s\S]*?)<\/ac:link>/g, (_, inner: string) => {
      const label = element(inner, 'ac:plain-text-link-body') ?? element(inner, 'ac:link-body')
      if (label !== undefined) return label
      if (inner.includes('<ri:user')) return '@user'
      if (inner.includes('<ri:attachment')) return file(attribute(inner, 'ri:filename'))
      return attribute(inner, 'ri:content-title') ?? ''
    })
    .replace(/<ac:task-list\b[^>]*>/g, '<ul>')
    .replace(/<\/ac:task-list>/g, '</ul>')
    .replace(/<ac:task\b[^>]*>([\s\S]*?)<\/ac:task>/g, (_, inner: string) => {
      const isDone = element(inner, 'ac:task-status') === 'complete'
      return `<li>${hold(isDone ? '[x]' : '[ ]')} ${element(inner, 'ac:task-body') ?? ''}</li>`
    })
    .replace(/<ac:emoticon\b([^>]*?)\/?>/g, (_, attrs: string) => attribute(attrs, 'ac:emoji-fallback') ?? '')
    .replace(/<time\b([^>]*?)\/?>(?:<\/time>)?/g, (_, attrs: string) => attribute(attrs, 'datetime') ?? '')
    .replace(/<ac:placeholder\b[^>]*>[\s\S]*?<\/ac:placeholder>/g, '')
    .replace(/<\/?(?:ac|ri):[^>]*>/g, '')

  return htmlToMarkdown(html).replace(PLACEHOLDER, (_, index: string) => stash[Number(index)])
}

function buildTree (pages: PageNode[], homepageId: string | undefined): DocImport[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const roots: PageNode[] = []
  const childrenOf = new Map<PageNode, PageNode[]>()
  for (const page of pages) {
    const parent = page.parentId === undefined || page.parentId === homepageId ? undefined : byId.get(page.parentId)
    if (parent === undefined) roots.push(page)
    else childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), page])
  }
  const toDocs = (nodes: PageNode[]): DocImport[] => nodes
    .sort((a, b) => a.position - b.position)
    .map((node) => ({ title: node.title, markdown: node.markdown, children: toDocs(childrenOf.get(node) ?? []) }))
  return toDocs(roots)
}

export const confluenceConnector: Connector = {
  async listScopes (api) {
    const spaces = await listSpaces(api, new AbortController().signal)
    return spaces.map((space): ScopeOption => ({
      id: scopeId(space),
      name: space.name,
      kind: 'space',
      parentName: space.siteName,
      isSelected: space.isDefault
    }))
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const selected = new Set(scopeIds)
    const spaces = (await listSpaces(api, signal)).filter((space) => selected.has(scopeId(space)))
    const stats: StorageStats = { attachments: 0, macros: new Set() }
    const teamspaces: TeamspaceImport[] = []
    for (const space of spaces) {
      const results = await pagedResults(
        api,
        `/ex/confluence/${space.cloudId}/wiki/api/v2/spaces/${space.id}/pages`,
        [['body-format', 'storage'], ['status', 'current'], ['limit', String(PAGE_LIMIT)]],
        (body) => pagesResponse.parse(body),
        signal,
        (count) => { onProgress({ label: space.name, count }) }
      )
      const pages = results.map((page): PageNode => ({
        id: page.id,
        title: page.title,
        markdown: storageToMarkdown(page.body?.storage?.value ?? '', stats),
        parentId: page.parentId ?? undefined,
        position: page.position ?? 0
      }))
      teamspaces.push({ name: space.name, docs: buildTree(pages, space.homepageId) })
    }
    const warnings: string[] = []
    if (stats.attachments > 0) warnings.push(`${stats.attachments} images and attachments were not imported`)
    if (stats.macros.size > 0) warnings.push(`Confluence macros were left out: ${[...stats.macros].sort().join(', ')}`)
    return { projects: [], channels: [], teamspaces, warnings }
  }
}
