import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard, MailThreadCard } from '@servone/mail'
import type { BulkDeps } from '../bulk'
import { archive, deleteThreads, moveTargets, toggleStar, type CommandDeps, type MailView } from '../commands'
import { UndoQueue } from '../undo'
import type { StringKey } from '../../strings'
import { folder, message, thread } from './builders'

const inbox = folder({ _id: 'inbox' as Ref<MailFolderCard>, mailRole: 'inbox' })
const archiveFolder = folder({ _id: 'archive' as Ref<MailFolderCard>, mailRole: 'archive' })
const trash = folder({ _id: 'trash' as Ref<MailFolderCard>, mailRole: 'trash' })
const sent = folder({ _id: 'sent' as Ref<MailFolderCard>, mailRole: 'sent' })
const drafts = folder({ _id: 'drafts' as Ref<MailFolderCard>, mailRole: 'drafts' })

const t1 = thread({ _id: 't1' as Ref<MailThreadCard>, mailFolders: [inbox._id] })
const t2 = thread({ _id: 't2' as Ref<MailThreadCard>, mailFolders: [inbox._id] })
const t3 = thread({ _id: 't3' as Ref<MailThreadCard>, mailFolders: [inbox._id] })

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

type FakeCommands = CommandDeps & {
  bulk: BulkDeps & { update: jest.Mock, setThreadUnread: jest.Mock, toast: jest.Mock }
  land: jest.Mock
  confirmDeleteForever: jest.Mock
}

function fakeCommands (view: Partial<MailView>, messages: MailMessageCard[] = []): FakeCommands {
  const bulk = {
    findMessages: async () => messages,
    update: jest.fn(async () => {}),
    setThreadUnread: jest.fn(async () => {}),
    undo: new UndoQueue(() => 0, () => {}, () => {}),
    toast: jest.fn(),
    onError: jest.fn()
  } satisfies BulkDeps
  return {
    bulk,
    view: () => ({ folder: inbox, folders: [inbox, archiveFolder, trash, sent, drafts], visible: [t1, t2, t3], cursor: undefined, open: undefined, ...view }),
    land: jest.fn(),
    confirmDeleteForever: jest.fn(async (): Promise<boolean> => true),
    text: (key: StringKey) => key
  } satisfies CommandDeps
}

describe('thread commands', () => {
  it('lands the cursor and reader on the next thread when the open one is archived', () => {
    const deps = fakeCommands({ cursor: t2._id, open: t2 })
    archive(deps, [t2._id])
    expect(deps.land).toHaveBeenCalledWith(t3._id, t3._id)
  })

  it('keeps an open thread that the bulk action did not touch', () => {
    const deps = fakeCommands({ cursor: t1._id, open: t3 })
    archive(deps, [t1._id, t2._id])
    expect(deps.land).toHaveBeenCalledWith(t3._id, t3._id)
  })

  it('asks before deleting forever from Trash, and does nothing when declined', async () => {
    const deps = fakeCommands({ folder: trash, cursor: t1._id })
    deps.confirmDeleteForever.mockResolvedValue(false)
    await deleteThreads(deps, [t1._id])
    expect(deps.confirmDeleteForever).toHaveBeenCalledWith(1)
    expect(deps.land).not.toHaveBeenCalled()
  })

  it('offers neither Sent, Drafts nor the current folder as move targets', () => {
    expect(moveTargets([inbox, archiveFolder, trash, sent, drafts], inbox._id).map((candidate) => candidate._id)).toEqual([archiveFolder._id, trash._id])
  })

  it('stars a deep-linked open thread that is not in the loaded page', async () => {
    const outside = thread({ _id: 'outside' as Ref<MailThreadCard>, mailIsStarred: true })
    const starred = message({ mailThread: outside._id, mailIsStarred: true, mailFolders: [inbox._id] })
    const deps = fakeCommands({ open: outside }, [starred])
    toggleStar(deps, [outside._id])
    await settle()
    expect(deps.bulk.update).toHaveBeenCalledWith(starred, { mailIsStarred: false })
  })
})
