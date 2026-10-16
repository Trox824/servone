// hulykvs layout, namespace `servone-issues-api`:
//   idem/<apiTokenId>/<sha256(Idempotency-Key)>  IdempotencyRecord
import { generateId } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import { createHash } from 'crypto'
import { z } from 'zod'

import { TrackerInputError, type IssueDraft } from '../tracker/issues'

export const KVS_NAMESPACE = 'servone-issues-api'
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000 // Stripe's window; covers Zapier and n8n retry schedules

const idempotencyRecord = z.object({ fingerprint: z.string(), docId: z.string(), createdOn: z.number() })

export type IdempotencyRecord = z.infer<typeof idempotencyRecord>

export type FingerprintBody = IssueDraft | { text: string }

export type Keyed<T> =
  | { kind: 'created', doc: T }
  | { kind: 'replayed', doc: T }
  | { kind: 'in_progress' }
  | { kind: 'key_reused' }

export interface KeyedSteps<T> {
  find: (docId: string) => Promise<T | undefined>
  create: (docId: string) => Promise<T>
}

function sha256 (text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// Hashes the parsed body so JSON whitespace and key order do not count as a different request.
export function fingerprintOf (method: string, path: string, body: FingerprintBody): string {
  const fields = Object.entries(body)
    .filter(([, field]) => field !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return sha256(JSON.stringify([method, path, fields]))
}

// hulykvs has no compare-and-set, so the read-then-write below is only race-free with one replica.
export class Idempotency {
  private readonly running = new Set<string>()

  constructor (private readonly kv: KeyValueClient, private readonly now: () => number) {}

  async run<T> (scope: string, key: string, fingerprint: string, steps: KeyedSteps<T>): Promise<Keyed<T>> {
    const storeKey = `idem/${scope}/${sha256(key)}`
    if (this.running.has(storeKey)) return { kind: 'in_progress' }
    this.running.add(storeKey)
    try {
      return await this.runOnce(storeKey, fingerprint, steps)
    } finally {
      this.running.delete(storeKey)
    }
  }

  private async runOnce<T> (storeKey: string, fingerprint: string, steps: KeyedSteps<T>): Promise<Keyed<T>> {
    const record = await this.read(storeKey)
    if (record === undefined) {
      const fresh = { fingerprint, docId: generateId(), createdOn: this.now() }
      await this.kv.setValue(storeKey, fresh)
      return { kind: 'created', doc: await this.create(storeKey, fresh.docId, steps) }
    }
    if (record.fingerprint !== fingerprint) return { kind: 'key_reused' }
    const found = await steps.find(record.docId)
    if (found !== undefined) return { kind: 'replayed', doc: found }
    // An earlier attempt failed before writing; reusing its id keeps a late write from adding a second doc.
    return { kind: 'created', doc: await this.create(storeKey, record.docId, steps) }
  }

  private async read (storeKey: string): Promise<IdempotencyRecord | undefined> {
    const stored = await this.kv.getValue(storeKey)
    if (stored === null) return undefined
    const record = idempotencyRecord.parse(stored)
    return this.now() - record.createdOn >= IDEMPOTENCY_TTL_MS ? undefined : record
  }

  private async create<T> (storeKey: string, docId: string, steps: KeyedSteps<T>): Promise<T> {
    try {
      return await steps.create(docId)
    } catch (error) {
      if (error instanceof TrackerInputError) await this.kv.deleteKey(storeKey)
      throw error
    }
  }
}
