import contact, { type Person } from '@hcengineering/contact'
import { type AccountUuid, type IntegrationKind, type MeasureContext, type Ref, SocialIdType, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'
import type { WorkspaceClients } from '../mail/clients'

export const SIGNUP_GRANT_KIND = 'google-signup' as IntegrationKind
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events'
]

export interface SignupGrant {
  account: AccountUuid
  refreshToken: string
  scope: string
}

export interface CalendarRequest {
  workspace: WorkspaceUuid
  account: AccountUuid
  refreshToken: string
}

export type CalendarOutcome = 'connected' | 'skipped'

export interface SignupCalendarDeps {
  loadGrant: (workspace: WorkspaceUuid, person: Ref<Person>) => Promise<SignupGrant | undefined>
  connectCalendar: (request: CalendarRequest) => Promise<CalendarOutcome>
}

export function parseSignupGrant (account: AccountUuid, json: string): SignupGrant | undefined {
  const parsed: { refresh_token?: string, scope?: string } = JSON.parse(json)
  if (typeof parsed.refresh_token !== 'string' || parsed.refresh_token === '' || typeof parsed.scope !== 'string') return undefined
  return { account, refreshToken: parsed.refresh_token, scope: parsed.scope }
}

export function createGrantLookup (clients: WorkspaceClients, serviceId: string): SignupCalendarDeps['loadGrant'] {
  return async (workspace, personRef) => {
    const client = await clients(workspace)
    const person = await client.findOne(contact.class.Person, { _id: personRef })
    if (person?.personUuid === undefined) return undefined
    const identity = await client.findOne(contact.class.SocialIdentity, { attachedTo: person._id, type: SocialIdType.GOOGLE })
    if (identity === undefined) return undefined
    const accountClient = getAccountClient(generateToken(systemAccountUuid, workspace, { service: serviceId }))
    const stored = await accountClient.getIntegrationSecret({
      socialId: identity._id, kind: SIGNUP_GRANT_KIND, workspaceUuid: null, key: identity.value
    })
    return stored === null ? undefined : parseSignupGrant(person.personUuid as AccountUuid, stored.secret)
  }
}

export function createCalendarConnector (ctx: MeasureContext, calendarUrl: string, serviceId: string): SignupCalendarDeps['connectCalendar'] {
  return async (request) => {
    const response = await fetch(`${calendarUrl}/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${generateToken(systemAccountUuid, undefined, { service: serviceId })}`
      },
      body: JSON.stringify(request)
    })
    if (response.ok) return 'connected'
    const failure: { error?: string } = await response.json().catch(() => ({}))
    if (response.status === 400 && (failure.error === 'invalid_grant' || failure.error === 'missing_scope')) {
      ctx.info('calendar sign-up grant skipped', { workspace: request.workspace, account: request.account, reason: failure.error })
      return 'skipped'
    }
    throw new Error(`Calendar connect answered ${response.status}`)
  }
}

export async function attachSignupCalendar (deps: SignupCalendarDeps, workspace: WorkspaceUuid, person: Ref<Person>): Promise<void> {
  const grant = await deps.loadGrant(workspace, person)
  if (grant === undefined) return
  const granted = grant.scope.split(' ')
  if (!CALENDAR_SCOPES.every((scope) => granted.includes(scope))) return
  await deps.connectCalendar({ workspace, account: grant.account, refreshToken: grant.refreshToken })
}
