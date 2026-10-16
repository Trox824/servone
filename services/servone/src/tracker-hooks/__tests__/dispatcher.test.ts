import {
  deliveryIdFor,
  Dispatcher,
  EXPIRE_AFTER_MS,
  MAX_CONSECUTIVE_FAILURES,
  nextAttemptAt
} from '../dispatcher'
import type { AttemptOutcome } from '../../outgoing/send'
import { type AttemptRecord, type PendingDelivery, type StoredTrackerHook, TrackerHookStore } from '../store'
import { storedHook } from './fixtures'
import { MemoryKv } from './memory-kv'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const OK: AttemptOutcome = { status: 200, durationMs: 5, responseStart: 'ok' }
const SERVER_ERROR: AttemptOutcome = { status: 500, durationMs: 5, responseStart: 'boom' }

interface Harness {
  kv: MemoryKv
  store: TrackerHookStore
  dispatcher: Dispatcher
  clock: { now: number }
  sentAt: number[]
  answers: AttemptOutcome[]
  notified: Array<{ hook: StoredTrackerHook, last: AttemptRecord }>
  changed: Array<StoredTrackerHook | string>
}

function harness (kv = new MemoryKv(), clock = { now: 0 }): Harness {
  const store = new TrackerHookStore(kv)
  const sentAt: number[] = []
  const answers: AttemptOutcome[] = []
  const notified: Harness['notified'] = []
  const changed: Harness['changed'] = []
  const dispatcher = new Dispatcher({
    store,
    send: async () => {
      sentAt.push(clock.now)
      await Promise.resolve()
      return answers.shift() ?? SERVER_ERROR
    },
    notifyDisabled: async (hook, last) => {
      notified.push({ hook, last })
    },
    onHookChanged: (id, hook) => {
      changed.push(hook ?? `removed ${id}`)
    },
    now: () => clock.now,
    report: () => {}
  })
  return { kv, store, dispatcher, clock, sentAt, answers, notified, changed }
}

async function enqueueAndSend (h: Harness, hook: StoredTrackerHook, txId: string): Promise<PendingDelivery> {
  const id = deliveryIdFor(hook.id, txId, 'issue.created')
  const delivery = await h.dispatcher.enqueue(hook, id, 'issue.created', '{"event":"issue.created"}')
  if (delivery === undefined) throw new Error('not enqueued')
  await h.dispatcher.attempt(delivery.id)
  return delivery
}

async function withHook (h: Harness, overrides: Partial<StoredTrackerHook> = {}): Promise<StoredTrackerHook> {
  const hook = storedHook('hook1', overrides)
  await h.store.saveHook(hook)
  return hook
}

describe('nextAttemptAt', () => {
  it.each([
    [1, MINUTE],
    [2, 5 * MINUTE],
    [3, 30 * MINUTE],
    [4, 2 * HOUR],
    [5, 6 * HOUR]
  ])('schedules attempt %s + 1 after the delay', (attempt, delay) => {
    expect(nextAttemptAt(attempt, 1_000)).toBe(1_000 + delay)
  })

  it('gives up after the sixth attempt', () => {
    expect(nextAttemptAt(6, 1_000)).toBeUndefined()
  })
})

describe('deliveryIdFor', () => {
  it('is stable, 32 hex characters, and differs per event', () => {
    const id = deliveryIdFor('hook1', 'tx1', 'issue.updated')
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(deliveryIdFor('hook1', 'tx1', 'issue.updated')).toBe(id)
    expect(deliveryIdFor('hook1', 'tx1', 'issue.status_changed')).not.toBe(id)
  })
})

