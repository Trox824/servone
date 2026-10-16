import { AccountRole, roleOrder } from '@hcengineering/core'
import type { IncomingMessage, ServerResponse } from 'http'
import { z } from 'zod'

import { readBody } from '../../http-body'
import { corsHeaders, type Json, jsonReply, pathSegments, sendJson } from '../../http-json'
import type { RequestHandler } from '../../router'
import type { Caller } from '../../webhooks/auth'
import { type Fetch, type Provider, type SourceId, sourceId, VendorTokenError } from './providers'
import { apiRequest, callVendor } from './proxy'
import { type Connections, type Consents, type Random, sourceOfState } from './store'

const PREFLIGHT_MAX_AGE_SECONDS = 600
const MAX_CONNECT_BODY_BYTES = 256 * 1024
const NONCE_BYTES = 16
const MAX_STATE_LENGTH = 200
const MAX_TRELLO_TOKEN_LENGTH = 512
const MESSAGE_TYPE = 'servone-import-connect'

export interface ConnectHttpDeps {
  frontUrl: string
  publicUrl: string
  providers: Map<SourceId, Provider>
  consents: Consents
  connections: Connections
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  fetch: Fetch
  now: () => number
  random: Random
  report: (event: string, fields: Record<string, string>) => void
}

const startBody = z.object({ source: sourceId })
const connectionBody = z.object({ connection: z.string().min(1) })
const callBody = z.object({ connection: z.string().min(1), request: apiRequest })
const tokenBody = z.object({ state: z.string().min(1).max(MAX_STATE_LENGTH), token: z.string().max(MAX_TRELLO_TOKEN_LENGTH) })

type ConnectFailure = 'denied' | 'expired' | 'failed'
type ConnectOutcome = { source: SourceId, connection: string } | { source: SourceId | null, error: ConnectFailure }

function scriptJson (json: Json): string {
  return JSON.stringify(json).replace(/</g, '\\u003c')
}

async function readJson (req: IncomingMessage): Promise<Json | undefined> {
  const text = await readBody(req, MAX_CONNECT_BODY_BYTES)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export function createConnectHandler (deps: ConnectHttpDeps): RequestHandler {
  const redirectUri = `${deps.publicUrl}/v1/import/connect/callback`

  function sendPage (res: ServerResponse, script: string): void {
    const nonce = deps.random(NONCE_BYTES)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
      ].join('; ')
    })
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>Servone import</title></head><body><p>You can close this window.</p><script nonce="${nonce}">${script}</script></body></html>`
    )
  }

  function sendOutcome (res: ServerResponse, outcome: ConnectOutcome): void {
    const message = scriptJson({ type: MESSAGE_TYPE, ...outcome })
    sendPage(res, `if (window.opener) window.opener.postMessage(${message}, ${scriptJson(deps.frontUrl)}); window.close()`)
  }

  function sendTrelloPage (res: ServerResponse, state: string): void {
    sendPage(
      res,
      `const token = new URLSearchParams(location.hash.slice(1)).get('token') || ''
