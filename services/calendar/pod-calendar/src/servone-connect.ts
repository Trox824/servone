import { type AccountClient } from '@hcengineering/account-client'
import { calendarIntegrationKind } from '@hcengineering/calendar'
import { type AccountUuid, type MeasureContext, SocialIdType, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import type { IntegrationClient } from '@hcengineering/integration-client'
import { extractToken } from '@hcengineering/server-client'
import { type Credentials } from 'google-auth-library'
import { google } from 'googleapis'

import { AuthController } from './auth'
import { type Endpoint, type GoogleEmail, SCOPES, type State } from './types'

interface ConnectBody {
  workspace: WorkspaceUuid
  account: AccountUuid
  refreshToken: string
}

function parseConnectBody (body: Partial<Record<keyof ConnectBody, unknown>> | undefined): ConnectBody | undefined {
  const { workspace, account, refreshToken } = body ?? {}
  if (typeof workspace !== 'string' || typeof account !== 'string' || typeof refreshToken !== 'string' || refreshToken === '') return undefined
  return { workspace: workspace as WorkspaceUuid, account: account as AccountUuid, refreshToken }
}

function isInvalidGrant (error: unknown): boolean {
  return (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'invalid_grant'
}

export function servoneConnectEndpoint (
  ctx: MeasureContext,
  accountClient: AccountClient,
  integrationClient: IntegrationClient
): Endpoint {
  return {
    endpoint: '/connect/token',
    type: 'post',
    handler: async (req, res) => {
      const caller = extractToken(req.headers)
      if (caller === undefined || caller.account !== systemAccountUuid || caller.extra?.service === undefined) {
        res.status(401).send()
        return
      }
      const body = parseConnectBody(req.body)
      if (body === undefined) {
        res.status(400).send({ error: 'bad_request' })
        return
      }
      const state: State = { redirectURL: '', workspace: body.workspace, accountUuid: body.account }
      const outcome = await AuthController.withController(ctx, accountClient, integrationClient, state, async (controller) => {
        const auth = controller.oAuth2Client
        auth.setCredentials({ refresh_token: body.refreshToken })
        let credentials: Credentials
        try {
          credentials = (await auth.refreshAccessToken()).credentials
        } catch (error) {
          if (isInvalidGrant(error)) return 'invalid_grant'
          throw error
        }
        const granted = credentials.scope?.split(' ') ?? []
        if (SCOPES.some((scope) => !granted.includes(scope))) return 'missing_scope'
        const email = (await google.oauth2({ version: 'v2', auth }).userinfo.get()).data.email as GoogleEmail | null | undefined
        if (email == null) throw new Error('Email not found')
        const socialId = await accountClient.addSocialIdToPerson(body.account, SocialIdType.GOOGLE, email, true, email)
        const existing = await accountClient.getIntegrationSecret({
          socialId, kind: calendarIntegrationKind, workspaceUuid: body.workspace, key: email
        })
        if (existing != null) return 'exists'
        await controller.complete(await controller.authorizeTokens(credentials, state))
        return 'connected'
      })
      if (outcome === 'invalid_grant' || outcome === 'missing_scope') {
        res.status(400).send({ error: outcome })
        return
      }
      res.send({ status: outcome })
    }
  }
}
