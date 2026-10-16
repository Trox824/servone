import { SortingOrder, type Ref } from '@hcengineering/core'
import drive, { type Drive, type Folder } from '@hcengineering/drive'
import { z } from 'zod'

import { defineTool, ToolInputError } from '../tool'
import type { SessionClient } from '../types'

const MAX_ENTRIES = 200
const KB = 1024
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function sizeText (bytes: number): string {
  let size = bytes
  let unit = 0
  while (size >= KB && unit < SIZE_UNITS.length - 1) {
    size /= KB
    unit++
  }
  return unit === 0 ? `${size} B` : `${size.toFixed(1)} ${SIZE_UNITS[unit]}`
}

const dayText = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

async function resolveFolder (client: SessionClient, space: Drive, path: string[]): Promise<Ref<Folder>> {
  let parent = drive.ids.Root
  for (const [depth, title] of path.entries()) {
    const folder = await client.findOne(drive.class.Folder, { space: space._id, parent, title })
    if (folder === undefined) throw new ToolInputError(`Folder "${path.slice(0, depth + 1).join('/')}" not found in drive ${space.name}`)
    parent = folder._id
  }
  return parent
}

const listDriveFiles = defineTool({
  name: 'list_drive_files',
  title: 'List drive files',
  description:
    'Without drive: list the drives the caller can see. With drive (name or id): list one folder of it, the root unless folder is given as a path like "Specs/2026". ' +
    'Output: folders as "name/  folder  modified", files as "name  size  mime-type  modified" (modified is a UTC date), then "Showing N of TOTAL". Read-only; file contents are not returned.',
  input: z.object({
    drive: z.string().trim().min(1).optional(),
    folder: z.string().optional().describe('Folder path inside the drive, "/" separated'),
    limit: z.number().int().min(1).max(MAX_ENTRIES).default(100)
  }),
  annotations: { readOnlyHint: true },
  run: async (session, args) => {
    const { client } = session
    const drives = await client.findAll(drive.class.Drive, { archived: false }, { sort: { name: SortingOrder.Ascending } })
    if (args.drive === undefined) {
      if (args.folder !== undefined) throw new ToolInputError('folder needs drive')
      if (drives.length === 0) return 'No drives'
      return drives.map((d) => `${d.name}  (${d._id})`).join('\n')
    }

    const wanted = args.drive.toLowerCase()
    const space = drives.find((d) => d._id === args.drive || d.name.toLowerCase() === wanted)
    if (space === undefined) throw new ToolInputError(`Drive ${args.drive} not found. Known: ${drives.map((d) => d.name).join(', ')}`)

    const path = (args.folder ?? '').split('/').map((s) => s.trim()).filter((s) => s !== '')
    const parent = await resolveFolder(client, space, path)
    const entries = await client.findAll(
      drive.class.Resource,
      { space: space._id, parent },
      { lookup: { file: drive.class.FileVersion }, sort: { title: SortingOrder.Ascending }, limit: args.limit, total: true }
    )
    const location = [space.name, ...path].join('/')
    if (entries.length === 0) return `${location} is empty`
    const lines = entries.map((entry) => {
      const version = entry.$lookup?.file
      if (entry.file === undefined || version === undefined) return `${entry.title}/  folder  ${dayText(entry.modifiedOn)}`
      return `${entry.title}  ${sizeText(version.size)}  ${version.type}  ${dayText(version.lastModified)}`
    })
    return [`${location}:`, ...lines, `Showing ${entries.length} of ${entries.total}`].join('\n')
  }
})

export const driveTools = [listDriveFiles]
