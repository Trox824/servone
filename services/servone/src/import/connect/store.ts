import type { Caller } from '../../webhooks/auth'
import { type Grant, type Provider, type SourceId, sourceId } from './providers'

export const CONSENT_TTL_MS = 10 * 60_000
export const CONNECTION_TTL_MS = 2 * 60 * 60_000
const SECRET_BYTES = 32

export type Random = (bytes: number) => string

interface Consent {
  caller: Caller
  provider: Provider
  verifier: string
  expiresAt: number
}

export function sourceOfState (state: string): SourceId | undefined {
  const parsed = sourceId.safeParse(state.split('.')[0])
  return parsed.success ? parsed.data : undefined
}

export class Consents {
  private readonly pending = new Map<string, Consent>()

  constructor (private readonly now: () => number, private readonly random: Random) {}

  begin (caller: Caller, provider: Provider): { state: string, verifier: string } {
    this.sweep()
    const state = `${provider.source}.${this.random(SECRET_BYTES)}`
    const verifier = this.random(SECRET_BYTES)
    this.pending.set(state, { caller, provider, verifier, expiresAt: this.now() + CONSENT_TTL_MS })
    return { state, verifier }
  }

  take (state: string): Consent | undefined {
    const consent = this.pending.get(state)
    this.pending.delete(state)
    if (consent === undefined || consent.expiresAt <= this.now()) return undefined
    return consent
  }

  sweep (): void {
    const now = this.now()
    for (const [state, consent] of this.pending) if (consent.expiresAt <= now) this.pending.delete(state)
  }
}

export interface Connection {
  caller: Caller
  provider: Provider
  token: string
  refreshToken?: string
  tokenExpiresAt?: number
  guildId?: string
  channels: Set<string>
  expiresAt: number
}

export class Connections {
  private readonly connections = new Map<string, Connection>()

  constructor (private readonly now: () => number, private readonly random: Random) {}

  open (caller: Caller, provider: Provider, grant: Grant): string {
    this.sweep()
    const id = this.random(SECRET_BYTES)
    const connection: Connection = { caller, provider, token: grant.token, channels: new Set(), expiresAt: this.now() + CONNECTION_TTL_MS }
    if (grant.refreshToken !== undefined) connection.refreshToken = grant.refreshToken
    if (grant.expiresAt !== undefined) connection.tokenExpiresAt = grant.expiresAt
    if (grant.guildId !== undefined) connection.guildId = grant.guildId
    this.connections.set(id, connection)
    return id
  }

  use (id: string, caller: Caller): Connection | undefined {
    const connection = this.connections.get(id)
    if (connection === undefined || connection.caller.account !== caller.account || connection.caller.workspace !== caller.workspace) return undefined
    if (connection.expiresAt <= this.now()) {
      this.connections.delete(id)
      return undefined
    }
    connection.expiresAt = this.now() + CONNECTION_TTL_MS
    return connection
  }

  close (id: string, caller: Caller): Connection | undefined {
    const connection = this.use(id, caller)
    if (connection !== undefined) this.connections.delete(id)
    return connection
  }

  sweep (): void {
    const now = this.now()
    for (const [id, connection] of this.connections) if (connection.expiresAt <= now) this.connections.delete(id)
  }
}
