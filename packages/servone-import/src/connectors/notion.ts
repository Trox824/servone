import { z } from 'zod'
import type { ApiCall, Connector, DocImport, ScopeOption } from '../types'
import { callApi } from './api'
import { ATTACHMENT_TYPES, blocksToMarkdown, notionBlock, richText, type BlockNode } from './notion-blocks'

const PAGE_SIZE = 100
const TEAMSPACE_NAME = 'Notion'

const page = z.object({
  id: z.string(),
  parent: z.object({ type: z.string(), page_id: z.string().optional() }),
  properties: z.record(z.string(), z.object({ type: z.string(), title: richText.optional() }))
})

const cursorFields = { has_more: z.boolean(), next_cursor: z.string().nullable() }
const searchPage = z.object({ results: z.array(page), ...cursorFields })
const blocksPage = z.object({ results: z.array(notionBlock), ...cursorFields })

type NotionPage = z.infer<typeof page>

function pageTitle (notionPage: NotionPage): string {
  const title = Object.values(notionPage.properties).find((property) => property.type === 'title')?.title ?? []
  const text = title.map((item) => item.plain_text).join('').trim()
  return text !== '' ? text : 'Untitled'
}

async function searchPages (api: ApiCall, signal: AbortSignal): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | null = null
  do {
    const search = { filter: { property: 'object', value: 'page' }, page_size: PAGE_SIZE }
    const body = cursor === null ? search : { ...search, start_cursor: cursor }
    const response = searchPage.parse(await callApi(api, { method: 'POST', path: '/v1/search', body }, signal))
    pages.push(...response.results)
    cursor = response.has_more ? response.next_cursor : null
  } while (cursor !== null)
  return pages
}

export const notionConnector: Connector = {
  async listScopes (api) {
    const pages = await searchPages(api, new AbortController().signal)
    const ids = new Set(pages.map((notionPage) => notionPage.id))
    return pages
      .filter((notionPage) => notionPage.parent.type === 'workspace' || (notionPage.parent.type === 'page_id' && !ids.has(notionPage.parent.page_id ?? '')))
      .map((notionPage): ScopeOption => ({ id: notionPage.id, name: pageTitle(notionPage), kind: 'page', isSelected: true }))
  },

  async fetch (api, scopeIds, onProgress, signal) {
    let docCount = 0
    let attachments = 0
    let databases = 0

    const loadBlocks = async (parentId: string, childPages: BlockNode[]): Promise<BlockNode[]> => {
      const nodes: BlockNode[] = []
      let cursor: string | null = null
      do {
        const query: Array<[string, string]> = [['page_size', String(PAGE_SIZE)]]
        if (cursor !== null) query.push(['start_cursor', cursor])
        const response = blocksPage.parse(await callApi(api, { method: 'GET', path: `/v1/blocks/${parentId}/children`, query }, signal))
        for (const block of response.results) {
          const node: BlockNode = { block, children: [] }
          if (block.type === 'child_page') childPages.push(node)
          else if (block.type === 'child_database') databases++
          else if (block.hasChildren) node.children = await loadBlocks(block.id, childPages)
          if (ATTACHMENT_TYPES.has(block.type)) attachments++
          nodes.push(node)
        }
        cursor = response.has_more ? response.next_cursor : null
      } while (cursor !== null)
      return nodes
    }

    const loadDoc = async (pageId: string, title: string, label: string): Promise<DocImport> => {
      const childPages: BlockNode[] = []
      const markdown = blocksToMarkdown(await loadBlocks(pageId, childPages))
      onProgress({ label, count: ++docCount })
      const children: DocImport[] = []
      for (const child of childPages) children.push(await loadDoc(child.block.id, child.block.content.title ?? 'Untitled', label))
      return { title, markdown, children }
    }

    const docs: DocImport[] = []
    for (const pageId of scopeIds) {
      const root = page.parse(await callApi(api, { method: 'GET', path: `/v1/pages/${pageId}` }, signal))
      const title = pageTitle(root)
      docs.push(await loadDoc(pageId, title, title))
    }

    const warnings: string[] = []
    if (databases > 0) warnings.push(`${databases} Notion databases were not imported`)
    if (attachments > 0) warnings.push(`${attachments} images and attachments were not imported`)
    return { projects: [], channels: [], teamspaces: docs.length > 0 ? [{ name: TEAMSPACE_NAME, docs }] : [], warnings }
  }
}
