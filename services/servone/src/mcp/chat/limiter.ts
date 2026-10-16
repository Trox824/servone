import type { AccountUuid } from '@hcengineering/core'

import { TokenBuckets } from '../../webhooks/rate'

// One token per chat turn, however many model calls it makes: five quick turns, then one every 30 s.
export const CHAT_BUCKET_BURST = 5
export const CHAT_BUCKET_REFILL_PER_SECOND = 1 / 30

export interface ChatLimiter {
  // Debits a token and reserves the in-flight slot in one step; false leaves neither reserved.
  reserve: (account: AccountUuid, now: number) => boolean
  release: (account: AccountUuid) => void
}

export function createChatLimiter (): ChatLimiter {
  const buckets = new TokenBuckets(CHAT_BUCKET_BURST, CHAT_BUCKET_REFILL_PER_SECOND)
  const inFlight = new Set<AccountUuid>()
  return {
    reserve (account, now) {
      if (inFlight.has(account)) return false
      if (!buckets.take(account, now).isAllowed) return false
      inFlight.add(account)
      return true
    },
    release (account) {
      inFlight.delete(account)
    }
  }
}
