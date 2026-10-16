import { AccountRole, roleOrder } from '@hcengineering/core'

import { readBody } from '../http-body'
import { corsHeaders, type Json, jsonReply, pathSegments, sendJson } from '../http-json'
import type { RequestHandler } from '../router'
import type { Caller } from '../webhooks/auth'
import { type ImportRequest, MAX_IMPORT_BODY_BYTES, parseImportRequest } from './request'
import { ImportRefError } from './write'

const PREFLIGHT_MAX_AGE_SECONDS = 600

export interface ImportHttpDeps {
  frontUrl: string
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  run: (caller: Caller, request: ImportRequest) => Promise<Json>
  report: (event: string, fields: Record<string, string>) => void
}

export function createImportHandler (deps: ImportHttpDeps): RequestHandler {
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
    const [root, area, ...rest] = pathSegments(req.url) ?? []
    if (req.method !== 'POST' || root !== 'v1' || area !== 'import' || rest.length > 0) {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }
    let op = 'unknown'
    try {
      const caller = await deps.authenticate(req.headers.authorization)
      if (caller === undefined) {
        sendJson(res, jsonReply(401, { error: 'unauthorized' }), cors)
        return
      }
      if (roleOrder[caller.role] < roleOrder[AccountRole.Maintainer]) {
        sendJson(res, jsonReply(403, { error: 'forbidden' }), cors)
        return
      }
      const body = await readBody(req, MAX_IMPORT_BODY_BYTES)
      if (body === undefined) {
        sendJson(res, jsonReply(413, { error: 'too_large', field: 'body' }, { Connection: 'close' }), cors)
        return
      }
      const parsed = parseImportRequest(body)
      if ('error' in parsed) {
        sendJson(res, jsonReply(400, parsed), cors)
        return
      }
      op = parsed.request.op
      sendJson(res, jsonReply(200, await deps.run(caller, parsed.request)), cors)
    } catch (error) {
      if (error instanceof ImportRefError) {
        sendJson(res, jsonReply(400, { error: 'not_found', field: error.field }), cors)
        return
      }
      deps.report('import failed', { op, error: error instanceof Error ? error.message : String(error) })
      sendJson(res, jsonReply(500, { error: 'internal' }), cors)
    }
  }
}
