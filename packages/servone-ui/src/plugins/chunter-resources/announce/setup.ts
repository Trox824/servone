import chunter, { type Channel } from '@hcengineering/chunter'
import core, {
  AccountRole,
  getCurrentAccount,
  hasAccountRole,
  type AccountUuid,
  type Type,
  type TxOperations
} from '@hcengineering/core'
import { type IntlString } from '@hcengineering/platform'
import type { Actor } from './policy'
import { POST_POLICY_ATTR, THREAD_REPLIES_ATTR, type AnnouncedChannel, type AnnounceSettings } from './schema'

export function currentActor (): Actor {
  const account = getCurrentAccount()
  return { account: account.uuid, isWorkspaceAdmin: hasAccountRole(account, AccountRole.Maintainer) }
}

const ATTRIBUTES = [
  {
    name: POST_POLICY_ATTR,
    label: 'chunter:string:ServoneWhoCanPost' as IntlString,
    type: { _class: core.class.TypeString, label: core.string.String, icon: core.icon.TypeString } satisfies Type<string>
  },
  {
    name: THREAD_REPLIES_ATTR,
    label: 'chunter:string:ServoneThreadReplies' as IntlString,
    type: { _class: core.class.TypeBoolean, label: core.string.Boolean, icon: core.icon.TypeBoolean } satisfies Type<boolean>
  }
]

export async function ensureAnnounceAttributes (client: TxOperations): Promise<void> {
  if (!currentActor().isWorkspaceAdmin) return
  const existing = await client.findAll(core.class.Attribute, { attributeOf: chunter.class.Channel })
  for (const attr of ATTRIBUTES) {
    if (existing.some((e) => e.name === attr.name)) continue
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: chunter.class.Channel,
      name: attr.name,
      label: attr.label,
      type: attr.type,
      isCustom: true,
      hidden: true
    })
  }
}

export async function saveAnnounceSettings (
  client: TxOperations,
  channel: Channel,
  settings: AnnounceSettings
): Promise<void> {
  await ensureAnnounceAttributes(client)
  const announced: AnnouncedChannel = channel
  await client.update(announced, {
    [POST_POLICY_ATTR]: settings.postPolicy,
    [THREAD_REPLIES_ATTR]: settings.threadReplies
  })
}

export async function saveChannelOwners (client: TxOperations, channel: Channel, owners: AccountUuid[]): Promise<void> {
  await client.update(channel, { owners })
}
