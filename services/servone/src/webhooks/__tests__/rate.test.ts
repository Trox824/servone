import { BURST, RejectedCalls, TokenBuckets } from '../rate'

describe('token buckets', () => {
  it('allows a burst, then asks the caller to wait', () => {
    const buckets = new TokenBuckets()
    for (let i = 0; i < BURST; i++) {
      expect(buckets.take('hook', 0).isAllowed).toBe(true)
    }
    expect(buckets.take('hook', 0)).toEqual({ isAllowed: false, retryAfterSeconds: 1 })
  })

  it('refills one call per second', () => {
    const buckets = new TokenBuckets()
    for (let i = 0; i < BURST; i++) buckets.take('hook', 0)
    expect(buckets.take('hook', 500).isAllowed).toBe(false)
    expect(buckets.take('hook', 1500).isAllowed).toBe(true)
    expect(buckets.take('hook', 1500).isAllowed).toBe(false)
  })

  it('never refills past the burst', () => {
    const buckets = new TokenBuckets()
    buckets.take('hook', 0)
    const later = 60_000
    for (let i = 0; i < BURST; i++) expect(buckets.take('hook', later).isAllowed).toBe(true)
    expect(buckets.take('hook', later).isAllowed).toBe(false)
  })

  it('keeps hooks independent', () => {
    const buckets = new TokenBuckets()
    for (let i = 0; i < BURST; i++) buckets.take('a', 0)
    expect(buckets.take('a', 0).isAllowed).toBe(false)
    expect(buckets.take('b', 0).isAllowed).toBe(true)
  })

  it('evicts the oldest key when random keys fill the map inside one refill window', () => {
    const buckets = new TokenBuckets(1, 0.001)
    buckets.take('first', 0)
    expect(buckets.take('first', 0).isAllowed).toBe(false)
    for (let i = 0; i < 10_000; i++) buckets.take(`attacker-${i}`, 0)
    expect(buckets.take('first', 0).isAllowed).toBe(true)
  })
})

describe('rejected calls', () => {
  it('counts per hook and hands counts out once', () => {
    const rejected = new RejectedCalls()
    rejected.note('a')
    rejected.note('a')
    rejected.note('b')
    expect(rejected.take('a')).toBe(2)
    expect(rejected.take('a')).toBe(0)
    expect(rejected.drain()).toEqual([['b', 1]])
    expect(rejected.drain()).toEqual([])
  })
})
