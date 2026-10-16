import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'

import { TrackerInputError } from '../../tracker/issues'
import { fingerprintOf, IDEMPOTENCY_TTL_MS, Idempotency } from '../idempotency'

class MemoryKv implements KeyValueClient {
  readonly values = new Map<string, string>()

  async setValue<T>(key: string, value: T): Promise<void> {
    this.values.set(key, JSON.stringify(value))
  }

  async getValue<T>(key: string): Promise<T | null> {
    const stored = this.values.get(key)
    return stored === undefined ? null : (JSON.parse(stored) as T)
  }

  async deleteKey (key: string): Promise<void> {
    this.values.delete(key)
  }

  async listKeys (prefix?: string): Promise<ListResult | null> {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(prefix ?? ''))
    return { keys, count: keys.length, namespace: 'test' }
  }
}

interface Harness {
  kv: MemoryKv
  clock: { now: number }
  idempotency: Idempotency
  docs: Map<string, string>
  create: jest.Mock<Promise<string>, [string]>
  find: jest.Mock<Promise<string | undefined>, [string]>
}

function start (): Harness {
  const kv = new MemoryKv()
  const clock = { now: 1_000 }
  const docs = new Map<string, string>()
  const create = jest.fn(async (docId: string) => {
    docs.set(docId, `doc ${docId}`)
    return `doc ${docId}`
  })
  const find = jest.fn(async (docId: string) => docs.get(docId))
  return { kv, clock, idempotency: new Idempotency(kv, () => clock.now), docs, create, find }
}

describe('fingerprintOf', () => {
  it('ignores key order and undefined fields', () => {
    expect(fingerprintOf('POST', '/v1/tracker/issues', { project: 'SRV', title: 'A', description: undefined })).toBe(
      fingerprintOf('POST', '/v1/tracker/issues', { title: 'A', project: 'SRV' })
    )
  })

  it('differs by path and body', () => {
    const base = fingerprintOf('POST', '/v1/tracker/issues', { project: 'SRV', title: 'A' })
    expect(fingerprintOf('POST', '/v1/tracker/issues/SRV-1/comments', { project: 'SRV', title: 'A' })).not.toBe(base)
    expect(fingerprintOf('POST', '/v1/tracker/issues', { project: 'SRV', title: 'B' })).not.toBe(base)
  })
})

describe('Idempotency.run', () => {
  it('creates once and replays the same document', async () => {
    const h = start()
    const first = await h.idempotency.run('token-1', 'key-1', 'fp', h)
    const second = await h.idempotency.run('token-1', 'key-1', 'fp', h)
    expect(first.kind).toBe('created')
    expect(second).toEqual({ kind: 'replayed', doc: 'doc' in first ? first.doc : undefined })
    expect(h.create).toHaveBeenCalledTimes(1)
    expect([...h.kv.values.keys()]).toEqual([expect.stringMatching(/^idem\/token-1\/[0-9a-f]{64}$/)])
  })

  it('keeps tokens apart', async () => {
    const h = start()
    await h.idempotency.run('token-1', 'key-1', 'fp', h)
    expect((await h.idempotency.run('token-2', 'key-1', 'fp', h)).kind).toBe('created')
  })

  it('refuses the same key with another body', async () => {
    const h = start()
    await h.idempotency.run('token-1', 'key-1', 'fp', h)
    expect(await h.idempotency.run('token-1', 'key-1', 'other', h)).toEqual({ kind: 'key_reused' })
  })

  it('treats an expired record as absent', async () => {
    const h = start()
    await h.idempotency.run('token-1', 'key-1', 'fp', h)
    h.clock.now += IDEMPOTENCY_TTL_MS
    expect((await h.idempotency.run('token-1', 'key-1', 'other', h)).kind).toBe('created')
    expect(h.create).toHaveBeenCalledTimes(2)
    expect(h.create.mock.calls[0][0]).not.toBe(h.create.mock.calls[1][0])
  })

  it('creates with the stored id when the first attempt left no document', async () => {
    const h = start()
    h.create.mockRejectedValueOnce(new Error('transactor down'))
    await expect(h.idempotency.run('token-1', 'key-1', 'fp', h)).rejects.toThrow('transactor down')
    const retried = await h.idempotency.run('token-1', 'key-1', 'fp', h)
    expect(retried.kind).toBe('created')
    expect(h.create.mock.calls[1][0]).toBe(h.create.mock.calls[0][0])
  })

  it('forgets the key after an input error so a fixed request can reuse it', async () => {
    const h = start()
    h.create.mockRejectedValueOnce(new TrackerInputError('Status "x" not found', 'status', 'invalid'))
    await expect(h.idempotency.run('token-1', 'key-1', 'fp', h)).rejects.toBeInstanceOf(TrackerInputError)
    expect(h.kv.values.size).toBe(0)
    expect((await h.idempotency.run('token-1', 'key-1', 'fixed', h)).kind).toBe('created')
  })

  it('answers in_progress while the same key is running', async () => {
    const h = start()
    let finish = (): void => {}
    h.create.mockImplementationOnce(async (docId) => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      h.docs.set(docId, `doc ${docId}`)
      return `doc ${docId}`
    })
    const first = h.idempotency.run('token-1', 'key-1', 'fp', h)
    await new Promise((resolve) => setImmediate(resolve))
    expect(await h.idempotency.run('token-1', 'key-1', 'fp', h)).toEqual({ kind: 'in_progress' })
    finish()
    expect((await first).kind).toBe('created')
    expect((await h.idempotency.run('token-1', 'key-1', 'fp', h)).kind).toBe('replayed')
  })
})
