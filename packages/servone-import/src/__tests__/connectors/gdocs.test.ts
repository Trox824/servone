import { gdocsConnector } from '../../connectors/gdocs'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const FOLDER = 'application/vnd.google-apps.folder'
const DOCUMENT = 'application/vnd.google-apps.document'

function file (id: string, name: string, mimeType: string, parent: string): Json {
  return { id, name, mimeType, parents: [parent] }
}

const folders = [
  file('F1', 'Specs', FOLDER, '0AROOT'),
  file('F2', 'Drafts', FOLDER, 'F1'),
  file('F3', 'Empty', FOLDER, 'F1')
]

const contents: Record<string, Json[]> = {
  F1: [folders[1], folders[2], file('D1', 'Plan', DOCUMENT, 'F1'), file('S1', 'Budget', 'application/vnd.google-apps.spreadsheet', 'F1')],
  F2: [file('D2', 'Draft one', DOCUMENT, 'F2'), file('D3', 'Huge', DOCUMENT, 'F2')],
  F3: []
}

const exportBodies: Record<string, string> = {
  D1: '# Plan\n\nShip it ![][image1] and ![chart](https://x/c.png)\n\n[image1]: <data:image/png;base64,iVBORw0KGgo=>\n',
  D2: 'Draft **body**\n'
}

function query (request: ApiRequest, name: string): string | undefined {
  return request.query?.find(([key]) => key === name)?.[1]
}

function route (request: ApiRequest): ApiResponse {
  if (request.path === '/drive/v3/files') {
    const search = query(request, 'q') ?? ''
    if (search.startsWith('mimeType=')) {
      return query(request, 'pageToken') === undefined
        ? { status: 200, body: { files: folders.slice(0, 2), nextPageToken: 't2' } }
        : { status: 200, body: { files: folders.slice(2) } }
    }
    const parent = /^'([^']+)' in parents/.exec(search)?.[1] ?? ''
    return { status: 200, body: { files: contents[parent] } }
  }
  const exported = /^\/drive\/v3\/files\/([^/]+)\/export$/.exec(request.path)?.[1] ?? ''
  if (query(request, 'mimeType') === 'text/markdown' && exported in exportBodies) return { status: 200, body: exportBodies[exported] }
  if (exported === 'D3') return { status: 403, body: { error: { code: 403, message: 'This file is too large to be exported.' } } }
  throw new Error(`unexpected ${request.path}`)
}

const api = async (request: ApiRequest): Promise<ApiResponse> => route(request)

describe('gdocsConnector', () => {
  it('lists My Drive and every folder', async () => {
    const scopes = await gdocsConnector.listScopes(api)
    expect(scopes).toEqual([
      { id: 'root', name: 'My Drive', kind: 'folder', isSelected: true },
      { id: 'F1', name: 'Specs', kind: 'folder', parentName: undefined, isSelected: false },
      { id: 'F2', name: 'Drafts', kind: 'folder', parentName: 'Specs', isSelected: false },
      { id: 'F3', name: 'Empty', kind: 'folder', parentName: 'Specs', isSelected: false }
    ])
  })

  it('exports docs as Markdown and keeps the folder tree', async () => {
    const progress = jest.fn()
    const bundle = await gdocsConnector.fetch(api, ['F1'], progress, new AbortController().signal)
    expect(bundle.teamspaces).toEqual([{
      name: 'Specs',
      docs: [
        { title: 'Drafts', markdown: '', children: [{ title: 'Draft one', markdown: 'Draft **body**', children: [] }] },
        { title: 'Plan', markdown: '# Plan\n\nShip it [image: image] and [image: chart]', children: [] }
      ]
    }])
    expect(bundle.warnings).toEqual([
      'Could not export 1 docs (too large or no access): Huge',
      'Skipped 1 files that are not Google Docs',
      '2 images were not imported'
    ])
    expect(progress).toHaveBeenLastCalledWith({ label: 'Specs', count: 2 })
  })
})
