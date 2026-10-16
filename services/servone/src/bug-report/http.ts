import { readBody } from '../http-body'
import { corsHeaders, jsonReply, pathSegments, sendJson, type Json } from '../http-json'
import type { RequestHandler } from '../router'
import { readBearer, type Caller } from '../webhooks/auth'
import type { TokenBuckets } from '../webhooks/rate'
import { MAX_IMAGES, MAX_IMAGE_BASE64_CHARS, buildReportMail, parseBugReport, type ReportMail, type Reporter } from './report'

const PREFLIGHT_MAX_AGE_SECONDS = 600
const MAX_TEXT_BODY_BYTES = 40_000
const MAX_BODY_BYTES = MAX_TEXT_BODY_BYTES + MAX_IMAGES * MAX_IMAGE_BASE64_CHARS

export interface BugReportDeps {
  frontUrl: string
  to: string
  buckets: TokenBuckets
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  reporterOf: (token: string, caller: Caller) => Promise<Reporter>
  sendMail: (mail: ReportMail) => Promise<boolean>
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

export function createBugReportHandler (deps: BugReportDeps): RequestHandler {
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
    const segments = pathSegments(req.url) ?? []
    if (req.method !== 'POST' || segments.length !== 2) {
      sendJson(res, jsonReply(404, { error: 'not_found' }), cors)
      return
    }
    const token = readBearer(req.headers.authorization)
    const caller = token === undefined ? undefined : await deps.authenticate(req.headers.authorization)
    if (token === undefined || caller === undefined) {
      sendJson(res, jsonReply(401, { error: 'unauthorized' }), cors)
      return
    }
    const parsedJson = parseJson(await readBody(req, MAX_BODY_BYTES))
    const report = parsedJson === undefined ? undefined : parseBugReport(parsedJson)
    if (report === undefined) {
      sendJson(res, jsonReply(400, { error: 'invalid_body' }), cors)
      return
    }
    const decision = deps.buckets.take(caller.account, deps.now())
    if (!decision.isAllowed) {
      sendJson(res, jsonReply(429, { error: 'rate_limited' }, { 'Retry-After': String(decision.retryAfterSeconds) }), cors)
      return
    }
    const reporter = await deps.reporterOf(token, caller)
    const isSent = await deps.sendMail(buildReportMail(deps.to, report, reporter))
    if (!isSent) {
      sendJson(res, jsonReply(502, { error: 'mail_failed' }), cors)
      return
    }
    sendJson(res, jsonReply(200, { isOk: true }), cors)
  }
}