history.replaceState(null, '', location.pathname + location.search)
const post = (outcome) => { if (window.opener) window.opener.postMessage(Object.assign({ type: ${scriptJson(MESSAGE_TYPE)} }, outcome), ${scriptJson(deps.frontUrl)}); window.close() }
fetch('token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: ${scriptJson(state)}, token }) })
  .then((response) => response.json())
  .then(post, () => post({ source: 'trello', error: 'failed' }))`
    )
  }

  async function complete (state: string, code: string): Promise<ConnectOutcome> {
    const consent = deps.consents.take(state)
    if (consent === undefined) return { source: sourceOfState(state) ?? null, error: 'expired' }
    const { source } = consent.provider
    if (code === '') return { source, error: 'denied' }
    try {
      const grant = await consent.provider.redeem(deps.fetch, { kind: 'code', code, verifier: consent.verifier, redirectUri }, deps.now())
      return { source, connection: deps.connections.open(consent.caller, consent.provider, grant) }
    } catch (error) {
      deps.report('import connect failed', { source, error: error instanceof VendorTokenError ? error.message : error instanceof Error ? error.name : 'unknown' })
      return { source, error: 'failed' }
    }
  }

  function isFragmentFlow (state: string): boolean {
    const source = sourceOfState(state)
    return source !== undefined && deps.providers.get(source)?.flow === 'fragment'
  }

  function outcomeFields (outcome: ConnectOutcome): Record<string, string> {
    return { source: outcome.source ?? 'unknown', outcome: 'error' in outcome ? outcome.error : 'connected' }
  }

  async function authorized (req: IncomingMessage, res: ServerResponse, cors: Record<string, string>): Promise<Caller | undefined> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) {
      sendJson(res, jsonReply(401, { error: 'unauthorized' }), cors)
      return undefined
    }
    if (roleOrder[caller.role] < roleOrder[AccountRole.Maintainer]) {
      sendJson(res, jsonReply(403, { error: 'forbidden' }), cors)
      return undefined
    }
    return caller
  }

  async function handle (req: IncomingMessage, res: ServerResponse, cors: Record<string, string>): Promise<void> {
    const [root, area, connect, route, ...rest] = pathSegments(req.url) ?? []
    if (root !== 'v1' || area !== 'import' || connect !== 'connect' || rest.length > 0) {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }

    if (req.method === 'GET' && route === 'callback') {
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams
      const state = query.get('state') ?? ''
      const code = query.get('code') ?? ''
      if (code === '' && query.get('error') === null && isFragmentFlow(state)) {
        sendTrelloPage(res, state)
        return
      }
      const outcome = await complete(state, code)
      deps.report('import connect', outcomeFields(outcome))
      sendOutcome(res, outcome)
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }

    if (route === 'token') {
      const parsed = tokenBody.safeParse(await readJson(req))
      if (!parsed.success || !isFragmentFlow(parsed.data.state)) {
        sendJson(res, jsonReply(400, { error: 'invalid' }), cors)
        return
      }
      const outcome = await complete(parsed.data.state, parsed.data.token)
      deps.report('import connect', outcomeFields(outcome))
      sendJson(res, jsonReply('error' in outcome ? 400 : 200, outcome), cors)
      return
    }

    const caller = await authorized(req, res, cors)
    if (caller === undefined) return
    const body = await readJson(req)

    if (route === 'sources') {
      sendJson(res, jsonReply(200, { sources: [...deps.providers.keys()] }), cors)
      return
    }

    if (route === 'start') {
      const parsed = startBody.safeParse(body)
      if (!parsed.success) {
        sendJson(res, jsonReply(400, { error: 'invalid', field: 'source' }), cors)
        return
      }
      const provider = deps.providers.get(parsed.data.source)
      if (provider === undefined) {
        sendJson(res, jsonReply(404, { error: 'not_configured' }), cors)
        return
      }
      const { state, verifier } = deps.consents.begin(caller, provider)
      sendJson(res, jsonReply(200, { url: provider.consentUrl(redirectUri, state, verifier) }), cors)
      return
    }

    if (route === 'call') {
      const parsed = callBody.safeParse(body)
      if (!parsed.success) {
        sendJson(res, jsonReply(400, { error: 'invalid', field: parsed.error.issues[0]?.path.map(String).join('.') ?? '' }), cors)
        return
      }
      const connection = deps.connections.use(parsed.data.connection, caller)
      if (connection === undefined) {
        sendJson(res, jsonReply(404, { error: 'not_connected' }), cors)
        return
      }
      try {
        const called = await callVendor(deps.fetch, connection, parsed.data.request, deps.now())
        if ('response' in called) {
          sendJson(res, jsonReply(200, { ...called.response }), cors)
          return
        }
        const status = called.error === 'forbidden_request' ? 400 : called.error === 'upstream_timeout' ? 504 : 502
        sendJson(res, jsonReply(status, { error: called.error }), cors)
      } catch (error) {
        if (!(error instanceof VendorTokenError)) throw error
        deps.connections.close(parsed.data.connection, caller)
        deps.report('import connect refresh failed', { source: connection.provider.source, error: error.message })
        sendJson(res, jsonReply(404, { error: 'not_connected' }), cors)
      }
      return
    }

    if (route === 'end') {
      const parsed = connectionBody.safeParse(body)
      if (!parsed.success) {
        sendJson(res, jsonReply(400, { error: 'invalid', field: 'connection' }), cors)
        return
      }
      const connection = deps.connections.close(parsed.data.connection, caller)
      if (connection?.provider.release !== undefined) await connection.provider.release(deps.fetch, connection.token, connection.guildId)
      sendJson(res, jsonReply(200, { ok: true }), cors)
      return
    }

    sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
  }

  return async (req, res) => {
    const cors = corsHeaders(req, deps.frontUrl)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
      })
      res.end()
      return
    }
    try {
      await handle(req, res, cors)
    } catch (error) {
      deps.report('import connect request failed', { error: error instanceof VendorTokenError ? error.message : error instanceof Error ? error.name : 'unknown' })
      if (res.headersSent) {
        res.end()
        return
      }
      sendJson(res, jsonReply(500, { error: 'internal' }), cors)
    }
  }
}
