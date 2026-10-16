import { get } from 'svelte/store'
import type { Ref } from '@hcengineering/core'
import type { MailThreadCard } from '@servone/mail'
import { UNDO_WINDOW_MS, UndoQueue } from '../undo'
import type { PendingAction } from '../undo'

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

function thread (id: string): Ref<MailThreadCard> {
  return id as Ref<MailThreadCard>
}

function pendingAction (overrides: Partial<PendingAction>): PendingAction {
  return { id: 'a', threads: [thread('t1')], commit: async () => {}, ...overrides }
}

describe('UndoQueue', () => {
  it('hides at once and commits after the window', async () => {
    const clock = fakeClock()
    const commit = jest.fn(async () => {})
    const queue = new UndoQueue(clock.schedule, clock.cancel, () => {})
    queue.push(pendingAction({ id: 'a', threads: [thread('t1')], commit }))
    expect(get(queue.hidden).has(thread('t1'))).toBe(true)
    await clock.advance(UNDO_WINDOW_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    await clock.advance(1)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('undoing the second action keeps the first one committing', async () => {
    const clock = fakeClock()
    const first = jest.fn(async () => {})
    const second = jest.fn(async () => {})
    const queue = new UndoQueue(clock.schedule, clock.cancel, () => {})
    queue.push(pendingAction({ id: 'a', threads: [thread('t1')], commit: first }))
    queue.push(pendingAction({ id: 'b', threads: [thread('t2')], commit: second }))
    expect(queue.undo('b')).toBe(true)
    expect(get(queue.hidden).has(thread('t2'))).toBe(false)
    expect(get(queue.hidden).has(thread('t1'))).toBe(true)
    await clock.advance(UNDO_WINDOW_MS)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('replacing a pending id commits the old action right away and lets undo stop the new one', async () => {
    const clock = fakeClock()
    const first = jest.fn(async () => {})
    const second = jest.fn(async () => {})
    const queue = new UndoQueue(clock.schedule, clock.cancel, () => {})
    queue.push(pendingAction({ id: 'a', threads: [thread('t1')], commit: first }))
    queue.push(pendingAction({ id: 'a', threads: [thread('t2')], commit: second }))
    await Promise.resolve()
    expect(first).toHaveBeenCalledTimes(1)
    expect(queue.undo('a')).toBe(true)
    await clock.advance(UNDO_WINDOW_MS)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('unhides and reports when the commit fails', async () => {
    const clock = fakeClock()
    const onError = jest.fn()
    const queue = new UndoQueue(clock.schedule, clock.cancel, onError)
    queue.push(pendingAction({ id: 'a', threads: [thread('t1')], commit: async () => { throw new Error('denied') } }))
    await clock.advance(UNDO_WINDOW_MS)
    await Promise.resolve()
    expect(get(queue.hidden).has(thread('t1'))).toBe(false)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), expect.any(Error))
  })

  it('flush commits everything pending right away', async () => {
    const clock = fakeClock()
    const commit = jest.fn(async () => {})
    const queue = new UndoQueue(clock.schedule, clock.cancel, () => {})
    queue.push(pendingAction({ id: 'a', threads: [thread('t1')], commit }))
    await queue.flush()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(queue.undo('a')).toBe(false)
  })
})
