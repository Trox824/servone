import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'

export class FakeKeyValueClient implements KeyValueClient {
  readonly store = new Map<string, unknown>()
  async setValue<T> (key: string, value: T): Promise<void> { this.store.set(key, value) }
  async getValue<T> (key: string): Promise<T | null> { return (this.store.get(key) as T | undefined) ?? null }
  async deleteKey (key: string): Promise<void> { this.store.delete(key) }
  async listKeys (prefix?: string): Promise<ListResult | null> {
    const keys = [...this.store.keys()].filter((key) => prefix === undefined || key.startsWith(prefix))
    return { keys, count: keys.length, namespace: 'test' }
  }
}
