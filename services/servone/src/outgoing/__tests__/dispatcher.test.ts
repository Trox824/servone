import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { MemoryKv } from '../../tracker-hooks/__tests__/memory-kv'
import { deliveryIdFor, Dispatcher, MAX_PENDING_PER_HOOK } from '../dispatcher'
import type { AttemptOutcome } from '../send'
import { type OutgoingHook, OutgoingHookStore } from '../store'

interface RoomHook extends OutgoingHook<'ping'> {
  room: string
}

const OK: AttemptOutcome = { status: 200, durationMs: 1, responseStart: 'ok' }
const HOOK: RoomHook = {
  id: 'hook1',
  workspace: 'ws-1' as WorkspaceUuid,
  room: 'r1',
  url: 'https://hooks.example.com/in',
  events: ['ping'],
  sealedSecret: { keyId: 'a', iv: '', tag: '', data: '' },
  createdBy: 'owner' as AccountUuid,
  createdOn: 1,
  consecutiveFailures: 0
}

function harness (kv = new MemoryKv()): {
  store: OutgoingHookStore<RoomHook>
  dispatcher: Dispatcher<RoomHook>
  clock: { now: number }
  reports: string[]
  changed: Array<RoomHook | undefined>
} {
  const store = new OutgoingHookStore<RoomHook>(kv, { prefix: 'room', ownerOf: (hook) => hook.room })
  const clock = { now: 10 }
  const reports: string[] = []
  const changed: Array<RoomHook | undefined> = []
  const dispatcher = new Dispatcher<RoomHook>({
    store,
    send: async () => OK,
    notifyDisabled: async () => {},
    onHookChanged: (_id, hook) => { changed.push(hook) },
    now: () => clock.now,
    report: (event) => { reports.push(event) }
  })
  return { store, dispatcher, clock, reports, changed }
}

async function fill (dispatcher: Dispatcher<RoomHook>, count: number): Promise<void> {
  for (let n = 0; n < count; n++) await dispatcher.enqueue(HOOK, deliveryIdFor(HOOK.id, `tx${n}`, 'ping'), 'ping', '{}')
}

describe('Dispatcher pending cap', () => {
  it('drops events past the cap and logs one line per sweep', async () => {
    const h = harness()
    await h.store.saveHook(HOOK)
    await fill(h.dispatcher, MAX_PENDING_PER_HOOK)
    for (const txId of ['over1', 'over2', 'over3']) {
      expect(await h.dispatcher.enqueue(HOOK, deliveryIdFor(HOOK.id, txId, 'ping'), 'ping', '{}')).toBeUndefined()
    }
    expect(await h.store.listDue()).toHaveLength(MAX_PENDING_PER_HOOK)
    // Before anything is due, so the sweep only flushes the dropped count.
    h.clock.now = 5
    await h.dispatcher.sweep()
    await h.dispatcher.sweep()
    expect(await h.store.readLog(HOOK.id)).toMatchObject([{ error: 'dropped', dropped: 3, event: 'ping', status: 0, deliveryId: '' }])
    expect(h.reports).toEqual(['outgoing events dropped'])
  })

  it('makes room again once a delivery is gone', async () => {
    const h = harness()
    await h.store.saveHook(HOOK)
    await fill(h.dispatcher, MAX_PENDING_PER_HOOK)
    await h.dispatcher.attempt(deliveryIdFor(HOOK.id, 'tx0', 'ping'))
    expect(await h.dispatcher.enqueue(HOOK, deliveryIdFor(HOOK.id, 'late', 'ping'), 'ping', '{}')).toBeDefined()
  })

  it('counts deliveries left by an earlier process', async () => {
    const kv = new MemoryKv()
    const first = harness(kv)
    await first.store.saveHook(HOOK)
    await fill(first.dispatcher, MAX_PENDING_PER_HOOK)
    const restarted = harness(kv)
    expect(await restarted.dispatcher.enqueue(HOOK, deliveryIdFor(HOOK.id, 'late', 'ping'), 'ping', '{}')).toBeUndefined()
  })
})

describe('Dispatcher.edit', () => {
  it('saves the change on the stored hook and reports it', async () => {
    const h = harness()
    await h.store.saveHook({ ...HOOK, consecutiveFailures: 4 })
    const edited = await h.dispatcher.edit(HOOK, (current) => ({ ...current, url: 'https://other.example.com/in' }))
    expect(edited).toMatchObject({ url: 'https://other.example.com/in', consecutiveFailures: 4 })
    expect(await h.store.getHook(HOOK.id)).toEqual(edited)
    expect(h.changed).toEqual([edited])
  })
})
