import type { Attachment } from '@hcengineering/attachment'
import type { Ref } from '@hcengineering/core'
import { createFile, type Drive, type File as DriveFile, type Folder } from '@hcengineering/drive'
import { getClient, getFileUrl, uploadFile } from '@hcengineering/presentation'

export async function saveToDrive (source: Attachment, space: Ref<Drive>, parent: Ref<Folder>): Promise<Ref<DriveFile>> {
  const response = await fetch(getFileUrl(source.file, source.name))
  if (!response.ok) throw new Error(`Download of ${source.name} failed: ${response.status}`)
  const copy = new File([await response.blob()], source.name, { type: source.type, lastModified: source.lastModified })
  const { uuid, metadata } = await uploadFile(copy)
  return await createFile(getClient(), space, parent, {
    title: source.name,
    file: uuid,
    size: source.size,
    type: source.type,
    lastModified: source.lastModified,
    metadata
  })
}
