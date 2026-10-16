import { writable, type Readable } from 'svelte/store'
import type { Ref } from '@hcengineering/core'
import type { MailThreadCard } from '@servone/mail'

export const UNDO_WINDOW_MS = 5000 // spec Push: writes wait for the undo window

export interface PendingAction {
  id: string
  threads: Array<Ref<MailThreadCard>>
  commit: () => Promise<void>
}

interface Scheduled {
  action: PendingAction
  handle: number
}

export class UndoQueue {
  private readonly pending = new Map<string, Scheduled>()
  private readonly hiddenStore = writable<ReadonlySet<Ref<MailThreadCard>>>(new Set())
  readonly hidden: Readable<ReadonlySet<Ref<MailThreadCard>>> = this.hiddenStore

  constructor (
    private readonly schedule: (run: () => void, ms: number) => number,
    private readonly cancel: (handle: number) => void,
    private readonly onError: (action: PendingAction, error: Error) => void,
    private readonly windowMs: number = UNDO_WINDOW_MS
  ) {}

  push (action: PendingAction): void {
    const existing = this.pending.get(action.id)
    if (existing !== undefined) {
      this.pending.delete(action.id)
      this.cancel(existing.handle)
      void this.run(existing.action)
    }
    const handle = this.schedule(() => {
      this.pending.delete(action.id)
      void this.run(action)
    }, this.windowMs)
    this.pending.set(action.id, { action, handle })
    this.hiddenStore.update((hidden) => new Set([...hidden, ...action.threads]))
  }

  undo (id: string): boolean {
    const scheduled = this.pending.get(id)
    if (scheduled === undefined) return false
    this.pending.delete(id)
    this.cancel(scheduled.handle)
    this.unhide(scheduled.action.threads)
    return true
  }

  async flush (): Promise<void> {
    const scheduled = [...this.pending.values()]
    this.pending.clear()
    for (const { action, handle } of scheduled) {
      this.cancel(handle)
      await this.run(action)
    }
  }

  private async run (action: PendingAction): Promise<void> {
    try {
      await action.commit()
    } catch (error) {
      this.unhide(action.threads)
      this.onError(action, error instanceof Error ? error : new Error(String(error)))
      return
    }
    this.unhide(action.threads)
  }

  private unhide (threads: Array<Ref<MailThreadCard>>): void {
    const toRemove = new Set(threads)
    this.hiddenStore.update((hidden) => {
      const next = new Set<Ref<MailThreadCard>>()
      for (const thread of hidden) {
        if (!toRemove.has(thread) || this.stillHiddenByOther(thread)) next.add(thread)
      }
      return next
    })
  }

  private stillHiddenByOther (thread: Ref<MailThreadCard>): boolean {
    for (const { action } of this.pending.values()) {
      if (action.threads.includes(thread)) return true
    }
    return false
  }
}
