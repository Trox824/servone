import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Json } from '../http-json'

import { buildMcpServer, type Report } from './mcp'
import type { AnyTool } from './tool'
import type { Caller, WorkspaceSession } from './types'

// Returns true when it answered the request; routing stops there.
export type RouteHandler = (req: IncomingMessage, res: ServerResponse, path: string[]) => Promise<boolean>

export interface ServerDeps {
  publicUrl: string
  tools: AnyTool[]
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  session: (caller: Caller) => Promise<WorkspaceSession>
  extraRoutes: RouteHandler
  report: Report
}

function sendJson (res: ServerResponse, status: number, body: Json, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

function pathSegments (url: string | undefined): string[] {
  return new URL(url ?? '/', 'http://localhost').pathname.split('/').filter((part) => part !== '')
}

export function createRequestHandler (deps: ServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  // RFC 9728: tells the client where to discover the authorization server.
  const challenge = `Bearer resource_metadata="${deps.publicUrl}/.well-known/oauth-protected-resource"`
  const reportMcpError = (error: Error): void => {
    deps.report('mcp error', { error: error.message })
  }

  async function serveMcp (req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Authenticate on every request, before the session cache, so a revoked token stops at once.
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) {
      sendJson(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': challenge })
      return
    }
    const session = await deps.session(caller)
    const mcp = createMcpHandler(() => buildMcpServer(session, deps.tools, deps.report), { onerror: reportMcpError })
    res.on('close', () => {
      mcp.close().catch(reportMcpError)
    })
    await toNodeHandler(mcp, { onerror: reportMcpError })(req, res)
  }

  async function route (req: IncomingMessage, res: ServerResponse, path: string[]): Promise<void> {
    if (await deps.extraRoutes(req, res, path)) return
    if (path.length === 1 && path[0] === 'health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true })
      return
    }
    if (path.length === 1 && path[0] === 'mcp') {
      await serveMcp(req, res)
      return
    }
    sendJson(res, 404, { error: 'not_found' })
  }

  return async (req, res) => {
    const path = pathSegments(req.url)
    try {
      await route(req, res, path)
    } catch (error) {
      deps.report('request failed', { route: path.join('/'), error: error instanceof Error ? error.message : String(error) })
      if (res.headersSent) res.end()
      else sendJson(res, 500, { error: 'internal' })
    }
  }
}
