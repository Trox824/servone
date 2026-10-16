import type { RestClient } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import core, { TxFactory, type AccountUuid, type MeasureContext } from '@hcengineering/core'
import gmail from '@hcengineering/gmail'
import notification from '@hcengineering/notification'
import { parseDigest } from '@servone/notify-rules'
import type { IncomingMessage, ServerResponse } from 'http'

import config from '../config'
import type { RequestHandler } from '../router'
import { renderUnsubscribePage, type UnsubscribePage } from './email/render'
import type { SchedulerSetting } from './settings'
import { readUnsubscribeToken } from './token'
import { findWorkspace, getWorkspaceClient } from '../workspaces'

const txFactory = new TxFactory(core.account.System)

// Turns the digest off and gives back the instant mention emails the digest had replaced.
async function disableDigest (client: RestClient, user: AccountUuid): Promise<void> {
  const employee = await client.findOne(contact.mixin.Employee, { personUuid: user })
  if (employee === undefined) return
  const identities = await client.findAll(contact.class.SocialIdentity, { attachedTo: employee._id })
  const socialIds = identities.map((identity) => identity._id)

  const settings: SchedulerSetting[] = await client.findAll(notification.class.NotificationProviderSetting, {
    attachedTo: notification.providers.PushNotificationProvider,
    createdBy: { $in: socialIds }
  })
  for (const setting of settings) {
    const digest = parseDigest(setting)
    if (digest === undefined || !digest.isEnabled) continue
    await client.tx(
      txFactory.createTxUpdateDoc<SchedulerSetting>(
        notification.class.NotificationProviderSetting,
        setting.space,
        setting._id,
        { servoneDigest: { ...digest, isEnabled: false } }
      )
    )
  }

  const mentionEmails = await client.findAll(notification.class.NotificationTypeSetting, {
    attachedTo: gmail.providers.EmailNotificationProvider,
    type: notification.ids.MentionNotificationType,
    createdBy: { $in: socialIds }
  })
  for (const setting of mentionEmails) {
    if (setting.enabled) continue
    await client.tx(
      txFactory.createTxUpdateDoc(notification.class.NotificationTypeSetting, setting.space, setting._id, {
        enabled: true
      })
    )
  }
}

function send (response: ServerResponse, status: number, page: UnsubscribePage): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer'
  })
  response.end(renderUnsubscribePage(page))
}

async function handle (ctx: MeasureContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', config.PublicUrl)
  if (url.pathname !== '/unsubscribe' || (request.method !== 'GET' && request.method !== 'POST')) {
    response.writeHead(404).end()
    return
  }
  // RFC 8058 one-click clients POST "List-Unsubscribe=One-Click"; the token in the URL is all that matters.
  request.resume()
  const token = url.searchParams.get('token') ?? ''
  const claim = readUnsubscribeToken(token, config.Secret)
  const workspace = claim === undefined ? undefined : await findWorkspace(config.scheduler.ServiceId, claim.workspace)
  if (claim === undefined || workspace === undefined) {
    send(response, 400, { kind: 'invalid' })
    return
  }
  // GET only asks: mail scanners open links, and must not switch the digest off.
  if (request.method === 'GET') {
    const actionUrl = `/unsubscribe?token=${encodeURIComponent(token)}`
    send(response, 200, { kind: 'confirm', workspaceName: workspace.name, actionUrl })
    return
  }
  await disableDigest(await getWorkspaceClient(config.scheduler.ServiceId, workspace.uuid), claim.user)
  ctx.info('email digest turned off', { workspace: workspace.uuid, user: claim.user })
  send(response, 200, { kind: 'done', workspaceName: workspace.name })
}

export function createUnsubscribeHandler (ctx: MeasureContext): RequestHandler {
  return async (request, response) => {
    await handle(ctx, request, response).catch((error) => {
      ctx.error('unsubscribe failed', { error })
      if (!response.headersSent) send(response, 500, { kind: 'failed' })
    })
  }
}
