import { type AccountUuid, AccountRole, roleOrder, type WorkspaceUuid } from '@hcengineering/core'
import platform, { PlatformError } from '@hcengineering/platform'
import { getAccountClient } from '@hcengineering/server-client'
import { decodeToken, isTokenExpired, type Token, TokenError } from '@hcengineering/server-token'

export interface Caller {
  account: AccountUuid
  workspace: WorkspaceUuid
  role: AccountRole
}

export interface TokenIdentity {
  account: AccountUuid
  workspace: WorkspaceUuid
}

export function readBearer (authorization: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')
  return match?.[1]
}

// Mirrors verifyNotApiToken in server/account: API tokens reach automation, never webhook management.
export function tokenIdentity (token: Token, now: number): TokenIdentity | undefined {
  if (token.extra?.apiTokenId !== undefined) return undefined
  if (isTokenExpired(token, now)) return undefined
  if (token.workspace === undefined || token.workspace === '') return undefined
  return { account: token.account, workspace: token.workspace }
}

export function canManageHooks (caller: Caller, owners: readonly AccountUuid[]): boolean {
  return roleOrder[caller.role] >= roleOrder[AccountRole.Maintainer] || owners.includes(caller.account)
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
  const identity = tokenIdentity(token, now)
  if (identity === undefined) return undefined
  // The token only proves who the caller is; the role comes from the account service so a demotion applies at once.
  try {
    const info = await getAccountClient(raw).getLoginInfoByToken()
    if (info === null || !('role' in info) || info.workspace !== identity.workspace) return undefined
    return { ...identity, role: info.role }
  } catch (error) {
    // The signature alone cannot tell a revoked session token; the account service answers Unauthorized for those.
    if (error instanceof PlatformError && error.status.code === platform.status.Unauthorized) return undefined
    throw error
  }
}
