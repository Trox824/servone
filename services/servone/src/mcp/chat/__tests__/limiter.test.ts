import type { AccountUuid } from '@hcengineering/core'

import { CHAT_BUCKET_BURST, createChatLimiter } from '../limiter'

const ACCOUNT = 'acc-1' as AccountUuid
const OTHER = 'acc-2' as AccountUuid

describe('createChatLimiter', () => {
  it('refuses a second reservation for the same account until the first releases', () => {
    const limiter = createChatLimiter()
    expect(limiter.reserve(ACCOUNT, 0)).toBe(true)
    expect(limiter.reserve(ACCOUNT, 0)).toBe(false)
    limiter.release(ACCOUNT)
    expect(limiter.reserve(ACCOUNT, 0)).toBe(true)
  })

  it('keeps accounts independent', () => {
    const limiter = createChatLimiter()
    expect(limiter.reserve(ACCOUNT, 0)).toBe(true)
    expect(limiter.reserve(OTHER, 0)).toBe(true)
  })

  it('refuses once the bucket is empty, even with the slot released each time', () => {
    const limiter = createChatLimiter()
    for (let i = 0; i < CHAT_BUCKET_BURST; i++) {
      expect(limiter.reserve(ACCOUNT, 0)).toBe(true)
      limiter.release(ACCOUNT)
    }
    expect(limiter.reserve(ACCOUNT, 0)).toBe(false)
  })
})
