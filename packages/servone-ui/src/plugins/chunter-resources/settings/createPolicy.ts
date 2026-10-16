import core, { type TxOperations } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { createQuery } from '@hcengineering/presentation'
import setting, { type RoleCapabilitySettings } from '@hcengineering/setting'
import { writable, type Readable } from 'svelte/store'
import { withCreatePolicy, type CreateChannelPolicy } from '../../../lib/chat/create-policy'

export const ADMINS_ONLY_NOTICE = 'chunter:string:ServoneCreateChannelAdminsOnly' as IntlString

export function roleCapabilitySettings (): Readable<RoleCapabilitySettings | undefined> {
  const store = writable<RoleCapabilitySettings | undefined>(undefined)
  createQuery().query(setting.class.RoleCapabilitySettings, {}, (docs) => {
    store.set(docs[0])
  })
  return store
}

export async function saveCreatePolicy (
  client: TxOperations,
  existing: RoleCapabilitySettings | undefined,
  policy: CreateChannelPolicy
): Promise<void> {
  const roleByCapability = withCreatePolicy(existing?.roleByCapability, policy)
  if (existing === undefined) {
    await client.createDoc(setting.class.RoleCapabilitySettings, core.space.Workspace, {
      roleByCapability,
      enabled: true
    })
    return
  }
  await client.update(existing, { roleByCapability })
}
