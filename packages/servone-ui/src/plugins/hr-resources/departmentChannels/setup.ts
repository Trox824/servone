import core, {
  AccountRole,
  getCurrentAccount,
  hasAccountRole,
  type ArrOf,
  type Class,
  type Ref,
  type RefTo,
  type TxOperations
} from '@hcengineering/core'
import type { Channel } from '@hcengineering/chunter'
import hr, { type Department } from '@hcengineering/hr'
import { getEmbeddedLabel } from '@hcengineering/platform'

export interface DepartmentWithChannels extends Department {
  servoneDefaultChannels?: Array<Ref<Channel>>
}

export const DEFAULT_CHANNELS_ATTR = 'servoneDefaultChannels' satisfies keyof DepartmentWithChannels

export const CHANNEL_CLASS = 'chunter:class:Channel' as Ref<Class<Channel>>

export const DEPARTMENT_CLASS = hr.class.Department

export async function ensureDepartmentAttributes (client: TxOperations): Promise<void> {
  if (!hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)) return
  const existing = await client.findOne(core.class.Attribute, {
    attributeOf: hr.class.Department,
    name: DEFAULT_CHANNELS_ATTR
  })
  if (existing !== undefined) return
  const channelRef: RefTo<Channel> = { _class: core.class.RefTo, label: core.string.Ref, to: CHANNEL_CLASS }
  const channelRefs: ArrOf<Ref<Channel>> = { _class: core.class.ArrOf, label: core.string.Array, of: channelRef }
  await client.createDoc(core.class.Attribute, core.space.Model, {
    attributeOf: hr.class.Department,
    name: DEFAULT_CHANNELS_ATTR,
    label: getEmbeddedLabel('Default channels'),
    type: channelRefs,
    isCustom: true,
    hidden: true
  })
}
