import { get } from 'svelte/store'
import type { MasterTag } from '@hcengineering/card'
import type { PersonId, Ref, Space } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard, MailThreadCard } from '@servone/mail'
import { runThreadAction, type BulkDeps } from '../bulk'
import { UndoQueue } from '../undo'

const MESSAGE_CLASS = 'servone:type:MailMessage' as Ref<MasterTag>

function fakeClock (): { schedule: (run: () => void, ms: number) => number, cancel: (handle: number) => void, advance: (ms: number) => Promise<void> } {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number, run: () => void }>()
  return {
    schedule: (run, ms) => {
      const handle = next++
      timers.set(handle, { at: now + ms, run })
      return handle
    },
    cancel: (handle) => { timers.delete(handle) },
    advance: async (ms) => {
      now += ms
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(handle)
          timer.run()
        }
      }
      await Promise.resolve()
    }
  }
}

function message (id: string, folders: string[], overrides: Partial<MailMessageCard> = {}): MailMessageCard {
  return {
    _id: id as Ref<MailMessageCard>,
    _class: MESSAGE_CLASS,
    space: 'space1' as Ref<Space>,
    modifiedOn: 0,
    modifiedBy: 'user1' as PersonId,
    title: id,
    content: 'content1' as MailMessageCard['content'],
    blobs: {},
    parentInfo: [],
    rank: '0',
    mailThread: 'thread1' as Ref<MailThreadCard>,
    mailMessageId: `<${id}@x>`,
    mailInReplyTo: '',
    mailReferences: [],
    mailFrom: 'a@x.vn',
    mailTo: [],
    mailCc: [],
    mailBcc: [],
    mailSentAt: 0,
    mailSnippet: '',
    mailIsRead: true,
    mailIsStarred: false,
    mailIsDraft: false,
    mailLocations: [],
    mailFolders: folders.map((folder) => folder as Ref<MailFolderCard>),
    mailProviderMessageId: '',
    mailBodyBlob: '',
    mailRawBlob: '',
    mailHasAttachments: false,
    mailTargetFolder: null,
    mailIsDeleted: false,
    ...overrides
  }
}

function fakeDeps (
  options: { messages: MailMessageCard[], update: jest.Mock, toast?: jest.Mock, onError?: jest.Mock, setThreadUnread?: jest.Mock }
): BulkDeps {
  const clock = fakeClock()
  const undo = new UndoQueue(clock.schedule, clock.cancel, () => {})
  return {
    findMessages: async () => options.messages,
    update: options.update,
    setThreadUnread: options.setThreadUnread ?? jest.fn(async () => {}),
    undo,
    toast: options.toast ?? jest.fn(),
    onError: options.onError ?? jest.fn()
  }
}

describe('runThreadAction', () => {
  it('writes read changes immediately', async () => {
    const update = jest.fn(async () => {})
    const deps = fakeDeps({ messages: [message('m1', ['inbox'], { mailIsRead: false, mailThread: 't1' as Ref<MailThreadCard> })], update })
    await runThreadAction(deps, ['t1' as Ref<MailThreadCard>], { kind: 'read', isRead: true }, 'inbox' as Ref<MailFolderCard>, 'x')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm1' }), { mailIsRead: true })
  })

  it('clears the thread unread flag without waiting for the server', async () => {
    const setThreadUnread = jest.fn(async () => {})
    const unread = message('m1', ['inbox'], { mailIsRead: false, mailThread: 't1' as Ref<MailThreadCard> })
    const deps = fakeDeps({ messages: [unread], update: jest.fn(async () => {}), setThreadUnread })
    await runThreadAction(deps, ['t1' as Ref<MailThreadCard>, 't2' as Ref<MailThreadCard>], { kind: 'read', isRead: true }, 'inbox' as Ref<MailFolderCard>, 'x')
    expect(setThreadUnread.mock.calls).toEqual([['t1', false]])
  })

  it('queues archive behind the undo window and toasts', async () => {
    const update = jest.fn(async () => {})
    const toast = jest.fn()
    const deps = fakeDeps({ messages: [message('m1', ['inbox'], { mailThread: 't1' as Ref<MailThreadCard> })], update, toast })
    await runThreadAction(deps, ['t1' as Ref<MailThreadCard>], { kind: 'move', target: 'archive' as Ref<MailFolderCard> }, 'inbox' as Ref<MailFolderCard>, 'Đã lưu trữ 1 thư')
    expect(update).not.toHaveBeenCalled()
    expect(get(deps.undo.hidden).has('t1' as Ref<MailThreadCard>)).toBe(true)
    expect(toast).toHaveBeenCalledWith('Đã lưu trữ 1 thư', expect.any(String), expect.any(Function))
    await deps.undo.flush()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm1' }), { mailTargetFolder: 'archive' })
  })

  it('reports a failed read/star write instead of throwing', async () => {
    const update = jest.fn(async () => { throw new Error('network') })
    const onError = jest.fn()
    const deps = fakeDeps({ messages: [message('m1', ['inbox'], { mailIsRead: false, mailThread: 't1' as Ref<MailThreadCard> })], update, onError })
    await expect(
      runThreadAction(deps, ['t1' as Ref<MailThreadCard>], { kind: 'read', isRead: true }, 'inbox' as Ref<MailFolderCard>, 'x')
    ).resolves.toBeUndefined()
    expect(update).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('undo inside the window stops the commit from ever running', async () => {
    const update = jest.fn(async () => {})
    const toast = jest.fn()
    const deps = fakeDeps({ messages: [message('m1', ['inbox'], { mailThread: 't1' as Ref<MailThreadCard> })], update, toast })
    await runThreadAction(deps, ['t1' as Ref<MailThreadCard>], { kind: 'move', target: 'archive' as Ref<MailFolderCard> }, 'inbox' as Ref<MailFolderCard>, 'Đã lưu trữ 1 thư')
    const id: string = toast.mock.calls[0][1]
    expect(deps.undo.undo(id)).toBe(true)
    await deps.undo.flush()
    expect(update).not.toHaveBeenCalled()
  })
})
