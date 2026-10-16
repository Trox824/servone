import type { Ref } from '@hcengineering/core'
import type { MailMessageCard } from '@servone/mail'
import { get, writable, type Readable } from 'svelte/store'
import { sendDraft } from '../api'
import { text } from '../plugin'
import { mailErrorKey } from './errors'
import { showMailUndoToast, showRetryToast } from './toasts'
import { UndoQueue, type PendingAction } from './undo'

export const SEND_UNDO_MS = 10_000

const pendingStore = writable<ReadonlySet<Ref<MailMessageCard>>>(new Set())
export const pendingSends: Readable<ReadonlySet<Ref<MailMessageCard>>> = pendingStore

function setPending (draft: Ref<MailMessageCard>, isPending: boolean): void {
  pendingStore.update((pending) => {
    const next = new Set(pending)
    if (isPending) next.add(draft)
    else next.delete(draft)
    return next
  })
}

function showSendFailed (action: PendingAction, error: Error): void {
  showRetryToast(text('SendFailed'), text(mailErrorKey(error)), `${action.id}:retry`, () => {
    action.commit().catch((retryError: Error) => { showSendFailed(action, retryError) })
  })
}

const queue = new UndoQueue(
  (run, ms) => window.setTimeout(run, ms),
  (handle) => { window.clearTimeout(handle) },
  showSendFailed,
  SEND_UNDO_MS
)

window.addEventListener('beforeunload', (event) => {
  if (get(pendingStore).size > 0) event.preventDefault()
})

export function queueSend (draft: MailMessageCard, reopen: () => void): void {
  setPending(draft._id, true)
  queue.push({
    id: draft._id,
    threads: [],
    commit: async () => {
      setPending(draft._id, true)
      try {
        await sendDraft(draft._id)
      } finally {
        setPending(draft._id, false)
      }
    }
  })
  showMailUndoToast(text('MailSent'), draft._id, () => {
    if (!queue.undo(draft._id)) return
    setPending(draft._id, false)
    reopen()
  })
}
