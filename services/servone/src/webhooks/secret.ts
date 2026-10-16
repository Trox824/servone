import { createHash, randomBytes, timingSafeEqual } from 'crypto'

const HOOK_ID_LENGTH = 12
const HOOK_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// Largest multiple of 62 below 256: bytes at or above it are skipped so every character is equally likely.
const UNBIASED_BYTE_LIMIT = 248
const SECRET_BYTES = 32

const HOOK_ID_PATTERN = /^[A-Za-z0-9]{12}$/
// base64url of 32 bytes without padding is always 43 characters.
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function newHookId (): string {
  let id = ''
  while (id.length < HOOK_ID_LENGTH) {
    for (const byte of randomBytes(HOOK_ID_LENGTH * 2)) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue
      id += HOOK_ID_ALPHABET[byte % HOOK_ID_ALPHABET.length]
      if (id.length === HOOK_ID_LENGTH) break
    }
  }
  return id
}

export function newSecret (): string {
  return randomBytes(SECRET_BYTES).toString('base64url')
}

export function hashSecret (secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function isHookId (candidate: string): boolean {
  return HOOK_ID_PATTERN.test(candidate)
}

export function isSecret (candidate: string): boolean {
  return SECRET_PATTERN.test(candidate)
}

export function secretMatches (secret: string, storedHash: string): boolean {
  const given = Buffer.from(hashSecret(secret), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return given.length === stored.length && timingSafeEqual(given, stored)
}
