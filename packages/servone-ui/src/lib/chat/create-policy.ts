import { AccountRole, hasAccountRole, type Account } from '@hcengineering/core'

export const CREATE_CHANNEL_CAPABILITY = 'servone:capability:CreateChannel'

export type CreateChannelPolicy = 'everyone' | 'admins'

const ROLES_BY_POLICY: Record<CreateChannelPolicy, AccountRole[]> = {
  everyone: [AccountRole.User, AccountRole.Maintainer, AccountRole.Owner],
  admins: [AccountRole.Maintainer, AccountRole.Owner]
}

export function rolesForPolicy (policy: CreateChannelPolicy): AccountRole[] {
  return [...ROLES_BY_POLICY[policy]]
}

export function readCreatePolicy (roleByCapability: Record<string, AccountRole[]> | undefined): CreateChannelPolicy {
  const roles = roleByCapability?.[CREATE_CHANNEL_CAPABILITY]
  if (roles === undefined || roles.length === 0) return 'everyone'
  return roles.includes(AccountRole.User) ? 'everyone' : 'admins'
}

export function canCreateChannel (
  account: Account,
  roleByCapability: Record<string, AccountRole[]> | undefined
): boolean {
  const roles = ROLES_BY_POLICY[readCreatePolicy(roleByCapability)]
  return roles.some((role) => hasAccountRole(account, role))
}

export function withCreatePolicy (
  roleByCapability: Record<string, AccountRole[]> | undefined,
  policy: CreateChannelPolicy
): Record<string, AccountRole[]> {
  return { ...(roleByCapability ?? {}), [CREATE_CHANNEL_CAPABILITY]: rolesForPolicy(policy) }
}
