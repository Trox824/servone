import { notionConnector } from '../../connectors/notion'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const plain = { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }

function text (content: string, annotations: Record<string, Json> = {}, href: string | null = null): Json {
  return { type: 'text', text: { content, link: href === null ? null : { url: href } }, annotations: { ...plain, ...annotations }, plain_text: content, href }
}

function block (id: string, type: string, content: Record<string, Json>, hasChildren = false): Json {
  return { object: 'block', id, type, has_children: hasChildren, archived: false, in_trash: false, created_by: { object: 'user', id: 'u' }, [type]: content }
}

function page (id: string, title: string, parent: Record<string, Json>): Json {
  return { object: 'page', id, parent, archived: false, in_trash: false, properties: { Tags: { id: 't', type: 'multi_select', multi_select: [] }, title: { id: 'title', type: 'title', title: [text(title)] } } }
}

const pages = [
  page('p1', 'Handbook', { type: 'workspace', workspace: true }),
  page('p2', 'Onboarding', { type: 'page_id', page_id: 'p1' }),
  page('p3', 'Orphan', { type: 'page_id', page_id: 'not-shared' }),
  page('p4', 'Row', { type: 'database_id', database_id: 'db1' }),
  page('p5', 'In a column', { type: 'block_id', block_id: 'b9' })
]

const children: Record<string, Json[][]> = {
  p1: [
    [
      block('b1', 'heading_1', { rich_text: [text('Welcome')], is_toggleable: false, color: 'default' }),
      block('b2', 'paragraph', { rich_text: [text('Read '), text('this ', { bold: true }), text('now', { italic: true }), text(' or '), text('npm i', { code: true }), text(' see '), text('docs', {}, 'https://x.dev'), text(' old', { strikethrough: true })] }),
      block('b3', 'bulleted_list_item', { rich_text: [text('Tools')] }, true),
      block('b4', 'numbered_list_item', { rich_text: [text('First')] }),
      block('b5', 'numbered_list_item', { rich_text: [text('Second')] }),
      block('b6', 'to_do', { rich_text: [text('Sign NDA')], checked: true })
    ],
    [
      block('b7', 'toggle', { rich_text: [text('FAQ')] }, true),
      block('b8', 'quote', { rich_text: [text('Be kind')] }),
      block('b9', 'callout', { rich_text: [text('Heads up')], icon: { type: 'emoji', emoji: '!' } }),
      block('b10', 'code', { rich_text: [text('let a = 1')], language: 'typescript', caption: [] }),
      block('b11', 'divider', {}),
      block('b12', 'table', { table_width: 2, has_column_header: true, has_row_header: false }, true),
      block('b13', 'bookmark', { url: 'https://huly.io', caption: [] }),
      block('b14', 'image', { type: 'file', file: { url: 'https://s3.aws/x/diagram%20v2.png?sig=1', expiry_time: '2024-01-01' }, caption: [] }),
      block('b15', 'child_database', { title: 'Tasks' }),
      block('b16', 'child_page', { title: 'Onboarding' }, true)
    ]
  ],
  b3: [[block('b3a', 'bulleted_list_item', { rich_text: [text('Laptop')] })]],
  b7: [[block('b7a', 'paragraph', { rich_text: [text('Answer')] })]],
  b12: [[
    block('r1', 'table_row', { cells: [[text('Name')], [text('Role')]] }),
    block('r2', 'table_row', { cells: [[text('Ann')], [text('Lead | PM')]] })
  ]],
  b16: [[block('c1', 'paragraph', { rich_text: [text('Child text')] })]]
}

function query (request: ApiRequest, name: string): string | undefined {
  return request.query?.find(([key]) => key === name)?.[1]
}

function route (request: ApiRequest): Json {
  if (request.method === 'POST' && request.path === '/v1/search') {
    return !JSON.stringify(request.body).includes('start_cursor')
      ? { object: 'list', results: pages.slice(0, 3), has_more: true, next_cursor: 'c2', type: 'page_or_data_source' }
      : { object: 'list', results: pages.slice(3), has_more: false, next_cursor: null, type: 'page_or_data_source' }
  }
  if (request.path === '/v1/pages/p1') return pages[0]
  const blockId = /^\/v1\/blocks\/([^/]+)\/children$/.exec(request.path)?.[1]
  if (blockId !== undefined) {
    const batches = children[blockId]
    const index = Number(query(request, 'start_cursor') ?? 0)
    const hasMore = index + 1 < batches.length
    return { object: 'list', results: batches[index], has_more: hasMore, next_cursor: hasMore ? String(index + 1) : null, type: 'block', block: {} }
  }
  throw new Error(`unexpected ${request.method} ${request.path}`)
}

const api = async (request: ApiRequest): Promise<ApiResponse> => ({ status: 200, body: route(request) })

describe('notionConnector', () => {
  it('offers top-level and orphan pages as scopes', async () => {
    const scopes = await notionConnector.listScopes(api)
    expect(scopes).toEqual([
      { id: 'p1', name: 'Handbook', kind: 'page', isSelected: true },
      { id: 'p3', name: 'Orphan', kind: 'page', isSelected: true }
    ])
  })

  it('converts blocks to Markdown and nests child pages', async () => {
    const bundle = await notionConnector.fetch(api, ['p1'], jest.fn(), new AbortController().signal)
    expect(bundle.teamspaces).toHaveLength(1)
    const [teamspace] = bundle.teamspaces
    expect(teamspace.name).toBe('Notion')
    const [handbook] = teamspace.docs
    expect(handbook.title).toBe('Handbook')
    expect(handbook.markdown).toBe([
      '# Welcome',
      'Read **this** *now* or `npm i` see [docs](https://x.dev) ~~old~~',
      '- Tools\n  - Laptop\n1. First\n2. Second\n- [x] Sign NDA\n- FAQ\n  Answer',
      '> Be kind',
      '> ! Heads up',
      '```typescript\nlet a = 1\n```',
      '---',
      '| Name | Role |\n| --- | --- |\n| Ann | Lead \\| PM |',
      '[https://huly.io](https://huly.io)',
      '[image: diagram v2.png]',
      '[database: Tasks]'
    ].join('\n\n'))
    expect(handbook.children).toEqual([{ title: 'Onboarding', markdown: 'Child text', children: [] }])
    expect(bundle.warnings).toEqual(['1 Notion databases were not imported', '1 images and attachments were not imported'])
  })
})
