import { hashSecret, isHookId, isSecret, newHookId, newSecret, secretMatches } from '../secret'

describe('hook secrets', () => {
  it('makes 12-character alphanumeric hook ids', () => {
    for (let i = 0; i < 50; i++) {
      expect(isHookId(newHookId())).toBe(true)
    }
  })

  it('makes 32-byte base64url secrets', () => {
    const secret = newSecret()
    expect(isSecret(secret)).toBe(true)
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32)
  })

  it('matches only the secret whose hash is stored', () => {
    const secret = newSecret()
    const stored = hashSecret(secret)
    expect(stored).not.toContain(secret)
    expect(secretMatches(secret, stored)).toBe(true)
    expect(secretMatches(newSecret(), stored)).toBe(false)
  })

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(secretMatches(newSecret(), 'abc')).toBe(false)
  })

  it('rejects ids and secrets of the wrong shape', () => {
    expect(isHookId('short')).toBe(false)
    expect(isHookId('abc/def-ghij')).toBe(false)
    expect(isSecret('x'.repeat(42))).toBe(false)
    expect(isSecret('x'.repeat(42) + '=')).toBe(false)
  })
})
