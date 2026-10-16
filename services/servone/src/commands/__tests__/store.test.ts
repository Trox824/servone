import type { Channel } from '@hcengineering/chunter'
import type { AccountUuid, Ref, WorkspaceUuid } from '@hcengineering/core'
import { MemoryKv } from '../../tracker-hooks/__tests__/memory-kv'
import {
  CommandStore,
  RESPONSE_URL_MAX_USES,
  RESPONSE_URL_TTL_MS,
  type StoredCommand,
  type StoredResponseUrl
} from '../store'

const WORKSPACE = 'ws-1' as WorkspaceUuid
const OTHER_WORKSPACE = 'ws-2' as WorkspaceUuid

function command (id: string, name: string, workspace = WORKSPACE): StoredCommand {
  return {
    id,
    workspace,
    name,
    description: '',
    usage: '',
    url: 'https://app.test/hook',
    sealedSecret: { keyId: 'k', iv: '', tag: '', data: '' },
    createdBy: 'acc-1' as AccountUuid,
    createdOn: 1
  }
}

const response = (expiresOn: number): StoredResponseUrl => ({
  workspace: WORKSPACE,
  commandId: 'c1',
  commandName: 'deploy',
  channel: 'chunter:space:General' as Ref<Channel>,
  runner: 'acc-1' as AccountUuid,
  runnerName: 'Ana Lee',
  expiresOn,
  uses: 0
})

describe('CommandStore', () => {
  it('lists a workspace commands by name and keeps workspaces apart', async () => {
    const store = new CommandStore(new MemoryKv())
    await store.saveCommand(command('c1', 'status'))
    await store.saveCommand(command('c2', 'deploy'))
    await store.saveCommand(command('c3', 'deploy', OTHER_WORKSPACE))
    expect((await store.listCommands(WORKSPACE)).map((stored) => stored.name)).toEqual(['deploy', 'status'])
    expect((await store.findByName(WORKSPACE, 'deploy'))?.id).toBe('c2')
    expect(await store.getCommand(OTHER_WORKSPACE, 'c1')).toBeUndefined()
  })

  it('deletes a command', async () => {
    const store = new CommandStore(new MemoryKv())
    await store.saveCommand(command('c1', 'deploy'))
    await store.deleteCommand(WORKSPACE, 'c1')
    expect(await store.listCommands(WORKSPACE)).toEqual([])
  })

  it('allows a response URL five times, then refuses it', async () => {
    const store = new CommandStore(new MemoryKv())
    await store.saveResponseUrl('tok', response(1_000 + RESPONSE_URL_TTL_MS))
    for (let use = 1; use <= RESPONSE_URL_MAX_USES; use++) {
      const allowed = await store.useResponseUrl('tok', 1_000)
      expect(allowed).toEqual({ isAllowed: true, response: { ...response(1_000 + RESPONSE_URL_TTL_MS), uses: use } })
    }
    expect(await store.useResponseUrl('tok', 1_000)).toEqual({ isAllowed: false })
  })

  it('refuses and removes an expired response URL', async () => {
    const kv = new MemoryKv()
    const store = new CommandStore(kv)
    await store.saveResponseUrl('tok', response(5_000))
    expect(await store.useResponseUrl('tok', 5_000)).toEqual({ isAllowed: false })
    expect([...kv.values.keys()].filter((key) => key.startsWith('resp/'))).toEqual([])
  })

  it('keys response URLs by hash, never by the token', async () => {
    const kv = new MemoryKv()
    await new CommandStore(kv).saveResponseUrl('secret-token', response(5_000))
    expect([...kv.values.keys()].some((key) => key.includes('secret-token'))).toBe(false)
  })

  it('sweeps only expired response URLs', async () => {
    const kv = new MemoryKv()
    const store = new CommandStore(kv)
    await store.saveResponseUrl('old', response(1_000))
    await store.saveResponseUrl('fresh', response(9_000))
    await store.sweepExpiredResponseUrls(2_000)
    expect(await store.useResponseUrl('fresh', 2_000)).toMatchObject({ isAllowed: true })
    expect([...kv.values.keys()].filter((key) => key.startsWith('resp/'))).toHaveLength(1)
  })
})
