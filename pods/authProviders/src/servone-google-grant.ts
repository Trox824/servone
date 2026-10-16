import { type AccountDB } from '@hcengineering/account'
import { type IntegrationKind, type MeasureContext, type PersonId, SocialIdType } from '@hcengineering/core'
import { type IncomingMessage } from 'http'
import { type GoogleCallbackParameters, type Profile, type VerifyCallback } from 'passport-google-oauth20'

export const GOOGLE_SIGNUP_KIND = 'google-signup' as IntegrationKind

export const GOOGLE_SIGNUP_SCOPES = ['profile', 'email']

export interface GoogleSignupGrant {
  refreshToken: string | undefined
  scope: string
}

export interface GoogleSignupUser extends Profile {
  grant: GoogleSignupGrant
}

export function verifyGoogleSignIn (
  req: IncomingMessage,
  accessToken: string,
  refreshToken: string | undefined,
  params: GoogleCallbackParameters,
  profile: Profile,
  done: VerifyCallback
): void {
  const user: GoogleSignupUser = { ...profile, grant: { refreshToken, scope: params.scope } }
  done(null, user)
}

export async function saveGoogleSignupGrant (
  db: AccountDB,
  socialId: PersonId,
  email: string,
  refreshToken: string | undefined,
  scope: string
): Promise<void> {
  if (refreshToken === undefined) return
  const secretKey = { socialId, kind: GOOGLE_SIGNUP_KIND, workspaceUuid: null, key: email }
  const secret = JSON.stringify({ refresh_token: refreshToken, scope })
  if ((await db.integrationSecret.findOne(secretKey)) === null) {
    await db.integrationSecret.insertOne({ ...secretKey, secret })
  } else {
    await db.integrationSecret.update(secretKey, { secret })
  }
}

export async function saveGrantAfterSignIn (
  ctx: MeasureContext,
  db: AccountDB,
  email: string,
  grant: GoogleSignupGrant
): Promise<void> {
  try {
    const socialId = await db.socialId.findOne({ type: SocialIdType.GOOGLE, value: email })
    if (socialId === null) return
    await saveGoogleSignupGrant(db, socialId._id, email, grant.refreshToken, grant.scope)
  } catch (err: any) {
    ctx.error('failed to save google sign-up grant', { err, email })
  }
}
