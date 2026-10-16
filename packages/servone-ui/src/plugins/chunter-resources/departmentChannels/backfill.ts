import chunter, { type Channel } from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, { notEmpty, type TxOperations } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import presentation, { getClient, MessageBox } from '@hcengineering/presentation'
import { showPopup } from '@hcengineering/ui'

const ADD_CURRENT_MEMBERS = 'chunter:string:ServoneAddCurrentMembers' as IntlString

export async function backfillAutoJoin (client: TxOperations, channel: Channel): Promise<void> {
  const fresh = await client.findOne(chunter.class.Channel, { _id: channel._id })
  if (fresh === undefined) return
  const employees = await client.findAll(contact.mixin.Employee, { active: true })
  const current = new Set(fresh.members)
  const missing = employees
    .filter((employee) => employee.role !== 'GUEST')
    .map((employee) => employee.personUuid)
    .filter(notEmpty)
    .filter((account) => !current.has(account))
  if (missing.length === 0) return
  await client.update(fresh, { $push: { members: { $each: missing, $position: 0 } } })
}

export function askBackfillAutoJoin (channel: Channel): void {
  showPopup(MessageBox, {
    label: core.string.AutoJoin,
    message: ADD_CURRENT_MEMBERS,
    okLabel: presentation.string.Add,
    action: async () => {
      await backfillAutoJoin(getClient(), channel)
    }
  })
}
