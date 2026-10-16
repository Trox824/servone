import { DRAFT_DEBOUNCE_MS, DraftSaver } from '../draft-saver'

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

it('saves once, 5 s after the last keystroke', async () => {
  const clock = fakeClock()
  const save = jest.fn(async () => {})
  const onError = jest.fn()
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, onError)
  saver.touch()
  await clock.advance(2000)
  saver.touch()
  await clock.advance(2000)
  saver.touch()
  await clock.advance(DRAFT_DEBOUNCE_MS - 1)
  expect(save).not.toHaveBeenCalled()
  await clock.advance(1)
  expect(save).toHaveBeenCalledTimes(1)
  expect(onError).not.toHaveBeenCalled()
})

it('flush saves now and cancels the pending timer', async () => {
  const clock = fakeClock()
  const save = jest.fn(async () => {})
  const onError = jest.fn()
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, onError)
  saver.touch()
  await saver.flush()
  expect(save).toHaveBeenCalledTimes(1)
  await clock.advance(DRAFT_DEBOUNCE_MS)
  expect(save).toHaveBeenCalledTimes(1)
  expect(saver.isDirty).toBe(false)
})

it('a keystroke during a save leads to exactly one more save', async () => {
  const clock = fakeClock()
  let release: () => void = () => {}
  const save = jest.fn(async () => { await new Promise<void>((resolve) => { release = resolve }) })
  const onError = jest.fn()
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, onError)
  saver.touch()
  const flushing = saver.flush()
  saver.touch()
  saver.touch()
  release()
  await flushing
  expect(saver.isDirty).toBe(true)
  await clock.advance(DRAFT_DEBOUNCE_MS)
  release()
  await saver.flush()
  expect(save).toHaveBeenCalledTimes(2)
  expect(saver.isDirty).toBe(false)
  expect(onError).not.toHaveBeenCalled()
})

it('a failing autosave on the timer path reports through onError and stays dirty', async () => {
  const clock = fakeClock()
  const save = jest.fn(async () => { throw new Error('boom') })
  const onError = jest.fn()
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, onError)
  saver.touch()
  await clock.advance(DRAFT_DEBOUNCE_MS)
  await Promise.resolve()
  await Promise.resolve()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith(expect.any(Error))
  expect(saver.isDirty).toBe(true)

  onError.mockClear()
  save.mockImplementationOnce(async () => {})
  await saver.flush()
  expect(save).toHaveBeenCalledTimes(2)
  expect(saver.isDirty).toBe(false)
  expect(onError).not.toHaveBeenCalled()
})

it('flush rejects to its own caller on a failing save, and never calls onError', async () => {
  const clock = fakeClock()
  const save = jest.fn(async () => { throw new Error('boom') })
  const onError = jest.fn()
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, onError)
  saver.touch()
  await expect(saver.flush()).rejects.toThrow('boom')
  expect(saver.isDirty).toBe(true)
  expect(onError).not.toHaveBeenCalled()
})

it('flush does not save an untouched composer, saveNow does', async () => {
  const clock = fakeClock()
  const save = jest.fn(async () => {})
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, jest.fn())
  await saver.flush()
  expect(save).not.toHaveBeenCalled()
  await saver.saveNow()
  expect(save).toHaveBeenCalledTimes(1)
  expect(saver.isDirty).toBe(false)
})

it('flush during a save picks up the edits made while it ran', async () => {
  const clock = fakeClock()
  const releases: Array<() => void> = []
  const save = jest.fn(async () => { await new Promise<void>((resolve) => { releases.push(resolve) }) })
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, jest.fn())
  saver.touch()
  await clock.advance(DRAFT_DEBOUNCE_MS)
  saver.touch()
  const flushing = saver.flush()
  releases[0]()
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  expect(save).toHaveBeenCalledTimes(2)
  releases[1]()
  await flushing
  expect(saver.isDirty).toBe(false)
})

it('stop drops pending edits and waits for the running save', async () => {
  const clock = fakeClock()
  let release: () => void = () => {}
  const save = jest.fn(async () => { await new Promise<void>((resolve) => { release = resolve }) })
  const saver = new DraftSaver(save, clock.schedule, clock.cancel, jest.fn())
  saver.touch()
  const flushing = saver.flush()
  saver.touch()
  let isStopped = false
  const stopping = saver.stop().then(() => { isStopped = true })
  await Promise.resolve()
  expect(isStopped).toBe(false)
  release()
  await flushing
  await stopping
  expect(saver.isDirty).toBe(false)
  await clock.advance(DRAFT_DEBOUNCE_MS)
  await saver.flush()
  expect(save).toHaveBeenCalledTimes(1)
})
