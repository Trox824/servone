import type { KeyValueClient } from '@hcengineering/kvs-client'
import { z } from 'zod'

// hulykvs has no TTL, so every short-lived record carries expiresAt and reads drop stale ones.
export const OAUTH_KVS_NAMESPACE = 'servone-mcp-oauth'

const registeredClientSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  redirectUris: z.array(z.string()),
  createdOn: z.number()
})

const authRequestSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  redirectUri: z.string(),
  codeChallenge: z.string(),
  state: z.string().optional(),
  expiresAt: z.number()
})

// The request is gone once approved, so the code keeps what the token endpoint must check.
const authCodeSchema = z.object({
  code: z.string(),
  clientId: z.string(),
  redirectUri: z.string(),
  codeChallenge: z.string(),
  apiToken: z.string(),
  apiTokenExpiresAt: z.number(),
  expiresAt: z.number()
})

export type RegisteredClient = z.infer<typeof registeredClientSchema>
export type AuthRequest = z.infer<typeof authRequestSchema>
export type AuthCode = z.infer<typeof authCodeSchema>

const clientKey = (id: string): string => `client:${id}`
const requestKey = (id: string): string => `request:${id}`
const codeKey = (code: string): string => `code:${code}`

// Single-use codes need exactly one replica until hulykvs offers an atomic get-and-delete.
export class OAuthStore {
  private readonly claimed = new Set<string>()

  constructor (private readonly kv: KeyValueClient) {}

  async getClient (clientId: string): Promise<RegisteredClient | undefined> {
    return await this.read(clientKey(clientId), registeredClientSchema)
  }

  async saveClient (client: RegisteredClient): Promise<void> {
    await this.kv.setValue(clientKey(client.clientId), client)
  }

  async getRequest (id: string, now: number): Promise<AuthRequest | undefined> {
    return await this.readLive(requestKey(id), authRequestSchema, now)
  }

  async saveRequest (request: AuthRequest): Promise<void> {
    await this.kv.setValue(requestKey(request.id), request)
  }

  async takeRequest (id: string, now: number): Promise<AuthRequest | undefined> {
    return await this.take(requestKey(id), authRequestSchema, now)
  }

  async saveCode (code: AuthCode): Promise<void> {
    await this.kv.setValue(codeKey(code.code), code)
  }

  // Deleted before the caller checks anything, so a failed redemption also burns the code.
  async takeCode (code: string, now: number): Promise<AuthCode | undefined> {
    return await this.take(codeKey(code), authCodeSchema, now)
  }

  private async take<T extends { expiresAt: number }>(key: string, schema: z.ZodType<T>, now: number): Promise<T | undefined> {
    if (this.claimed.has(key)) return undefined
    this.claimed.add(key)
    try {
      const stored = await this.read(key, schema)
      if (stored === undefined) return undefined
      await this.kv.deleteKey(key)
      return stored.expiresAt > now ? stored : undefined
    } finally {
      this.claimed.delete(key)
    }
  }

  private async read<T>(key: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const raw = await this.kv.getValue<unknown>(key)
    return raw === null ? undefined : schema.parse(raw)
  }

  private async readLive<T extends { expiresAt: number }>(key: string, schema: z.ZodType<T>, now: number): Promise<T | undefined> {
    const stored = await this.read(key, schema)
    if (stored === undefined) return undefined
    if (stored.expiresAt > now) return stored
    await this.kv.deleteKey(key)
    return undefined
  }
}
