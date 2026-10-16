import { createHash } from 'crypto'
import type { AttemptOutcome } from './send'
import type {
  AttemptRecord,
  DeliveryEvent,
  HookEvent,
  LogError,
  OutgoingHook,
  OutgoingHookStore,
  PendingDelivery
} from './store'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
// Delay before attempts 2..6, counted from the end of the previous attempt; about 9 hours in all.
export const RETRY_DELAYS_MS = [MINUTE_MS, 5 * MINUTE_MS, 30 * MINUTE_MS, 2 * HOUR_MS, 6 * HOUR_MS]
export const SWEEP_INTERVAL_MS = 30_000
// Longer than the whole schedule, so only a module switched off for a while flushes stale events.
export const EXPIRE_AFTER_MS = 12 * HOUR_MS
export const MAX_CONSECUTIVE_FAILURES = 20
// One slow receiver must not tie up the process.
export const MAX_PARALLEL_SENDS = 10
// A dead receiver on a busy channel must not grow KVS without bound.
export const MAX_PENDING_PER_HOOK = 1000
const DELIVERY_ID_HEX_CHARS = 32

type Pending<H extends OutgoingHook> = PendingDelivery<HookEvent<H>>
type Attempt<H extends OutgoingHook> = AttemptRecord<HookEvent<H>>

export function nextAttemptAt (attempt: number, finishedAt: number): number | undefined {
  const delay = RETRY_DELAYS_MS[attempt - 1]
  return delay === undefined ? undefined : finishedAt + delay
}

// Same tx, hook and event give the same id, so a replayed Kafka message is recognised.
export function deliveryIdFor (hookId: string, txId: string, event: string): string {
  return createHash('sha256').update(`${hookId}:${txId}:${event}`).digest('hex').slice(0, DELIVERY_ID_HEX_CHARS)
}

const isDelivered = (record: AttemptRecord): boolean => record.error === undefined && record.status >= 200 && record.status < 300

export interface DispatcherDeps<H extends OutgoingHook> {
  store: OutgoingHookStore<H>
  send: (hook: H, delivery: Pending<H>) => Promise<AttemptOutcome>
  notifyDisabled: (hook: H, last: Attempt<H>) => Promise<void>
  // Called when a hook is added, edited, turned off or on, or removed (hook undefined), so the consumer's routing follows.
  onHookChanged: (id: string, hook: H | undefined) => void
  now: () => number
  report: (event: string, fields: Record<string, string | number>) => void
}

export class Dispatcher<H extends OutgoingHook> {
  private readonly inFlight = new Set<string>()
  // Log and counter writes are read-modify-write in KVS, so each hook's writes run one at a time.
  private readonly hookChains = new Map<string, Promise<void>>()
  private readonly waiting: Array<() => void> = []
  private running = 0
  private timer: ReturnType<typeof setInterval> | undefined
  // Seeded once per hook from KVS, then kept in memory; each replica holds its own count.
  private readonly pending = new Map<string, number>()
  private readonly dropped = new Map<string, { count: number, event: DeliveryEvent<HookEvent<H>> }>()

  constructor (private readonly deps: DispatcherDeps<H>) {}

  start (): void {
    this.sweepInBackground()
    this.timer = setInterval(() => {
      this.sweepInBackground()
    }, SWEEP_INTERVAL_MS)
  }

  stop (): void {
    clearInterval(this.timer)
  }

  async enqueue (hook: H, id: string, event: DeliveryEvent<HookEvent<H>>, body: string): Promise<Pending<H> | undefined> {
    if ((await this.deps.store.getDelivery(id)) !== undefined) return undefined
    const log = await this.deps.store.readLog(hook.id)
    if (log.some((record) => record.deliveryId === id)) return undefined
    const waiting = await this.pendingCount(hook.id)
    if (waiting >= MAX_PENDING_PER_HOOK) {
      this.dropped.set(hook.id, { count: (this.dropped.get(hook.id)?.count ?? 0) + 1, event })
      return undefined
    }
    const now = this.deps.now()
    const delivery: Pending<H> = { id, hook: hook.id, event, body, attempt: 1, firstAttemptAt: now, nextAttemptAt: now }
    await this.deps.store.saveDelivery(delivery)
    this.pending.set(hook.id, waiting + 1)
    return delivery
  }

  // A failed first attempt stays in due/, so the next sweep picks it up.
  kick (delivery: Pending<H>): void {
    this.attempt(delivery.id).catch((error: Error) => {
      this.deps.report('delivery attempt failed', { delivery: delivery.id, error: error.message })
    })
  }

