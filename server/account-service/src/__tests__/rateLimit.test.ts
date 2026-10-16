import { AuthRateLimiter, RateLimiter, getClientIp } from '../rateLimit'

describe('RateLimiter', () => {
  it('blocks after the limit and resets after the window', () => {
    const limiter = new RateLimiter(2, 1000)
    expect(limiter.isAllowed('a', 0)).toBe(true)
    expect(limiter.isAllowed('a', 10)).toBe(true)
    expect(limiter.isAllowed('a', 20)).toBe(false)
    expect(limiter.isAllowed('b', 20)).toBe(true)
    expect(limiter.isAllowed('a', 1000)).toBe(true)
  })

  it('sweeps only expired windows', () => {
    const limiter = new RateLimiter(1, 1000)
    limiter.isAllowed('old', 0)
    limiter.isAllowed('new', 900)
    limiter.sweep(1000)
    expect(limiter.isAllowed('old', 1000)).toBe(true)
    expect(limiter.isAllowed('new', 1000)).toBe(false)
  })
})

describe('AuthRateLimiter', () => {
  it('lets the victim in after one attacker IP burns its budget on their email', () => {
    const limiter = new AuthRateLimiter()
    for (let i = 0; i < 10; i++) expect(limiter.isAllowed('6.6.6.6', 'victim@x.vn', 0)).toBe(true)
    expect(limiter.isAllowed('6.6.6.6', 'victim@x.vn', 0)).toBe(false)
    expect(limiter.isAllowed('1.2.3.4', 'victim@x.vn', 0)).toBe(true)
  })

  it('caps one email across many IPs', () => {
    const limiter = new AuthRateLimiter()
    for (let i = 0; i < 50; i++) expect(limiter.isAllowed(`10.0.0.${i}`, 'victim@x.vn', 0)).toBe(true)
    expect(limiter.isAllowed('10.0.1.1', 'victim@x.vn', 0)).toBe(false)
  })

  it('caps one IP across many emails', () => {
    const limiter = new AuthRateLimiter()
    for (let i = 0; i < 60; i++) expect(limiter.isAllowed('6.6.6.6', `u${i}@x.vn`, 0)).toBe(true)
    expect(limiter.isAllowed('6.6.6.6', 'new@x.vn', 0)).toBe(false)
    expect(limiter.isAllowed('6.6.6.6', undefined, 0)).toBe(false)
  })
})

describe('getClientIp', () => {
  it('takes the proxy-appended last entry, not the client-supplied first one', () => {
    expect(getClientIp('6.6.6.6, 1.2.3.4', '10.0.0.1')).toBe('1.2.3.4')
    expect(getClientIp(undefined, '10.0.0.1')).toBe('10.0.0.1')
    expect(getClientIp('', '10.0.0.1')).toBe('10.0.0.1')
  })
})
