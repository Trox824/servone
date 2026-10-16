import type { KeyValueClient, ListResult } from '@hcengineering/kvs-client'

export class MemoryKv implements KeyValueClient {
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