describe('Dispatcher', () => {
  it('retries on the schedule and fails the delivery after six attempts', async () => {
    const h = harness()
    const hook = await withHook(h)
    await enqueueAndSend(h, hook, 'tx1')
    for (const at of [MINUTE, 6 * MINUTE, 36 * MINUTE, 2 * HOUR + 36 * MINUTE, 8 * HOUR + 36 * MINUTE]) {
      h.clock.now = at - 1
      await h.dispatcher.sweep()
      h.clock.now = at
      await h.dispatcher.sweep()
    }
    h.clock.now = 20 * HOUR
    await h.dispatcher.sweep()
    expect(h.sentAt).toEqual([0, MINUTE, 6 * MINUTE, 36 * MINUTE, 2 * HOUR + 36 * MINUTE, 8 * HOUR + 36 * MINUTE])
    expect(await h.store.listDue()).toEqual([])
    const log = await h.store.readLog(hook.id)
    expect(log.map((record) => record.attempt)).toEqual([6, 5, 4, 3, 2, 1])
    expect(log[0]).toMatchObject({ status: 500, responseStart: 'boom', event: 'issue.created' })
  })

  it('removes a delivered delivery and resets the failure count', async () => {
    const h = harness()
    const hook = await withHook(h, { consecutiveFailures: 3 })
    h.answers.push(OK)
    await enqueueAndSend(h, hook, 'tx1')
    expect(await h.store.listDue()).toEqual([])
    expect(await h.store.getHook(hook.id)).toMatchObject({ consecutiveFailures: 0 })
  })

  it('resumes from due/ after a restart', async () => {
    const first = harness()
    const hook = await withHook(first)
    await enqueueAndSend(first, hook, 'tx1')
    const restarted = harness(first.kv, first.clock)
    restarted.clock.now = MINUTE
    restarted.answers.push(OK)
    await restarted.dispatcher.sweep()
    expect(restarted.sentAt).toEqual([MINUTE])
    expect(await restarted.store.listDue()).toEqual([])
  })

  it('fails a delivery older than the expiry without sending it', async () => {
    const h = harness()
    const hook = await withHook(h)
    const id = deliveryIdFor(hook.id, 'tx1', 'issue.created')
    await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')
    h.clock.now = EXPIRE_AFTER_MS + 1
    await h.dispatcher.sweep()
    expect(h.sentAt).toEqual([])
    expect(await h.store.listDue()).toEqual([])
    expect(await h.store.readLog(hook.id)).toMatchObject([{ deliveryId: id, error: 'expired', status: 0 }])
  })

  it('skips a replayed tx that is pending or already logged', async () => {
    const h = harness()
    const hook = await withHook(h)
    const id = deliveryIdFor(hook.id, 'tx1', 'issue.created')
    expect(await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')).toBeDefined()
    expect(await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')).toBeUndefined()
    h.answers.push(OK)
    await h.dispatcher.attempt(id)
    expect(await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')).toBeUndefined()
  })

  it('turns the hook off after 20 failed attempts in a row and mails once', async () => {
    const h = harness()
    const hook = await withHook(h)
    for (let n = 0; n < MAX_CONSECUTIVE_FAILURES; n++) await enqueueAndSend(h, hook, `tx${n}`)
    const disabled = await h.store.getHook(hook.id)
    expect(disabled).toMatchObject({ consecutiveFailures: MAX_CONSECUTIVE_FAILURES, disabledOn: 0, disabledReason: 'failures' })
    expect(h.notified).toHaveLength(1)
    expect(h.notified[0].last).toMatchObject({ status: 500 })
    expect(h.changed).toMatchObject([{ disabledReason: 'failures' }])
    expect(await h.store.listDue()).toEqual([])
    const turnedOff = (await h.store.readLog(hook.id)).filter((record) => record.error === 'hook_turned_off')
    expect(turnedOff).toHaveLength(MAX_CONSECUTIVE_FAILURES - 1)
  })

  it('sends nothing for a hook that is turned off', async () => {
    const h = harness()
    const hook = await withHook(h)
    const id = deliveryIdFor(hook.id, 'tx1', 'issue.created')
    await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')
    await h.store.saveHook({ ...hook, disabledOn: 0, disabledReason: 'manual' })
    await h.dispatcher.attempt(id)
    expect(h.sentAt).toEqual([])
    expect(await h.store.readLog(hook.id)).toMatchObject([{ error: 'hook_turned_off' }])
  })

  it('drops a delivery whose hook was deleted', async () => {
    const h = harness()
    const hook = await withHook(h)
    const id = deliveryIdFor(hook.id, 'tx1', 'issue.created')
    await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')
    await h.kv.deleteKey(`hook/${hook.id}`)
    await h.dispatcher.attempt(id)
    expect(h.sentAt).toEqual([])
    expect(await h.store.listDue()).toEqual([])
  })

  it('does not count test sends', async () => {
    const h = harness()
    const hook = await withHook(h)
    const outcome = await h.dispatcher.sendTest(hook, 'test-delivery', '{"event":"test"}')
    expect(outcome).toEqual(SERVER_ERROR)
    expect(await h.store.getHook(hook.id)).toMatchObject({ consecutiveFailures: 0 })
    expect(await h.store.readLog(hook.id)).toMatchObject([{ event: 'test', status: 500, attempt: 1 }])
  })

  it('counts failures of parallel attempts', async () => {
    const h = harness()
    const hook = await withHook(h)
    const ids = ['tx1', 'tx2', 'tx3'].map((txId) => deliveryIdFor(hook.id, txId, 'issue.created'))
    for (const id of ids) await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')
    await Promise.all(ids.map(async (id) => { await h.dispatcher.attempt(id) }))
    expect(await h.store.getHook(hook.id)).toMatchObject({ consecutiveFailures: 3 })
    expect(await h.store.readLog(hook.id)).toHaveLength(3)
  })

  it('turns a hook off by hand, failing what is pending', async () => {
    const h = harness()
    const hook = await withHook(h)
    await h.dispatcher.enqueue(hook, deliveryIdFor(hook.id, 'tx1', 'issue.created'), 'issue.created', '{}')
    const off = await h.dispatcher.turnOff(hook)
    expect(off).toMatchObject({ disabledReason: 'manual', disabledOn: 0 })
    expect(await h.store.listDue()).toEqual([])
    expect(h.changed).toEqual([off])
  })

  it('adds a hook and reports the change', async () => {
    const h = harness()
    const hook = storedHook('hook1')
    await h.dispatcher.add(hook)
    expect(await h.store.getHook(hook.id)).toEqual(hook)
    expect(h.changed).toEqual([hook])
  })

  it('changes events without losing a failure counted at the same time', async () => {
    const h = harness()
    const hook = await withHook(h)
    const id = deliveryIdFor(hook.id, 'tx1', 'issue.created')
    await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')
    const [edited] = await Promise.all([
      h.dispatcher.setEvents(hook, ['issue.deleted']),
      h.dispatcher.attempt(id)
    ])
    expect(edited.events).toEqual(['issue.deleted'])
    expect(await h.store.getHook(hook.id)).toMatchObject({ events: ['issue.deleted'], consecutiveFailures: 1 })
    expect(h.changed).toEqual([edited])
  })

  it('removes a hook without an attempt in flight writing its log back', async () => {
    const h = harness()
    const hook = await withHook(h)
    const id = deliveryIdFor(hook.id, 'tx1', 'issue.created')
    await h.dispatcher.enqueue(hook, id, 'issue.created', '{}')
    await Promise.all([h.dispatcher.attempt(id), h.dispatcher.remove(hook)])
    expect([...h.kv.values.keys()]).toEqual([])
    expect(h.changed).toEqual([`removed ${hook.id}`])
  })

  it('does not log a test send for a hook removed meanwhile', async () => {
    const h = harness()
    const hook = await withHook(h)
    await Promise.all([h.dispatcher.sendTest(hook, 'test-delivery', '{}'), h.dispatcher.remove(hook)])
    expect([...h.kv.values.keys()]).toEqual([])
  })

  it('turns a hook back on with a clean count', async () => {
    const h = harness()
    const hook = await withHook(h, { consecutiveFailures: 20, disabledOn: 0, disabledReason: 'failures' })
    const on = await h.dispatcher.turnOn(hook)
    expect(on.consecutiveFailures).toBe(0)
    expect(on).not.toHaveProperty('disabledOn')
    expect(on).not.toHaveProperty('disabledReason')
    expect(await h.store.getHook(hook.id)).toEqual(on)
  })
})
