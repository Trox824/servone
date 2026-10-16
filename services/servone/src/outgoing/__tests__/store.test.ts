import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { MemoryKv } from '../../tracker-hooks/__tests__/memory-kv'
import { type OutgoingHook, OutgoingHookStore } from '../store'

interface RoomHook extends OutgoingHook<'ping'> {
  room: string
}

const WORKSPACE = 'ws-1' as WorkspaceUuid

function roomHook (id: string, room: string, createdOn = 1): RoomHook {
  return {
    id,
    workspace: WORKSPACE,
    room,
    url: 'https://hooks.example.com/in',
    events: ['ping'],
    sealedSecret: { keyId: 'a', iv: '', tag: '', data: '' },
    createdBy: 'owner' as AccountUuid,
    createdOn,
    consecutiveFailures: 0
  }
}

describe('OutgoingHookStore', () => {
  it('indexes hooks under the owner prefix it is given', async () => {
    const kv = new MemoryKv()
    const store = new OutgoingHookStore<RoomHook>(kv, { prefix: 'room', ownerOf: (hook) => hook.room })
    await store.saveHook(roomHook('a', 'r1', 1))
    await store.saveHook(roomHook('b', 'r1', 2))
    await store.saveHook(roomHook('c', 'r2'))
    expect([...kv.values.keys()].filter((key) => key.startsWith('room/')).sort()).toEqual([
      'room/ws-1/r1/a',
      'room/ws-1/r1/b',
      'room/ws-1/r2/c'
    ])
    expect((await store.listOwnerHooks(WORKSPACE, 'r1')).map((hook) => hook.id)).toEqual(['b', 'a'])
    expect((await store.listAllHooks()).map((hook) => hook.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('does not list hooks of another owner prefix sharing the namespace', async () => {
    const kv = new MemoryKv()
    await new OutgoingHookStore<RoomHook>(kv, { prefix: 'room', ownerOf: (hook) => hook.room }).saveHook(roomHook('a', 'r1'))
    const other = new OutgoingHookStore<RoomHook>(kv, { prefix: 'hall', ownerOf: (hook) => hook.room })
    expect(await other.listAllHooks()).toEqual([])
  })
})
