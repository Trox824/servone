import { type Blob, type MeasureContext, type Ref, systemAccountUuid, type WorkspaceIds, type WorkspaceUuid } from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import type { StorageAdapter } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { randomUUID } from 'crypto'

export interface BlobStore {
  put: (content: Buffer, contentType: string) => Promise<Ref<Blob>>
  read: (blob: Ref<Blob>) => Promise<Buffer>
  remove: (blobs: Array<Ref<Blob>>) => Promise<void>
}

export function createBlobStore (ctx: MeasureContext, storage: StorageAdapter, workspace: WorkspaceIds): BlobStore {
  return {
    put: async (content, contentType) => {
      // Unguessable: /mail/send reads a draft's user-writable blob ref with system rights.
      const name = randomUUID() as Ref<Blob>
      await storage.put(ctx, workspace, name, content, contentType, content.length)
      return name
    },
    read: async (blob) => Buffer.concat(await storage.read(ctx, workspace, blob)),
    remove: async (blobs) => { if (blobs.length > 0) await storage.remove(ctx, workspace, blobs) }
  }
}

export async function openBlobStore (ctx: MeasureContext, storage: StorageAdapter, serviceId: string, workspace: WorkspaceUuid): Promise<BlobStore> {
  const info = await getAccountClient(generateToken(systemAccountUuid, workspace, { service: serviceId })).getWorkspaceInfo()
  return createBlobStore(ctx, storage, { uuid: workspace, url: info.url, dataId: info.dataId })
}
