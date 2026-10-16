import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailThreadCard } from '@servone/mail'

export interface Selection {
  cursor: Ref<MailThreadCard> | undefined
  picked: ReadonlySet<Ref<MailThreadCard>>
}

export function visibleThreads (
  threads: MailThreadCard[],
  folder: Ref<MailFolderCard>,
  hidden: ReadonlySet<Ref<MailThreadCard>>
): MailThreadCard[] {
  return threads.filter((thread) => thread.mailFolders.includes(folder) && !hidden.has(thread._id))
}

function indexOfCursor (threads: MailThreadCard[], cursor: Ref<MailThreadCard> | undefined): number {
  return cursor === undefined ? -1 : threads.findIndex((thread) => thread._id === cursor)
}

export function moveCursor (threads: MailThreadCard[], selection: Selection, step: 1 | -1): Selection {
  if (threads.length === 0) return selection
  const currentIndex = indexOfCursor(threads, selection.cursor)
  const nextIndex = Math.min(Math.max(currentIndex + step, 0), threads.length - 1)
  return { cursor: threads[nextIndex]._id, picked: selection.picked }
}

export function togglePicked (selection: Selection, thread: Ref<MailThreadCard>): Selection {
  const picked = new Set(selection.picked)
  if (picked.has(thread)) picked.delete(thread)
  else picked.add(thread)
  return { cursor: selection.cursor, picked }
}

export function pickRange (threads: MailThreadCard[], selection: Selection, to: Ref<MailThreadCard>): Selection {
  if (selection.cursor === undefined) return togglePicked(selection, to)
  const ids = threads.map((thread) => thread._id)
  const start = ids.indexOf(selection.cursor)
  const end = ids.indexOf(to)
  if (start === -1 || end === -1) return selection
  const [low, high] = start <= end ? [start, end] : [end, start]
  return { cursor: to, picked: new Set([...selection.picked, ...ids.slice(low, high + 1)]) }
}

export function actionTargets (selection: Selection): Array<Ref<MailThreadCard>> {
  if (selection.picked.size > 0) return [...selection.picked]
  return selection.cursor === undefined ? [] : [selection.cursor]
}

export function nextAfterRemoval (
  threads: MailThreadCard[],
  removed: ReadonlySet<Ref<MailThreadCard>>,
  cursor: Ref<MailThreadCard> | undefined
): Ref<MailThreadCard> | undefined {
  const index = indexOfCursor(threads, cursor)
  if (index === -1) return undefined
  const older = threads.slice(index + 1).find((thread) => !removed.has(thread._id))
  if (older !== undefined) return older._id
  const newer = [...threads.slice(0, index)].reverse().find((thread) => !removed.has(thread._id))
  return newer?._id
}
