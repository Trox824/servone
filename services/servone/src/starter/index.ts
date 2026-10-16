// Seeds a new workspace when its creator first opens it: the stock workspace service runs no Servone code, and
// the creator's Person only exists once their client connects.
import contact, { type Person } from '@hcengineering/contact'
import { type AccountUuid, type MeasureContext, type PersonUuid, type Ref, systemAccountUuid, type Tx, type WorkspaceUuid } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { getAccountClient } from '@hcengineering/server-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import { joinedPerson } from '../joined-person'
import { createWorkspaceClients } from '../mail/clients'
import { createCollabText } from '../mcp/collab'
import { funnelEvent, trackFunnel } from '../funnel'
import { isStarterIssueDone, markStarterDone, movedStarterIssue, sampleArchived, tickedKey } from './autotick'
import { inBackground } from './background'
import { resolveLanguage } from './content'
import { focusChanged, readStarterSetup, readTeamFocus } from './focus'
import { seedHolidays } from './holidays'
import { starterKeyOf } from './ids'
import { notifyJoined } from './joined'
import { installInternalRequests } from './pack'
import { markEmptyStart, reconcileStarter, seedStarter } from './seed'
import { attachSignupCalendar, createCalendarConnector, createGrantLookup } from './signup-calendar'

// Older workspaces never get starter content, even when their creator rejoins.
const STARTER_WINDOW_MS = 24 * 60 * 60 * 1000

export function isStarterWindow (createdOn: number, now: number): boolean {
  return now - createdOn < STARTER_WINDOW_MS
}

type Accounts = ReturnType<typeof getAccountClient>

export function startStarter (ctx: MeasureContext): () => Promise<void> {
  const { ServiceId, QueueRegion, CalendarUrl } = config.starter
  const clients = createWorkspaceClients(ServiceId)
  const signupCalendar = { loadGrant: createGrantLookup(clients, ServiceId), connectCalendar: createCalendarConnector(ctx, CalendarUrl, ServiceId) }
  const serviceToken = (workspace: WorkspaceUuid): string => generateToken(systemAccountUuid, workspace, { service: ServiceId })

  const accountOf = (person: PersonUuid): AccountUuid => person as AccountUuid
  const localeOf = async (accounts: Accounts, account: AccountUuid): Promise<string | null> =>
    await accounts.getAccountLocale({ account }).catch((error: Error) => {
      ctx.warn('account locale unavailable', { account, error: error.message })
      return null
    })

  const languageOf = async (accounts: Accounts, account: AccountUuid, workspaceName: string, personName: string): Promise<'vi' | 'en'> => {
    return resolveLanguage(await localeOf(accounts, account), workspaceName, personName)
  }

  const seedFor = async (workspace: WorkspaceUuid): Promise<void> => {
    const token = serviceToken(workspace)
    const accounts = getAccountClient(token)
    const info = await accounts.getWorkspaceInfo(false)
    if (info.createdBy === undefined || !isStarterWindow(info.createdOn, Date.now())) return
    const client = await clients(workspace)
    const person = await client.findOne(contact.class.Person, { personUuid: info.createdBy })
    if (person === undefined) return
    const setup = await readStarterSetup(client)
    if (setup === undefined) return
    const language = await languageOf(accounts, accountOf(info.createdBy), info.name, person.name)
    const { focus, hasSampleContent } = setup
    ctx.info('seed starter content', { workspace, language, focus, hasSampleContent })
    const isSeeded = hasSampleContent
      ? await seedStarter(client, createCollabText(workspace, token, config.mcp.CollaboratorUrl), { account: accountOf(info.createdBy), person: person._id }, language, focus)
      : await markEmptyStart(client)
    if (!isSeeded) return
    trackFunnel(ctx, { event: funnelEvent.WorkspaceCreated, workspace, account: info.createdBy, properties: { team_focus: focus, sample_content: hasSampleContent } })
    if (hasSampleContent && focus === 'operations') inBackground(ctx, 'internal request pack', { workspace }, async () => { await installInternalRequests(client) })
    if (language === 'vi') inBackground(ctx, 'vietnam holidays', { workspace }, async () => { await seedHolidays(client) })
  }

  const reconcileFor = async (workspace: WorkspaceUuid): Promise<void> => {
    const token = serviceToken(workspace)
    const accounts = getAccountClient(token)
    const info = await accounts.getWorkspaceInfo(false)
    if (info.createdBy === undefined) return
    const client = await clients(workspace)
    const creator = await client.findOne(contact.class.Person, { personUuid: info.createdBy })
    if (creator === undefined) return
    const language = await languageOf(accounts, accountOf(info.createdBy), info.name, creator.name)
    const focus = await readTeamFocus(client)
    const isSeeded = await reconcileStarter(client, createCollabText(workspace, token, config.mcp.CollaboratorUrl), language, focus)
    if (isSeeded && focus === 'operations') await installInternalRequests(client)
  }

  const joinedFor = async (workspace: WorkspaceUuid, joined: Ref<Person>): Promise<void> => {
    const accounts = getAccountClient(serviceToken(workspace))
    const client = await clients(workspace)
    const outcome = await notifyJoined(
      client,
      {
        workspaceInfo: async () => {
          const info = await accounts.getWorkspaceInfo(false)
          return { name: info.name, createdBy: info.createdBy === undefined ? undefined : accountOf(info.createdBy) }
        },
        members: async () => await accounts.getWorkspaceMembers(),
        locale: async (account) => await localeOf(accounts, account)
      },
      joined
    )
    if (outcome === undefined || outcome.isCreator) return
    await markStarterDone(client, 'invite')
    trackFunnel(ctx, { event: funnelEvent.InviteAccepted, workspace, account: outcome.newcomer })
  }

  const react = (workspace: WorkspaceUuid, tx: Tx, joined: Ref<Person> | undefined): void => {
    const key = tickedKey(tx)
    if (key !== undefined) inBackground(ctx, 'starter tick', { workspace, key }, async () => { await markStarterDone(await clients(workspace), key) })
    const moved = movedStarterIssue(tx)
    if (moved !== undefined) {
      inBackground(ctx, 'starter done event', { workspace, task: moved }, async () => {
        if (await isStarterIssueDone(await clients(workspace), moved)) {
          trackFunnel(ctx, { event: funnelEvent.ChecklistItemDone, workspace, properties: { key: starterKeyOf(moved) } })
        }
      })
    }
    if (sampleArchived(tx)) trackFunnel(ctx, { event: funnelEvent.SampleArchived, workspace })
    if (focusChanged(tx)) inBackground(ctx, 'starter reconcile', { workspace }, async () => { await reconcileFor(workspace) })
    if (joined !== undefined) inBackground(ctx, 'joined notice', { workspace }, async () => { await joinedFor(workspace, joined) })
  }

  const queue = getPlatformQueue(ServiceId, QueueRegion)
  // A throw retries the message with backoff; once the window closes the retry returns early instead.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (_ctx, message) => {
    const joined = joinedPerson(message.value)
    react(message.workspace, message.value, joined)
    if (joined !== undefined) {
      void attachSignupCalendar(signupCalendar, message.workspace, joined)
        .catch((error: Error) => { ctx.error('sign-up calendar not attached', { workspace: message.workspace, error: error.message }) })
    }
    if (joined !== undefined || focusChanged(message.value)) await seedFor(message.workspace)
  })
  return async () => {
    await consumer.close()
  }
}
