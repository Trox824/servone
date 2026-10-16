// Sits between the stock transactor (WEB_PUSH_URL) and the stock web push service (NOTIFICATION_URL) and drops
// pushes that the user's channel level, pause or working hours say to hold. The stock transactor cannot load a
// Servone trigger, and it only checks whether the Push provider is on.
import type { MeasureContext } from '@hcengineering/core'
import type { IncomingMessage, ServerResponse } from 'http'

import config from '../config'
import { readBody } from '../http-body'
import type { RequestHandler } from '../router'
import { readPushTarget, shouldForward } from './gate'
import { findWorkspace, loadFacts } from './lookup'

const WEB_PUSH_PATH = '/web-push'
const HELD_RESPONSE = JSON.stringify({ result: [] })

// Same cap as the issues and chat APIs; a web push payload is a few KB.
const MAX_PUSH_BODY_BYTES = 256 * 1024

function isAuthorized (req: IncomingMessage): boolean {
  if (config.pushGate.AuthToken === undefined) return true
  return (req.headers.authorization ?? '').replace('Bearer ', '') === config.pushGate.AuthToken
}

// The stale subscription ids in the stock service's reply go back to the transactor untouched; it deletes them.
async function forward (req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (req.headers.authorization !== undefined) headers.Authorization = req.headers.authorization
  const url = `${config.pushGate.NotificationUrl}${WEB_PUSH_PATH}`
  const upstream = await fetch(url, { method: 'POST', headers, body })
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' })
  res.end(await upstream.text())
}

// Holds only on positive evidence. When the gate cannot read the facts it forwards: without the gate the stock
// server would have sent this push, and a lost mention costs more than an unwanted alert.
async function isHeld (ctx: MeasureContext, body: string): Promise<boolean> {
  const target = readPushTarget(body)
  if (target === undefined) return false
  try {
    const now = Date.now()
    const workspace = await findWorkspace(target.workspaceUrl, now)
    if (workspace === undefined) return false
    const facts = await loadFacts(workspace, target.inboxNotificationId)
    if (facts === undefined) return false
    return !shouldForward(facts, now)
  } catch (error) {
    ctx.warn('push gate lookup failed, forwarding', { workspaceUrl: target.workspaceUrl, error })
    return false
  }
}

async function handle (ctx: MeasureContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST' || req.url !== WEB_PUSH_PATH) {
    res.writeHead(404).end()
    return
  }
  if (!isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ err: 'Invalid auth token' }))
    return
  }
  const body = await readBody(req, MAX_PUSH_BODY_BYTES)
  if (body === undefined) {
    res.writeHead(413).end()
    return
  }
  if (await isHeld(ctx, body)) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(HELD_RESPONSE)
    return
  }
  await forward(req, res, body)
}

export function createPushGate (ctx: MeasureContext): RequestHandler {
  return async (req, res) => {
    await handle(ctx, req, res).catch((error) => {
      ctx.error('push gate request failed', { error })
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ err: 'Push gate failed' }))
    })
  }
}
