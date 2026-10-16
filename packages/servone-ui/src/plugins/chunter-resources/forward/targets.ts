import chunter, { type Channel, type DirectMessage } from '@hcengineering/chunter'
import contact, { getName, type Employee } from '@hcengineering/contact'
import { getCurrentAccount, type Class, type Doc, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'

import { canPost } from '../announce/policy'
import { announceSettings } from '../announce/schema'
import { currentActor } from '../announce/setup'
import { fold } from '../../../lib/fold'
import { createDirect, getChannelName } from '../utils'

export type ForwardTarget =
  | { kind: 'channel', channel: Channel, label: string, canPost: boolean }
  | { kind: 'direct', direct: DirectMessage, label: string }
  | { kind: 'person', employee: Employee, label: string }

export interface Destination {
  _id: Ref<Doc>
  _class: Ref<Class<Doc>>
}

const byLabel = (a: ForwardTarget, b: ForwardTarget): number => a.label.localeCompare(b.label)

export async function loadTargets (): Promise<ForwardTarget[]> {
  const client = getClient()
  const me = getCurrentAccount().uuid
  const actor = currentActor()
  const [channels, directs, employees] = await Promise.all([
    client.findAll(chunter.class.Channel, { members: me, archived: false }),
    client.findAll(chunter.class.DirectMessage, { members: me }),
    client.findAll(contact.mixin.Employee, { active: true })
  ])

  const channelTargets: ForwardTarget[] = channels.map((channel) => ({
    kind: 'channel',
    channel,
    label: channel.name,
    canPost: canPost(actor, { owners: channel.owners ?? [], settings: announceSettings(channel) })
  }))

  const directTargets: ForwardTarget[] = await Promise.all(
    directs.map(async (direct) => ({
      kind: 'direct' as const,
      direct,
      label: (await getChannelName(direct._id, direct._class, direct)) ?? ''
    }))
  )

  const withDirect = new Set(
    directs.filter((direct) => direct.members.length === 2).flatMap((direct) => direct.members.filter((m) => m !== me))
  )
  const hierarchy = client.getHierarchy()
  const personTargets: ForwardTarget[] = employees
    .filter(
      (employee) =>
        employee.personUuid !== undefined && employee.personUuid !== me && !withDirect.has(employee.personUuid)
    )
    .map((employee) => ({ kind: 'person', employee, label: getName(hierarchy, employee) }))

  return [...channelTargets.sort(byLabel), ...directTargets.sort(byLabel), ...personTargets.sort(byLabel)]
}

export function matchesTarget (target: ForwardTarget, query: string): boolean {
  const needle = fold(query.trim())
  return needle === '' || fold(target.label).includes(needle)
}

export function targetKey (target: ForwardTarget): string {
  switch (target.kind) {
    case 'channel':
      return target.channel._id
    case 'direct':
      return target.direct._id
    case 'person':
      return target.employee._id
  }
}

export async function resolveDestination (target: ForwardTarget): Promise<Destination> {
  switch (target.kind) {
    case 'channel':
      return { _id: target.channel._id, _class: target.channel._class }
    case 'direct':
      return { _id: target.direct._id, _class: target.direct._class }
    case 'person':
      return { _id: await createDirect([target.employee._id]), _class: chunter.class.DirectMessage }
  }
}
