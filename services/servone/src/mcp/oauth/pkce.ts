import { createHash, randomBytes } from 'crypto'

const RANDOM_ID_BYTES = 32
// RFC 7636 section 4.1: 43 to 128 unreserved characters.
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/

export function randomId (): string {
  return randomBytes(RANDOM_ID_BYTES).toString('base64url')
}

export function s256 (verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

export function isCodeVerifier (verifier: string): boolean {
  return CODE_VERIFIER_PATTERN.test(verifier)
}
