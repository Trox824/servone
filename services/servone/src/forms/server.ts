import type { Ref, WorkspaceUuid } from '@hcengineering/core'
import type { IssueTemplate } from '@hcengineering/tracker'
import { checkAnswers, type Answer, type FormDefinition } from '@servone/forms'
import type { IncomingMessage, ServerResponse } from 'http'
import { readBody } from '../http-body'
import { corsHeaders, type Json, jsonReply as json, type JsonReply, pathSegments, sendJson } from '../http-json'
import { clientIpOf } from '../ip-limit'
import type { Caller } from '../webhooks/auth'
import type { TokenBuckets } from '../webhooks/rate'
import { hashSecret, isHookId, isSecret, newHookId, newSecret, secretMatches } from '../webhooks/secret'
import {
  FIELD_PREFIX,
  HONEYPOT_FIELD,
  PAGE_HEADERS,
  renderFormPage,
  renderMessagePage,
  renderThanksPage
} from './page'
import type { FormLinkStore, StoredFormLink } from './store'

// 30 fields of 10k characters could need more, but a form that long is not filled in by hand.
export const MAX_FORM_BODY_BYTES = 256 * 1024
const TEMPLATE_ID_PATTERN = /^[\w:.-]{1,100}$/
const PREFLIGHT_MAX_AGE_SECONDS = 600

export interface PublicForm {
  title: string
  definition: FormDefinition
}

export interface TemplateAccess {
  canManage: boolean
  isForm: boolean
}

export interface FormsDeps {
  store: FormLinkStore
  // Keyed by link and client IP so one abuser cannot lock real visitors out. Views and submissions are limited
  // separately: reading a form costs far less than filing an issue.
  viewBuckets: TokenBuckets
  submitBuckets: TokenBuckets
  publicUrl: string
  frontUrl: string
  now: () => number
  authenticate: (authorization: string | undefined) => Promise<Caller | undefined>
  // Undefined when the template is gone.
  templateAccess: (caller: Caller, template: Ref<IssueTemplate>) => Promise<TemplateAccess | undefined>
  // Undefined when the template is gone or no longer has questions.
  loadForm: (workspace: WorkspaceUuid, template: Ref<IssueTemplate>) => Promise<PublicForm | undefined>
  // Resolves the new issue's identifier.
  submit: (link: StoredFormLink, answers: Answer[]) => Promise<string>
  // Fields must never carry the link secret or the request path.
  report: (event: string, fields: Record<string, string | number>) => void
}

interface HtmlReply {
  status: number
  html: string
  headers?: Record<string, string>
}

const html = (status: number, page: string, headers?: Record<string, string>): HtmlReply =>
  headers === undefined ? { status, html: page } : { status, html: page, headers }

const NOT_FOUND_JSON = json(404, { error: 'not_found' })
const NOT_FOUND_PAGE = html(404, renderMessagePage('Form not found', 'This link is no longer active. Ask whoever shared it for a new one.'))

export function formUrl (publicUrl: string, link: StoredFormLink): string {
  return `${publicUrl}/forms/${link.id}/${link.secret}`
}

function answersFrom (body: string): Map<string, string> {
  const answers = new Map<string, string>()
  for (const [name, value] of new URLSearchParams(body)) {
    if (name.startsWith(FIELD_PREFIX)) answers.set(name.slice(FIELD_PREFIX.length), value)
  }
  return answers
}

