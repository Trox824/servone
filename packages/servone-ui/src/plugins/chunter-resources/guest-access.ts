import { getAccountClient } from '@hcengineering/contact-resources'

export async function isGuestAccessEnabled (): Promise<boolean> {
  const workspaceInfo = await getAccountClient().getWorkspaceInfo()
  return workspaceInfo.allowReadOnlyGuest ?? false
}
