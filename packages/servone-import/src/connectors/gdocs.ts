import { z } from 'zod'
import type { ApiCall, Connector, DocImport, ScopeOption, TeamspaceImport } from '../types'
import { callApi, ConnectorError } from './api'

const FOLDER = 'application/vnd.google-apps.folder'
const DOCUMENT = 'application/vnd.google-apps.document'
const ROOT_ID = 'root'
const ROOT_NAME = 'My Drive'
const PAGE_SIZE = '1000'
const FORBIDDEN = 403
const IMAGE = /!\[([^\]]*)\](?:\[[^\]]*\]|\([^)]*\))/g
const DATA_URI_DEFINITION = /^\[[^\]]+\]:\s*<data:[^>]*>[ \t]*$/gm

const driveFile = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  parents: z.array(z.string()).optional()
})

const filesPage = z.object({ files: z.array(driveFile), nextPageToken: z.string().optional() })

type DriveFile = z.infer<typeof driveFile>

async function listFiles (api: ApiCall, search: string, signal: AbortSignal): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const query: Array<[string, string]> = [
      ['q', search],
      ['fields', 'nextPageToken,files(id,name,mimeType,parents)'],
      ['pageSize', PAGE_SIZE],
      ['orderBy', 'folder,name'],
      ['supportsAllDrives', 'true'],
      ['includeItemsFromAllDrives', 'true']
    ]
    if (pageToken !== undefined) query.push(['pageToken', pageToken])
    const page = filesPage.parse(await callApi(api, { method: 'GET', path: '/drive/v3/files', query }, signal))
    files.push(...page.files)
    pageToken = page.nextPageToken
  } while (pageToken !== undefined)
  return files
}

async function listFolders (api: ApiCall, signal: AbortSignal): Promise<DriveFile[]> {
  return await listFiles(api, `mimeType='${FOLDER}' and trashed=false`, signal)
}

function exportedMarkdown (markdown: string): { markdown: string, images: number } {
  let images = 0
  const replaced = markdown.replace(IMAGE, (_, alt: string) => {
    images++
    return `[image: ${alt !== '' ? alt : 'image'}]`
  })
  return { markdown: replaced.replace(DATA_URI_DEFINITION, '').trim(), images }
}

export const gdocsConnector: Connector = {
  async listScopes (api) {
    const folders = await listFolders(api, new AbortController().signal)
    const names = new Map(folders.map((folder) => [folder.id, folder.name]))
    return [
      { id: ROOT_ID, name: ROOT_NAME, kind: 'folder', isSelected: true },
      ...folders.map((folder): ScopeOption => ({
        id: folder.id,
        name: folder.name,
        kind: 'folder',
        parentName: names.get(folder.parents?.[0] ?? ''),
        isSelected: false
      }))
    ]
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const folderIds = scopeIds.filter((id) => id !== ROOT_ID)
    const names = new Map(folderIds.length > 0 ? (await listFolders(api, signal)).map((folder) => [folder.id, folder.name]) : [])
    let images = 0
    let otherFiles = 0
    const unexported: string[] = []
    let label = ''
    let docCount = 0

    const loadFolder = async (folderId: string): Promise<DocImport[]> => {
      const docs: DocImport[] = []
      for (const file of await listFiles(api, `'${folderId}' in parents and trashed=false`, signal)) {
        if (file.mimeType === FOLDER) {
          const children = await loadFolder(file.id)
          if (children.length > 0) docs.push({ title: file.name, markdown: '', children })
        } else if (file.mimeType === DOCUMENT) {
          try {
            const query: Array<[string, string]> = [['mimeType', 'text/markdown']]
            const body = z.string().parse(await callApi(api, { method: 'GET', path: `/drive/v3/files/${file.id}/export`, query }, signal))
            const exported = exportedMarkdown(body)
            images += exported.images
            docs.push({ title: file.name, markdown: exported.markdown, children: [] })
            onProgress({ label, count: ++docCount })
          } catch (error) {
            if (!(error instanceof ConnectorError) || error.status !== FORBIDDEN) throw error
            unexported.push(file.name)
          }
        } else {
          otherFiles++
        }
      }
      return docs
    }

    const teamspaces: TeamspaceImport[] = []
    for (const scopeId of scopeIds) {
      label = scopeId === ROOT_ID ? ROOT_NAME : names.get(scopeId) ?? 'Google Drive'
      docCount = 0
      teamspaces.push({ name: label, docs: await loadFolder(scopeId) })
    }

    const warnings: string[] = []
    if (unexported.length > 0) warnings.push(`Could not export ${unexported.length} docs (too large or no access): ${unexported.join(', ')}`)
    if (otherFiles > 0) warnings.push(`Skipped ${otherFiles} files that are not Google Docs`)
    if (images > 0) warnings.push(`${images} images were not imported`)
    return { projects: [], channels: [], teamspaces, warnings }
  }
}
