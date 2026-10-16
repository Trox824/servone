import platform, { PlatformError } from '@hcengineering/platform'
import { getAccountClient } from '@hcengineering/server-client'
import { decodeToken, isTokenExpired, type Token, TokenError } from '@hcengineering/server-token'

import type { Caller } from './types'

const MS_PER_SECOND = 1000

export function readBearer (authorization: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')
  return match?.[1]
}

// API tokens are the only revocable, user-visible credential, so plain session tokens are refused.
export function callerFromToken (token: Token, raw: string, now: number): Caller | undefined {
  const apiTokenId = token.extra?.apiTokenId
  if (typeof apiTokenId !== 'string' || apiTokenId === '') return undefined
  if (token.workspace === undefined || token.workspace === '') return undefined
  if (token.exp === undefined || isTokenExpired(token, now)) return undefined
  return {
    token: raw,
    apiTokenId,
    account: token.account,
    workspace: token.workspace,
    expiresAt: token.exp * MS_PER_SECOND
  }
}

export async function authenticate (authorization: string | undefined, now: number): Promise<Caller | undefined> {
  const raw = readBearer(authorization)
  if (raw === undefined) return undefined
  let token: Token
  try {
    token = decodeToken(raw)
  } catch (error) {
    if (error instanceof TokenError) return undefined
    throw error
  }
  const caller = callerFromToken(token, raw, now)
  if (caller === undefined) return undefined
  // The signature alone cannot tell a revoked API token; the account service answers Unauthorized for those.
  try {
    const info = await getAccountClient(raw).getLoginInfoByToken()
    if (info === null || !('workspace' in info) || info.workspace !== caller.workspace) return undefined
  } catch (error) {
    if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) return undefined
    throw error
  }
  return caller
}
