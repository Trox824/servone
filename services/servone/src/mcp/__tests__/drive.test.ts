import core, { type Class, type Doc, type Ref, toFindResult, type WithLookup } from '@hcengineering/core'
import drive, { type Drive, type File, type FileVersion, type Folder, type Resource } from '@hcengineering/drive'

import { ToolInputError } from '../tool'
import { driveTools } from '../tools/drive'
import { fakeSession, ME_SOCIAL } from './fixtures'

const listFiles = driveTools.find((t) => t.name === 'list_drive_files')
if (listFiles === undefined) throw new Error('list_drive_files missing')

const driveId = 'drive-1' as Ref<Drive>

const teamDrive: Drive = {
  _id: driveId,
  _class: drive.class.Drive,
  space: core.space.Space,
  modifiedOn: 0,
  modifiedBy: ME_SOCIAL,
  name: 'Team',
  description: '',
  private: false,
  archived: false,
  members: [],
  type: drive.spaceType.DefaultDrive
}

const docsFolder: Folder = {
  _id: 'folder-docs' as Ref<Folder>,
  _class: drive.class.Folder,
  space: driveId,
  modifiedOn: Date.UTC(2026, 8, 20),
  modifiedBy: ME_SOCIAL,
  title: 'Docs',
  parent: drive.ids.Root,
  path: []
}

const version: FileVersion = {
  _id: 'ver-1' as Ref<FileVersion>,
  _class: drive.class.FileVersion,
  space: driveId,
  modifiedOn: 0,
  modifiedBy: ME_SOCIAL,
  attachedTo: 'file-1' as Ref<File>,
  attachedToClass: drive.class.File,
  collection: 'versions',
  title: 'spec.pdf',
  file: 'blob-1' as FileVersion['file'],
  size: 2048,
  type: 'application/pdf',
  lastModified: Date.UTC(2026, 8, 21),
  version: 1
}

const specFile: WithLookup<Resource> = {
  _id: 'file-1' as Ref<Resource>,
  _class: drive.class.File,
  space: driveId,
  modifiedOn: Date.UTC(2026, 8, 22),
  modifiedBy: ME_SOCIAL,
  title: 'spec.pdf',
  parent: docsFolder._id,
  path: [docsFolder._id],
  file: version._id,
  $lookup: { file: version }
}

function setup (): ReturnType<typeof fakeSession> {
  const session = fakeSession()
  const docs = new Map<Ref<Class<Doc>>, Doc[]>([
    [drive.class.Drive, [teamDrive]],
    [drive.class.Resource, [specFile]]
  ])
  jest.mocked(session.client.findAll).mockImplementation(async (_class) => toFindResult(docs.get(_class) ?? []))
  jest
    .mocked(session.client.findOne)
    .mockImplementation(async (_class, query) => (_class === drive.class.Folder && query.title === 'Docs' ? docsFolder : undefined))
  return session
}

describe('list_drive_files', () => {
  it('lists drives when no drive is given', async () => {
    const out = await listFiles.run(setup(), {})
    expect(out).toContain('Team')
  })

  it('rejects an unknown drive and names the known ones', async () => {
    await expect(listFiles.run(setup(), { drive: 'Nope' })).rejects.toThrow('Drive Nope not found. Known: Team')
  })

  it('walks the folder path and lists its files with size and type', async () => {
    const session = setup()
    const out = await listFiles.run(session, { drive: 'team', folder: '/Docs/' })
    expect(session.client.findOne).toHaveBeenCalledWith(drive.class.Folder, { space: driveId, parent: drive.ids.Root, title: 'Docs' })
    const listCall = jest.mocked(session.client.findAll).mock.calls.find((c) => c[0] === drive.class.Resource)
    expect(listCall?.[1]).toEqual({ space: driveId, parent: docsFolder._id })
    expect(out).toContain('spec.pdf  2.0 KB  application/pdf  2026-09-21')
  })

  it('rejects an unknown folder', async () => {
    await expect(listFiles.run(setup(), { drive: 'Team', folder: 'Missing' })).rejects.toThrow(ToolInputError)
  })

  it('requires a drive when a folder is given', async () => {
    await expect(listFiles.run(setup(), { folder: 'Docs' })).rejects.toThrow(ToolInputError)
  })
})
