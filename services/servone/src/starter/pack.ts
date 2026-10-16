import core, { type Account, systemAccount } from '@hcengineering/core'
import { applyChange, describe, findPack, packStatus, plan, saveDraft } from '@servone/config'
import type { SetupClient } from '../workflows/setup'

const INTERNAL_REQUESTS_PACK = 'de-nghi-noi-bo'

const systemSession = (client: SetupClient): { client: SetupClient, account: Account } => ({
  client,
  account: { ...systemAccount, primarySocialId: core.account.System, socialIds: [core.account.System] }
})

export async function installInternalRequests (client: SetupClient): Promise<boolean> {
  const pack = findPack(INTERNAL_REQUESTS_PACK)
  if (pack === undefined) throw new Error(`Bundled pack ${INTERNAL_REQUESTS_PACK} is missing`)
  const session = systemSession(client)
  if (packStatus(pack, await describe(session)) !== 'notInstalled') return false
  const draft = await plan(session, pack.operations)
  if (draft.issues.length > 0) throw new Error(`Pack ${pack.key} cannot be installed: ${draft.issues.map((issue) => issue.message).join('; ')}`)
  const change = await saveDraft(session, draft)
  const outcome = await applyChange(session, change.id)
  if (outcome.kind !== 'applied') throw new Error(`Pack ${pack.key} was not applied: ${outcome.kind}`)
  return true
}
