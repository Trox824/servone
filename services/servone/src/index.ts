// All Servone backend modules in one process behind one port, except mail when SERVONE_ROLE=mail splits it out.
import { Analytics } from '@hcengineering/analytics'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { type MeasureContext, newMetrics } from '@hcengineering/core'
import { setMetadata } from '@hcengineering/platform'
import * as Sentry from '@sentry/node'
import serverClient from '@hcengineering/server-client'
import { initStatisticsContext } from '@hcengineering/server-core'
import serverToken from '@hcengineering/server-token'
import { createServer } from 'http'
import { join } from 'path'

import { createApprovals, startApprovals } from './approvals'
import { createBugReport } from './bug-report'
import { createChatHooks } from './chat-hooks'
import { createChatCommands } from './commands'
import config from './config'
import { startDeptChannels } from './dept-channels'
import { createForms } from './forms'
import { startHandoff } from './handoff'
import { startIssueDates } from './issue-dates'
import { createImport } from './import'
import { createIssuesApi } from './issues-api'
import { createMail } from './mail'
import { createMailProxy } from './mail/proxy'
import { createMcp } from './mcp'
import { createPushGate } from './push-gate'
import { createRouter, type RequestHandler } from './router'
import { startRsvp } from './rsvp'
import { createUnsubscribeHandler, startScheduler } from './scheduler'
import { createInviteRecords, startLifecycle } from './lifecycle'
import { startStarter } from './starter'
import { createTrackerHooks } from './tracker-hooks'
import { createWebhooks } from './webhooks'
import { createWorkflows } from './workflows'

function main (): void {
  Sentry.init({
    dsn: config.sentry.Dsn,
    release: config.sentry.Release,
    environment: config.sentry.Environment,
    initialScope: { tags: { role: config.Role } },
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false }
  })
  configureAnalytics(config.ServiceId, process.env.VERSION ?? '0.7.0')
  const ctx = initStatisticsContext(config.ServiceId, {
    factory: () =>
      createOpenTelemetryMetricsContext(
        config.ServiceId,
        {},
        {},
        newMetrics(),
        new SplitLogger(config.ServiceId, {
          root: join(process.cwd(), 'logs'),
          enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
        })
      )
  })

  Analytics.setTag('application', config.ServiceId)
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, config.ServiceId)
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)

  if (config.Role === 'mail') startMailService(ctx)
  else startAll(ctx)
}

function startAll (ctx: MeasureContext): void {
  const mail = config.mail.IsEnabled ? createMail(ctx, config.mail) : undefined
  const trackerHooks = createTrackerHooks(ctx)
  const chatHooks = createChatHooks(ctx)
  const chatCommands = createChatCommands(ctx)
  const route = createRouter({
    mcp: createMcp(ctx),
    webhooks: createWebhooks(ctx),
    issuesApi: createIssuesApi(ctx),
    trackerHooks: trackerHooks.handler,
    chatHooks: chatHooks.handler,
    chatCommands: chatCommands.handler,
    forms: createForms(ctx),
    unsubscribe: createUnsubscribeHandler(ctx),
    webPush: createPushGate(ctx),
    mail: mail?.handler ?? (config.mail.ServiceUrl !== undefined ? createMailProxy(ctx, config.mail.ServiceUrl) : mailDisabled),
    workflows: createWorkflows(),
    approvals: createApprovals(),
    import: createImport(ctx),
    bugReport: createBugReport(),
    lifecycle: createInviteRecords()
  })
  const server = createServer((req, res) => {
    void route(req, res)
  })
  server.listen(config.Port, () => {
    ctx.info('Servone services started', { port: config.Port })
  })

  const stopScheduler = startScheduler(ctx)
  const closeDeptChannels = startDeptChannels(ctx)
  const closeIssueDates = startIssueDates(ctx)
  const closeHandoff = startHandoff(ctx)
  const closeRsvp = startRsvp(ctx)
  const closeApprovals = startApprovals(ctx)
  const closeStarter = startStarter(ctx)
  const stopLifecycle = startLifecycle(ctx)

  const shutdown = (): void => {
    chatCommands.stop()
    stopScheduler()
    stopLifecycle()
    void Promise.all([closeDeptChannels(), closeIssueDates(), closeHandoff(), closeRsvp(), closeApprovals(), closeStarter(), trackerHooks.stop(), chatHooks.stop(), mail?.stop()]).then(() => {
      server.close(() => process.exit())
    })
  }
  onExit(ctx, shutdown)
}

function startMailService (ctx: MeasureContext): void {
  const mail = createMail(ctx, config.mail)
  const server = createServer((req, res) => {
    const [, root] = new URL(req.url ?? '/', 'http://localhost').pathname.split('/')
    if (root === 'mail') {
      void mail.handler(req, res)
      return
    }
    if (root === 'health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }))
  })
  server.listen(config.Port, () => {
    ctx.info('Servone mail service started', { port: config.Port })
  })
  onExit(ctx, () => {
    void mail.stop().then(() => {
      server.close(() => process.exit())
    })
  })
}

const mailDisabled: RequestHandler = async (_req, res) => {
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'mail_disabled' }))
}

function onExit (ctx: MeasureContext, shutdown: () => void): void {
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  process.on('uncaughtException', (error) => {
    ctx.error('Uncaught exception', { error })
  })
  process.on('unhandledRejection', (error) => {
    ctx.error('Unhandled rejection', { error })
  })
}

main()
