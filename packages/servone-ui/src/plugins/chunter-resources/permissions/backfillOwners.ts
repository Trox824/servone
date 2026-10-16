import chunter from '@hcengineering/chunter'
import { getPersonsByPersonIds } from '@hcengineering/contact'
import { getAccountClient } from '@hcengineering/contact-resources'
import { AccountRole, notEmpty, type TxOperations } from '@hcengineering/core'
import { lacksOwners, pickBackfillOwners } from '../../../lib/chat/channel-owners'
import { currentActor } from '../announce/setup'

export async function backfillChannelOwners (client: TxOperations): Promise<void> {
  if (!currentActor().isWorkspaceAdmin) return
  const channels = (await client.findAll(chunter.class.Channel, {})).filter(lacksOwners)
  if (channels.length === 0) return

  const members = await getAccountClient().getWorkspaceMembers()
  const workspaceOwners = members
    .filter((member) => member.role === AccountRole.Owner && !member.disabled)
    .map((member) => member.person)
  const creators = await getPersonsByPersonIds(client, channels.map((channel) => channel.createdBy).filter(notEmpty))

  for (const channel of channels) {
    const creator = channel.createdBy !== undefined ? creators.get(channel.createdBy)?.personUuid : undefined
    const owners = pickBackfillOwners(workspaceOwners, creator)
    if (owners.length === 0) continue
    await client.update(channel, { owners })
  }
}
