import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { createHmac, timingSafeEqual } from 'crypto'

// Bound into the signature so a token minted for anything else never verifies here.
const PURPOSE = 'digest-off'

export interface UnsubscribeClaim {
  user: AccountUuid
  workspace: WorkspaceUuid
}

function sign (payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${PURPOSE}.${payload}`).digest()
}

// Not a platform token on purpose: a leaked email must not grant a session.
export function signUnsubscribeToken (claim: UnsubscribeClaim, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ p: PURPOSE, u: claim.user, w: claim.workspace })).toString('base64url')
  return `${payload}.${sign(payload, secret).toString('base64url')}`
}

export function readUnsubscribeToken (token: string, secret: string): UnsubscribeClaim | undefined {
  const [payload, signature, ...rest] = token.split('.')
  if (payload === undefined || signature === undefined || rest.length > 0) return undefined
  const expected = sign(payload, secret)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined
  const claim: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (typeof claim !== 'object' || claim === null) return undefined
  if (!('p' in claim && 'u' in claim && 'w' in claim)) return undefined
  if (claim.p !== PURPOSE || typeof claim.u !== 'string' || typeof claim.w !== 'string') return undefined
  return { user: claim.u as AccountUuid, workspace: claim.w as WorkspaceUuid }
}
