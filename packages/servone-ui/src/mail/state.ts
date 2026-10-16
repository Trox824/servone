import { getCurrentAccount, SortingOrder, type Ref } from '@hcengineering/core'
import { createQuery, getClient } from '@hcengineering/presentation'
import { getContext, onDestroy, setContext } from 'svelte'
import { get, writable, type Readable, type Writable } from 'svelte/store'
import {
  findPreset,
  mailboxSpaceId,
  MAIL_ACCOUNT_CLASS,
  MAIL_FOLDER_CLASS,
  MAIL_MESSAGE_CLASS,
  MAIL_THREAD_CLASS,
  type MailAccountCard,
  type MailFolderCard,
  type MailThreadCard
} from '@servone/mail'
import type { BulkDeps } from './lib/bulk'
import type { CommandDeps } from './lib/commands'
import { confirmDeleteForever } from './lib/confirm'
import { visibleThreads, type Selection } from './lib/threads'
import { UndoQueue } from './lib/undo'
import { showActionFailed, showMailUndoToast } from './lib/toasts'
import { text } from './plugin'

export interface MailState {
  account: Readable<MailAccountCard | undefined | null>
  folders: Readable<MailFolderCard[] | undefined>
  threads: Readable<MailThreadCard[] | undefined>
  openThread: Readable<MailThreadCard | undefined>
  loadMoreThreads: () => void
  folder: Writable<Ref<MailFolderCard> | undefined>
  thread: Writable<Ref<MailThreadCard> | undefined>
  selection: Writable<Selection>
  undo: UndoQueue
  commands: CommandDeps
}

const MAIL_STATE_KEY = 'servone:mail:state'
const THREAD_PAGE_SIZE = 100 // several screens of 56px rows, so scrolling rarely waits on the next page

export function providerLabel (account: MailAccountCard | undefined | null): string {
  if (account === undefined || account === null) return ''
  return findPreset(account.mailProvider)?.label ?? account.mailProvider
}

export function createMailState (): MailState {
  const space = mailboxSpaceId(getCurrentAccount().uuid)

  const account = writable<MailAccountCard | undefined | null>(undefined)
  createQuery().query(MAIL_ACCOUNT_CLASS, { space }, (accounts) => {
    account.set(accounts[0] ?? null)
  })

  const folders = writable<MailFolderCard[] | undefined>(undefined)
  createQuery().query(MAIL_FOLDER_CLASS, { space }, (found) => {
    folders.set([...found])
  })

  const folder = writable<Ref<MailFolderCard> | undefined>(undefined)
  const thread = writable<Ref<MailThreadCard> | undefined>(undefined)

  const threads = writable<MailThreadCard[] | undefined>(undefined)
  const threadsQuery = createQuery()
  let threadLimit = THREAD_PAGE_SIZE
  function queryFolderThreads (target: Ref<MailFolderCard> | undefined): void {
    if (target === undefined) {
      threadsQuery.unsubscribe()
      threads.set(undefined)
      return
    }
    threadsQuery.query(
      MAIL_THREAD_CLASS,
      { space, mailFolders: target },
      (found) => {
        threads.set([...found])
      },
      { sort: { mailLastMessageAt: SortingOrder.Descending }, limit: threadLimit }
    )
  }
  onDestroy(folder.subscribe((target) => {
    threadLimit = THREAD_PAGE_SIZE
    threads.set(undefined)
    queryFolderThreads(target)
  }))
  function loadMoreThreads (): void {
    if ((get(threads)?.length ?? 0) < threadLimit) return
    threadLimit += THREAD_PAGE_SIZE
    queryFolderThreads(get(folder))
  }

  const openThread = writable<MailThreadCard | undefined>(undefined)
  const openThreadQuery = createQuery()
  onDestroy(thread.subscribe((target) => {
    if (target === undefined) {
      openThreadQuery.unsubscribe()
      openThread.set(undefined)
      return
    }
    openThreadQuery.query(MAIL_THREAD_CLASS, { space, _id: target }, (found) => {
      openThread.set(found[0])
    })
  }))

  const undo = new UndoQueue(
    (run, ms) => window.setTimeout(run, ms),
    (handle) => {
      window.clearTimeout(handle)
    },
    () => {
      showActionFailed(providerLabel(get(account)))
    }
  )

  const bulkDeps: BulkDeps = {
    findMessages: async (ids) => await getClient().findAll(MAIL_MESSAGE_CLASS, { space, mailThread: { $in: ids } }),
    update: async (message, change) => { await getClient().update(message, change) },
    setThreadUnread: async (thread, hasUnread) => { await getClient().updateDoc(MAIL_THREAD_CLASS, space, thread, { mailHasUnread: hasUnread }) },
    undo,
    toast: showMailUndoToast,
    onError: () => showActionFailed(providerLabel(get(account)))
  }

  const selection = writable<Selection>({ cursor: undefined, picked: new Set() })
  const commands: CommandDeps = {
    bulk: bulkDeps,
    view: () => {
      const folderId = get(folder)
      const folderList = get(folders) ?? []
      const open = get(openThread)
      return {
        folder: folderList.find((candidate) => candidate._id === folderId),
        folders: folderList,
        visible: folderId !== undefined ? visibleThreads(get(threads) ?? [], folderId, get(undo.hidden)) : [],
        cursor: get(selection).cursor,
        open: open !== undefined && open._id === get(thread) ? open : undefined
      }
    },
    land: (cursor, open) => {
      selection.set({ cursor, picked: new Set() })
      thread.set(open)
    },
    confirmDeleteForever,
    text
  }

  return {
    account,
    folders,
    threads,
    openThread,
    loadMoreThreads,
    folder,
    thread,
    selection,
    undo,
    commands
  }
}

export function setMailState (state: MailState): void {
  setContext(MAIL_STATE_KEY, state)
}

export function getMailState (): MailState {
  const state = getContext<MailState | undefined>(MAIL_STATE_KEY)
  if (state === undefined) throw new Error('mail state not set: getMailState() called outside MailApp')
  return state
}
