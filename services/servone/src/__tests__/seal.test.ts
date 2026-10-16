import { randomBytes } from 'crypto'
import { parseSealKeys, seal, SealError, unseal } from '../seal'

const keyA = randomBytes(32).toString('base64')
const keyB = randomBytes(32).toString('base64')

describe('seal', () => {
  it('round-trips with the current key', () => {
    const keys = parseSealKeys(`a:${keyA}`, 'TEST_KEYS')
    const sealed = seal(keys, 'ws:hook', 'hook secret')
    expect(sealed.keyId).toBe('a')
    expect(sealed.data).not.toContain('hook secret')
    expect(unseal(keys, 'ws:hook', sealed)).toBe('hook secret')
  })

  it('rejects a record moved to another owner', () => {
    const keys = parseSealKeys(`a:${keyA}`, 'TEST_KEYS')
    const sealed = seal(keys, 'ws:hook', 'secret')
    expect(() => unseal(keys, 'ws:other', sealed)).toThrow(SealError)
  })

  it('rejects tampered ciphertext', () => {
    const keys = parseSealKeys(`a:${keyA}`, 'TEST_KEYS')
    const sealed = seal(keys, 'ws:hook', 'secret')
    const bytes = Buffer.from(sealed.data, 'base64')
    bytes[0] ^= 1
    expect(() => unseal(keys, 'ws:hook', { ...sealed, data: bytes.toString('base64') })).toThrow(SealError)
  })

  it('opens old records after a key rotation', () => {
    const sealed = seal(parseSealKeys(`a:${keyA}`, 'TEST_KEYS'), 'ws:hook', 'secret')
    const rotated = parseSealKeys(`b:${keyB},a:${keyA}`, 'TEST_KEYS')
    expect(rotated.current.id).toBe('b')
    expect(unseal(rotated, 'ws:hook', sealed)).toBe('secret')
  })

  it('refuses a record sealed with a key that was dropped', () => {
    const sealed = seal(parseSealKeys(`a:${keyA}`, 'TEST_KEYS'), 'ws:hook', 'secret')
    expect(() => unseal(parseSealKeys(`b:${keyB}`, 'TEST_KEYS'), 'ws:hook', sealed)).toThrow('Unknown seal key a')
  })

  it('names the variable when a key is not 32 bytes', () => {
    expect(() => parseSealKeys(`a:${randomBytes(16).toString('base64')}`, 'TEST_KEYS')).toThrow('TEST_KEYS')
  })
})
