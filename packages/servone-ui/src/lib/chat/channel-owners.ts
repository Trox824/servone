import type { AccountUuid, PersonId } from '@hcengineering/core'

export interface OwnableChannel {
  owners?: readonly AccountUuid[]
  createdBy?: PersonId
}

export function lacksOwners (channel: OwnableChannel): boolean {
  return (channel.owners ?? []).length === 0
}

export function pickBackfillOwners (
  workspaceOwners: readonly AccountUuid[],
  creator: AccountUuid | undefined
): AccountUuid[] {
  if (workspaceOwners.length > 0) return [...new Set(workspaceOwners)]
  return creator !== undefined ? [creator] : []
}
