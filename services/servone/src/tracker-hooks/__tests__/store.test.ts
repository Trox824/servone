import type { Ref } from '@hcengineering/core'
import type { Project } from '@hcengineering/tracker'
import { type PendingDelivery, TrackerHookStore } from '../store'
import { PROJECT, storedHook, WORKSPACE } from './fixtures'
import { MemoryKv } from './memory-kv'

function delivery (id: string, hook: string, nextAttemptAt: number): PendingDelivery {
  return { id, hook, event: 'issue.created', body: '{}', attempt: 1, firstAttemptAt: nextAttemptAt, nextAttemptAt }
}

describe('TrackerHookStore', () => {
  it('lists a project\'s hooks newest first', async () => {
    const store = new TrackerHookStore(new MemoryKv())
    await store.saveHook(storedHook('a', { createdOn: 1 }))
    await store.saveHook(storedHook('b', { createdOn: 2 }))
    await store.saveHook(storedHook('c', { project: 'other' as Ref<Project> }))
    expect((await store.listProjectHooks(WORKSPACE, PROJECT)).map((hook) => hook.id)).toEqual(['b', 'a'])
    expect((await store.listAllHooks()).map((hook) => hook.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('lists due deliveries in time order', async () => {
    const store = new TrackerHookStore(new MemoryKv())
    await store.saveDelivery(delivery('late', 'a', 90_000))
    await store.saveDelivery(delivery('early', 'a', 5_000))
    expect(await store.listDue()).toEqual([{ at: 5_000, id: 'early' }, { at: 90_000, id: 'late' }])
  })

  it('moves a delivery to its new time', async () => {
    const store = new TrackerHookStore(new MemoryKv())
    const first = delivery('d1', 'a', 5_000)
    await store.saveDelivery(first)
    await store.moveDelivery(first, { ...first, attempt: 2, nextAttemptAt: 65_000 })
    expect(await store.listDue()).toEqual([{ at: 65_000, id: 'd1' }])
    expect(await store.getDelivery('d1')).toMatchObject({ attempt: 2 })
  })

  it('keeps the newest 50 log entries', async () => {
    const store = new TrackerHookStore(new MemoryKv())
    for (let at = 1; at <= 55; at++) {
      await store.appendLog('a', { at, deliveryId: `d${at}`, event: 'test', attempt: 1, status: 200, durationMs: 1, responseStart: '' })
    }
    const log = await store.readLog('a')
    expect(log).toHaveLength(50)
    expect(log[0].at).toBe(55)
  })

  it('deletes a hook with its index, log and pending deliveries', async () => {
    const kv = new MemoryKv()
    const store = new TrackerHookStore(kv)
    const hook = storedHook('a')
    await store.saveHook(hook)
    await store.saveHook(storedHook('b'))
    await store.appendLog('a', { at: 1, deliveryId: 'd0', event: 'test', attempt: 1, status: 200, durationMs: 1, responseStart: '' })
    await store.saveDelivery(delivery('d1', 'a', 5_000))
    await store.saveDelivery(delivery('d2', 'b', 5_000))
    await store.deleteHook(hook)
    expect([...kv.values.keys()].sort()).toEqual(['delivery/d2', 'due/0000000005000/d2', 'hook/b', 'proj/ws-1/project-srv/b'])
  })
})
