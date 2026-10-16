import { type AccountDB } from '@hcengineering/account'
import { type ProviderInfo } from '@hcengineering/account-client'
import { BrandingMap, concatLink, MeasureContext, getBranding, SocialIdType } from '@hcengineering/core'
import Router from 'koa-router'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Passport } from '.'
import { GOOGLE_SIGNUP_SCOPES, saveGrantAfterSignIn, verifyGoogleSignIn } from './servone-google-grant'
import { encodeState, handleProviderAuth, safeParseAuthState } from './utils'

export function registerGoogle (
  measureCtx: MeasureContext,
  passport: Passport,
  router: Router<any, any>,
  accountsUrl: string,
  dbPromise: Promise<AccountDB>,
  frontUrl: string,
  brandings: BrandingMap,
  signUpDisabled?: boolean
): ProviderInfo | undefined {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  const name = 'google'
  const displayName = process.env.GOOGLE_DISPLAY_NAME

  const redirectURL = '/auth/google/callback'
  if (GOOGLE_CLIENT_ID === undefined || GOOGLE_CLIENT_SECRET === undefined) return
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: concatLink(accountsUrl, redirectURL),
        passReqToCallback: true
      },
      verifyGoogleSignIn // servone:
    )
  )

  router.get('/auth/google', async (ctx, next) => {
    measureCtx.info('try auth via', { provider: 'google' })
    const state = encodeState(ctx, brandings)

    passport.authenticate('google', {
      scope: GOOGLE_SIGNUP_SCOPES, // servone:
      accessType: 'offline', // servone:
      includeGrantedScopes: true, // servone:
      session: true,
      state
    })(ctx, next)
  })

  router.get(
    redirectURL,
    async (ctx, next) => {
      const state = safeParseAuthState(ctx.query?.state)
      measureCtx.info('Auth state', { state })
      const branding = getBranding(brandings, state?.branding)
      measureCtx.info('With branding', { branding })
      const failureRedirect = concatLink(branding?.front ?? frontUrl, '/login')
      measureCtx.info('With failure redirect', { failureRedirect })
      await passport.authenticate('google', {
        failureRedirect,
        session: true
      })(ctx, next)
    },
    async (ctx, next) => {
      measureCtx.info('Provider auth success', { type: 'google', user: ctx.state?.user })
      // passport-google-oauth20 maps Google's email_verified claim to this field.
      const email = ctx.state.user.emails?.[0]?.value
      const verifiedEmail = ctx.state.user.emails?.[0]?.verified === true ? email : undefined
      const first: string = ctx.state.user.name?.givenName ?? ''
      const last: string = ctx.state.user.name?.familyName ?? '' // servone:
      const db = await dbPromise

      const redirectUrl = await handleProviderAuth(
        measureCtx,
        db,
        brandings,
        frontUrl,
        'google',
        ctx.query?.state,
        ctx.state?.user,
        verifiedEmail,
        first,
        last,
        { type: SocialIdType.GOOGLE, value: email },
        signUpDisabled
      )

      if (redirectUrl !== '') {
        await saveGrantAfterSignIn(measureCtx, db, email, ctx.state.user.grant) // servone:
        ctx.redirect(redirectUrl)
      }

      await next()
    }
  )

  return { name, displayName }
}