export function createFormsHandler (deps: FormsDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  async function activeLink (id: string, secret: string): Promise<StoredFormLink | undefined> {
    if (!isHookId(id) || !isSecret(secret)) return undefined
    const link = await deps.store.getLink(id)
    // Unknown link and wrong secret answer the same, so a caller cannot probe which ids exist.
    return link !== undefined && secretMatches(secret, hashSecret(link.secret)) ? link : undefined
  }

  function limited (buckets: TokenBuckets, id: string, ip: string): HtmlReply | undefined {
    const decision = buckets.take(`${id}:${ip}`, deps.now())
    if (decision.isAllowed) return undefined
    return html(429, renderMessagePage('Too many requests', 'Wait a minute and try again.'), {
      'Retry-After': String(decision.retryAfterSeconds)
    })
  }

  async function view (id: string, secret: string, ip: string): Promise<HtmlReply> {
    if (isHookId(id)) {
      const rejection = limited(deps.viewBuckets, id, ip)
      if (rejection !== undefined) return rejection
    }
    const link = await activeLink(id, secret)
    if (link === undefined) return NOT_FOUND_PAGE
    const form = await deps.loadForm(link.workspace, link.template)
    if (form === undefined) return NOT_FOUND_PAGE
    return html(200, renderFormPage({ ...form, values: new Map(), problems: new Map() }))
  }

  async function submit (req: IncomingMessage, id: string, secret: string, ip: string): Promise<HtmlReply> {
    if (isHookId(id)) {
      const rejection = limited(deps.submitBuckets, id, ip)
      if (rejection !== undefined) return rejection
    }
    const body = await readBody(req, MAX_FORM_BODY_BYTES)
    if (body === undefined) {
      return html(413, renderMessagePage('Answer too long', 'Shorten your answers and try again.'), { Connection: 'close' })
    }
    const link = await activeLink(id, secret)
    if (link === undefined) return NOT_FOUND_PAGE
    const form = await deps.loadForm(link.workspace, link.template)
    if (form === undefined) return NOT_FOUND_PAGE

    // A filled trap looks like success to the bot, and nothing is filed.
    if ((new URLSearchParams(body).get(HONEYPOT_FIELD) ?? '') !== '') {
      deps.report('form trap', { link: link.id })
      return html(200, renderThanksPage(form.title, undefined))
    }
    const raw = answersFrom(body)
    const checked = checkAnswers(form.definition, raw)
    if (!checked.isValid) return html(400, renderFormPage({ ...form, values: raw, problems: checked.problems }))

    let identifier: string
    try {
      identifier = await deps.submit(link, checked.answers)
    } catch (error) {
      deps.report('form submit failed', { link: link.id, error: error instanceof Error ? error.message : String(error) })
      return html(502, renderMessagePage('Not sent', 'Something went wrong on our side. Your answers were not saved; try again in a minute.'))
    }
    deps.report('form submitted', { link: link.id, workspace: link.workspace })
    return html(200, renderThanksPage(form.title, identifier))
  }

  function linkSummary (link: StoredFormLink | undefined): Json {
    if (link === undefined) return { link: null }
    return { link: { url: formUrl(deps.publicUrl, link), createdBy: link.createdBy, createdOn: link.createdOn } }
  }

  async function manage (req: IncomingMessage, templateId: string): Promise<JsonReply> {
    const caller = await deps.authenticate(req.headers.authorization)
    if (caller === undefined) return json(401, { error: 'unauthorized' })
    // Ids are opaque strings; the workspace lookup decides whether this one exists.
    const template = templateId as Ref<IssueTemplate>
    const access = await deps.templateAccess(caller, template)
    if (access === undefined) return NOT_FOUND_JSON
    if (!access.canManage) return json(403, { error: 'forbidden' })

    const current = await deps.store.getTemplateLink(caller.workspace, template)
    if (req.method === 'GET') return json(200, linkSummary(current))
    if (req.method === 'DELETE') {
      if (current !== undefined) await deps.store.deleteLink(current)
      deps.report('form link revoked', { workspace: caller.workspace })
      return json(200, { ok: true })
    }
    if (req.method !== 'POST') return NOT_FOUND_JSON
    if (!access.isForm) return json(409, { error: 'not_a_form' })
    // A new link replaces the old one, so a leaked URL can be rotated in one step.
    if (current !== undefined) await deps.store.deleteLink(current)
    const link: StoredFormLink = {
      id: newHookId(),
      workspace: caller.workspace,
      template,
      secret: newSecret(),
      createdBy: caller.account,
      createdOn: deps.now()
    }
    await deps.store.saveLink(link)
    deps.report('form link created', { link: link.id, workspace: caller.workspace })
    return json(201, linkSummary(link))
  }

  function sendHtml (res: ServerResponse, reply: HtmlReply): void {
    res.writeHead(reply.status, { ...PAGE_HEADERS, ...reply.headers })
    res.end(reply.html)
  }

  async function publicPage (req: IncomingMessage, res: ServerResponse, id: string, secret: string): Promise<void> {
    const ip = clientIpOf(req)
    try {
      if (req.method === 'GET') sendHtml(res, await view(id, secret, ip))
      else if (req.method === 'POST') sendHtml(res, await submit(req, id, secret, ip))
      else sendHtml(res, html(405, renderMessagePage('Not allowed', 'Open the form link in a browser.'), { Allow: 'GET, POST' }))
    } catch (error) {
      deps.report('form page failed', { error: error instanceof Error ? error.message : String(error) })
      sendHtml(res, html(500, renderMessagePage('Something went wrong', 'Try again in a minute.')))
    }
  }

  // /forms/<link id>/<secret> is the public page; /forms/templates/<template id>/link is the member API.
  return async (req, res) => {
    const segments = pathSegments(req.url)
    if (segments?.[0] !== 'forms') {
      sendJson(res, NOT_FOUND_JSON, {})
      return
    }
    const isManagement = segments.length === 4 && segments[1] === 'templates' && segments[3] === 'link'
    if (!isManagement) {
      if (segments.length === 3) await publicPage(req, res, segments[1], segments[2])
      else sendHtml(res, NOT_FOUND_PAGE)
      return
    }
    const cors = corsHeaders(req, deps.frontUrl)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': 'Authorization',
        'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS)
      })
      res.end()
      return
    }
    if (!TEMPLATE_ID_PATTERN.test(segments[2])) {
      sendJson(res, NOT_FOUND_JSON, cors)
      return
    }
    try {
      sendJson(res, await manage(req, segments[2]), cors)
    } catch (error) {
      deps.report('form link management failed', { error: error instanceof Error ? error.message : String(error) })
      sendJson(res, json(500, { error: 'internal' }), cors)
    }
  }
}