  async sweep (): Promise<void> {
    const now = this.deps.now()
    const due = (await this.deps.store.listDue()).filter((entry) => entry.at <= now)
    // One broken delivery must not stop the others; it stays in due/ for the next sweep.
    const settled = await Promise.allSettled(due.map(async (entry) => { await this.attempt(entry.id) }))
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        this.deps.report('delivery attempt failed', { error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) })
      }
    }
    await this.flushDropped()
  }

  async attempt (id: string): Promise<void> {
    if (this.inFlight.has(id)) return
    this.inFlight.add(id)
    try {
      await this.attemptOnce(id)
    } finally {
      this.inFlight.delete(id)
    }
  }

  async sendTest (hook: H, id: string, body: string): Promise<AttemptOutcome> {
    const now = this.deps.now()
    const delivery: Pending<H> = { id, hook: hook.id, event: 'test', body, attempt: 1, firstAttemptAt: now, nextAttemptAt: now }
    const outcome = await this.limited(async () => await this.deps.send(hook, delivery))
    await this.serialized(hook.id, async () => {
      if ((await this.deps.store.getHook(hook.id)) === undefined) return
      await this.deps.store.appendLog(hook.id, this.attemptRecord(delivery, now, outcome))
    })
    return outcome
  }

  async add (hook: H): Promise<void> {
    await this.deps.store.saveHook(hook)
    this.deps.onHookChanged(hook.id, hook)
  }

  async edit (hook: H, change: (current: H) => H): Promise<H> {
    return await this.serialized(hook.id, async () => {
      const edited = change((await this.deps.store.getHook(hook.id)) ?? hook)
      await this.deps.store.saveHook(edited)
      this.deps.onHookChanged(edited.id, edited)
      return edited
    })
  }

  async setEvents (hook: H, events: H['events']): Promise<H> {
    return await this.edit(hook, (current) => ({ ...current, events }))
  }

  async remove (hook: H): Promise<void> {
    await this.serialized(hook.id, async () => {
      await this.deps.store.deleteHook(hook)
      this.pending.delete(hook.id)
      this.dropped.delete(hook.id)
      this.deps.onHookChanged(hook.id, undefined)
    })
  }

  async turnOff (hook: H): Promise<H> {
    return await this.serialized(hook.id, async () => {
      const current = (await this.deps.store.getHook(hook.id)) ?? hook
      const off: H = { ...current, disabledOn: this.deps.now(), disabledReason: 'manual' }
      await this.disable(off)
      return off
    })
  }

  // Starts clean: no backlog is kept while a hook is off, and the failure count restarts.
  async turnOn (hook: H): Promise<H> {
    return await this.serialized(hook.id, async () => {
      const current = (await this.deps.store.getHook(hook.id)) ?? hook
      const on: H = { ...current, consecutiveFailures: 0 }
      delete on.disabledOn
      delete on.disabledReason
      await this.deps.store.saveHook(on)
      this.deps.onHookChanged(on.id, on)
      return on
    })
  }

  private async pendingCount (hookId: string): Promise<number> {
    const known = this.pending.get(hookId)
    if (known !== undefined) return known
    const counted = (await this.deps.store.listHookDeliveries(hookId)).length
    this.pending.set(hookId, counted)
    return counted
  }

  private async forget (delivery: Pending<H>): Promise<void> {
    await this.deps.store.removeDelivery(delivery)
    const known = this.pending.get(delivery.hook)
    if (known !== undefined) this.pending.set(delivery.hook, Math.max(0, known - 1))
  }

  private async flushDropped (): Promise<void> {
    for (const [hookId, { count, event }] of [...this.dropped]) {
      this.dropped.delete(hookId)
      await this.serialized(hookId, async () => {
        if ((await this.deps.store.getHook(hookId)) === undefined) return
        await this.deps.store.appendLog(hookId, {
          at: this.deps.now(),
          deliveryId: '',
          event,
          attempt: 0,
          status: 0,
          error: 'dropped',
          durationMs: 0,
          responseStart: '',
          dropped: count
        })
      })
      this.deps.report('outgoing events dropped', { hook: hookId, count })
    }
  }

  // The next tick sweeps again, so a KVS outage only delays deliveries.
  private sweepInBackground (): void {
    this.sweep().catch((error: Error) => {
      this.deps.report('delivery sweep failed', { error: error.message })
    })
  }

  private async attemptOnce (id: string): Promise<void> {
    const { store } = this.deps
    const delivery = await store.getDelivery(id)
    if (delivery === undefined) return
    const hook = await store.getHook(delivery.hook)
    if (hook === undefined) {
      await this.forget(delivery)
      return
    }
    if (hook.disabledOn !== undefined) {
      await this.serialized(hook.id, async () => { await this.failDelivery(delivery, 'hook_turned_off') })
      return
    }
    const startedAt = this.deps.now()
    if (startedAt - delivery.firstAttemptAt > EXPIRE_AFTER_MS) {
      await this.serialized(hook.id, async () => { await this.failDelivery(delivery, 'expired') })
      return
    }
    const outcome = await this.limited(async () => await this.deps.send(hook, delivery))
    const record = this.attemptRecord(delivery, startedAt, outcome)
    await this.serialized(hook.id, async () => { await this.recordAttempt(delivery, record) })
  }

  private async recordAttempt (delivery: Pending<H>, record: Attempt<H>): Promise<void> {
    const { store } = this.deps
    const hook = await store.getHook(delivery.hook)
    // Removed while this attempt was in flight: a log line now would outlive the hook.
    if (hook === undefined) {
      await this.forget(delivery)
      return
    }
    await store.appendLog(delivery.hook, record)
    if (hook.disabledOn !== undefined) {
      await this.forget(delivery)
      return
    }
    if (isDelivered(record)) {
      await this.forget(delivery)
      if (hook.consecutiveFailures > 0) await store.saveHook({ ...hook, consecutiveFailures: 0 })
      return
    }
    const failures = hook.consecutiveFailures + 1
    const next = nextAttemptAt(delivery.attempt, this.deps.now())
    if (next === undefined || failures >= MAX_CONSECUTIVE_FAILURES) {
      await this.forget(delivery)
    } else {
      await store.moveDelivery(delivery, { ...delivery, attempt: delivery.attempt + 1, nextAttemptAt: next })
    }
    if (failures < MAX_CONSECUTIVE_FAILURES) {
      await store.saveHook({ ...hook, consecutiveFailures: failures })
      return
    }
    const disabled: H = {
      ...hook,
      consecutiveFailures: failures,
      disabledOn: this.deps.now(),
      disabledReason: 'failures'
    }
    await this.disable(disabled)
    this.deps.report('hook turned off after failures', { hook: hook.id, workspace: hook.workspace })
    // The hook is already off; a mail outage must not undo that or retry the attempt.
    await this.deps.notifyDisabled(disabled, record).catch((error: Error) => {
      this.deps.report('turned-off hook mail failed', { hook: hook.id, error: error.message })
    })
  }

  // Deliveries mid-send are skipped: their own attempt sees the hook off and ends them.
  private async disable (hook: H): Promise<void> {
    await this.deps.store.saveHook(hook)
    this.deps.onHookChanged(hook.id, hook)
    for (const pending of await this.deps.store.listHookDeliveries(hook.id)) {
      if (!this.inFlight.has(pending.id)) await this.failDelivery(pending, 'hook_turned_off')
    }
  }

  private async failDelivery (delivery: Pending<H>, error: LogError): Promise<void> {
    await this.deps.store.appendLog(delivery.hook, {
      at: this.deps.now(),
      deliveryId: delivery.id,
      event: delivery.event,
      attempt: delivery.attempt,
      status: 0,
      error,
      durationMs: 0,
      responseStart: ''
    })
    await this.forget(delivery)
  }

  private attemptRecord (delivery: Pending<H>, startedAt: number, outcome: AttemptOutcome): Attempt<H> {
    const record: Attempt<H> = {
      at: startedAt,
      deliveryId: delivery.id,
      event: delivery.event,
      attempt: delivery.attempt,
      status: outcome.status,
      durationMs: outcome.durationMs,
      responseStart: outcome.responseStart
    }
    if (outcome.error !== undefined) record.error = outcome.error
    return record
  }

  private async limited<T>(work: () => Promise<T>): Promise<T> {
    while (this.running >= MAX_PARALLEL_SENDS) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.running++
    try {
      return await work()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }

  private async serialized<T>(hookId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.hookChains.get(hookId) ?? Promise.resolve()
    const run = previous.then(work)
    const settled = run.then(
      () => undefined,
      () => undefined
    )
    this.hookChains.set(hookId, settled)
    try {
      return await run
    } finally {
      if (this.hookChains.get(hookId) === settled) this.hookChains.delete(hookId)
    }
  }
}
