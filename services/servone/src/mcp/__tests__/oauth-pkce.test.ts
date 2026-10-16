import { isCodeVerifier, randomId, s256 } from '../oauth/pkce'

describe('pkce', () => {
  it('matches the RFC 7636 appendix B vector', () => {
    expect(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('accepts verifiers of 43 to 128 unreserved characters', () => {
    expect(isCodeVerifier('a'.repeat(43))).toBe(true)
    expect(isCodeVerifier('A-._~'.repeat(25) + 'abc')).toBe(true)
    expect(isCodeVerifier('a'.repeat(42))).toBe(false)
    expect(isCodeVerifier('a'.repeat(129))).toBe(false)
    expect(isCodeVerifier('a'.repeat(42) + '+')).toBe(false)
  })

  it('makes url-safe ids from 32 random bytes', () => {
    const id = randomId()
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomId()).not.toBe(id)
  })
})
