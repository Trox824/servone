import { generateId, type Ref } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard, MailThreadCard, MessageChange } from '@servone/mail'
import { isDestructive, threadActionTargets, type ThreadAction } from './actions'
import type { UndoQueue } from './undo'

export interface BulkDeps {
  findMessages: (threads: Array<Ref<MailThreadCard>>) => Promise<MailMessageCard[]>
  update: (message: MailMessageCard, change: MessageChange) => Promise<void>
  setThreadUnread: (thread: Ref<MailThreadCard>, hasUnread: boolean) => Promise<void>
  undo: UndoQueue
  toast: (title: string, id: string, onUndo: () => void) => void
  onError: (error: Error) => void
}

export async function runThreadAction (
  deps: BulkDeps,
  threads: Array<Ref<MailThreadCard>>,
  action: ThreadAction,
  from: Ref<MailFolderCard>,
  title: string
): Promise<void> {
  try {
    const messages = await deps.findMessages(threads)
    const updates = threadActionTargets(messages, action, from)

    if (!isDestructive(action)) {
      await Promise.all(updates.map((update) => deps.update(update.message, update.change)))
      if (action.kind === 'read') {
        const changed = new Set(updates.map((update) => update.message.mailThread))
        await Promise.all([...changed].map(async (thread) => { await deps.setThreadUnread(thread, !action.isRead) }))
      }
      return
    }

    const id = generateId()
    deps.undo.push({
      id,
      threads,
      commit: async () => {
        await Promise.all(updates.map((update) => deps.update(update.message, update.change)))
      }
    })
    deps.toast(title, id, () => deps.undo.undo(id))
  } catch (error) {
    deps.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
