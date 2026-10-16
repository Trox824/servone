// Default rates for the webhooks caller; chat uses its own (services/servone/src/mcp/chat/limiter.ts).
export const BURST = 5
export const REFILL_PER_SECOND = 1
// Hook ids come from the URL before any lookup, so random ids must not grow the map without bound.
const MAX_TRACKED_KEYS = 10_000

interface Bucket {
  tokens: number
  updatedAt: number
}

export type RateDecision = { isAllowed: true } | { isAllowed: false, retryAfterSeconds: number }

export class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>()

  constructor (private readonly burst: number = BURST, private readonly refillPerSecond: number = REFILL_PER_SECOND) {}

  take (key: string, now: number): RateDecision {
    const bucket = this.refilled(key, now)
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      this.buckets.set(key, bucket)
      return { isAllowed: true }
    }
    this.buckets.set(key, bucket)
    return { isAllowed: false, retryAfterSeconds: Math.ceil((1 - bucket.tokens) / this.refillPerSecond) }
  }

  private refilled (key: string, now: number): Bucket {
    const current = this.buckets.get(key)
    if (current === undefined) {
      if (this.buckets.size >= MAX_TRACKED_KEYS) this.makeRoom(now)
      return { tokens: this.burst, updatedAt: now }
    }
    const elapsedSeconds = Math.max(0, now - current.updatedAt) / 1000
    return { tokens: Math.min(this.burst, current.tokens + elapsedSeconds * this.refillPerSecond), updatedAt: now }
  }

  // Many distinct keys inside one refill window leave no full bucket, so the oldest key goes to keep the map bounded.
  private makeRoom (now: number): void {
    this.dropFullBuckets(now)
    if (this.buckets.size < MAX_TRACKED_KEYS) return
    const oldest = this.buckets.keys().next()
    if (oldest.done !== true) this.buckets.delete(oldest.value)
  }

  // A full bucket behaves exactly like a missing one, so dropping it changes no decision.
  private dropFullBuckets (now: number): void {
    for (const [key, bucket] of this.buckets) {
      const tokens = bucket.tokens + (Math.max(0, now - bucket.updatedAt) / 1000) * this.refillPerSecond
      if (tokens >= this.burst) this.buckets.delete(key)
    }
  }
}

export const REJECTED_FLUSH_MS = 60_000
export const RATE_LIMITED_WINDOW_MS = 24 * 60 * 60 * 1000

// Only hooks whose secret was checked are counted, so this map is bounded by real hooks.
export class RejectedCalls {
  private readonly counts = new Map<string, number>()

  note (id: string): void {
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1)
  }

  take (id: string): number {
    const count = this.counts.get(id) ?? 0
    this.counts.delete(id)
    return count
  }

  drain (): Array<[string, number]> {
    const all = [...this.counts]
    this.counts.clear()
    return all
  }
}
