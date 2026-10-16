import { readBody } from '../http-body'
import { corsHeaders, jsonReply, pathSegments, sendJson, type Json } from '../http-json'
import type { RequestHandler } from '../router'
import type { Caller } from '../webhooks/auth'
import { MAX_INVITES_PER_REQUEST } from './plan'
import type { WorkspaceUuid } from '@hcengineering/core'

const PREFLIGHT_MAX_AGE_SECONDS = 600
const MAX_BODY_BYTES = 10_000
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface InviteRecordDeps {
  frontUrl: string
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  recordInvite: (workspace: WorkspaceUuid, email: string, at: number) => Promise<void>
}

export function parseInviteEmails (body: Json | undefined): string[] | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const { emails } = body
  if (!Array.isArray(emails) || emails.length === 0 || emails.length > MAX_INVITES_PER_REQUEST) return undefined
  if (!emails.every((email): email is string => typeof email === 'string' && EMAIL_SHAPE.test(email.trim()))) return undefined
  return emails.map((email) => email.trim().toLowerCase())
}

function parseJson (text: string | undefined): Json | undefined {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export function createInviteRecordHandler (deps: InviteRecordDeps): RequestHandler {
  return async (req, res) => {
    const cors = corsHeaders(req, deps.frontUrl)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS) })
      res.end()
      return
    }
    const segments = pathSegments(req.url) ?? []
    if (req.method !== 'POST' || segments.length !== 3 || segments[2] !== 'invites') {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) {
      sendJson(res, jsonReply(401, { error: 'unauthorized' }), cors)
      return
    }
    const emails = parseInviteEmails(parseJson(await readBody(req, MAX_BODY_BYTES)))
    if (emails === undefined) {
      sendJson(res, jsonReply(400, { error: 'invalid_body' }), cors)
      return
    }
    for (const email of emails) await deps.recordInvite(caller.workspace, email, deps.now())
    sendJson(res, jsonReply(200, { recorded: emails.length }), cors)
  }
}
