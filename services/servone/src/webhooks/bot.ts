// One global account per bot (webhook messages, public form issues); each workspace gets its Person/Employee on first use.
import type { RestClient } from '@hcengineering/api-client'
import { ensureEmployee } from '@hcengineering/contact'
import {
  type Account,
  AccountRole,
  type AccountUuid,
  buildSocialIdString,
  type MeasureContext,
  type PersonId,
  pickPrimarySocialId,
  type SocialId,
  SocialIdType,
  systemAccountUuid
} from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'
import { randomBytes } from 'crypto'

export interface BotProfile {
  email: string
  firstName: string
  lastName: string
}

export const WEBHOOKS_BOT: BotProfile = { email: 'webhooks@servone.vn', firstName: 'Servone', lastName: 'Webhooks' }
export const FORMS_BOT: BotProfile = { email: 'forms@servone.vn', firstName: 'Servone', lastName: 'Forms' }

export interface BotIdentity {
  account: AccountUuid
  primarySocialId: PersonId
  socialIds: SocialId[]
}

// The account service lets only its listed services look people up by email; 'tool' is on that list, our ids are not.
const ACCOUNT_LOOKUP_SERVICE = 'tool'

async function findOrCreateBotAccount (profile: BotProfile): Promise<AccountUuid> {
  const systemToken = generateToken(systemAccountUuid, undefined, { service: ACCOUNT_LOOKUP_SERVICE })
  const accounts = getAccountClient(systemToken)
  const emailKey = buildSocialIdString({ type: SocialIdType.EMAIL, value: profile.email })
  const existing = await accounts.findPersonBySocialKey(emailKey, true)
  if (existing !== undefined) return existing as AccountUuid
  // Nobody signs in as the bot; the service mints its tokens with SECRET, so the password is thrown away.
  const password = randomBytes(32).toString('base64url')
  const created = await accounts.signUp(profile.email, password, profile.firstName, profile.lastName)
  return created.account
}

function isConfirmed (socialIds: SocialId[], email: string): boolean {
  return socialIds.some(
    (socialId) => socialId.type === SocialIdType.EMAIL && socialId.value === email && socialId.verifiedOn != null
  )
}

export async function loadBotIdentity (service: string, profile: BotProfile): Promise<BotIdentity> {
  const account = await findOrCreateBotAccount(profile)
  const botAccounts = getAccountClient(generateToken(account, undefined, { service, confirmEmail: profile.email }))
  let socialIds = await botAccounts.getSocialIds()
  // With MAIL_URL set, signUp leaves the email unconfirmed, and confirm throws once it is confirmed.
  if (!isConfirmed(socialIds, profile.email)) {
    await botAccounts.confirm()
    socialIds = await botAccounts.getSocialIds()
  }
  return { account, primarySocialId: pickPrimarySocialId(socialIds)._id, socialIds }
}

export async function ensureBotEmployee (
  ctx: MeasureContext,
  client: RestClient,
  bot: BotIdentity,
  service: string
): Promise<void> {
  const me: Account = {
    uuid: bot.account,
    role: AccountRole.User,
    primarySocialId: bot.primarySocialId,
    socialIds: bot.socialIds.map((socialId) => socialId._id),
    fullSocialIds: bot.socialIds
  }
  const botAccounts = getAccountClient(generateToken(bot.account, undefined, { service }))
  await ensureEmployee(ctx, me, client, bot.socialIds, async () => await botAccounts.getPerson())
}
