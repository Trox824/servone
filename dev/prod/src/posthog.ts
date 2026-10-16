import { type AnalyticProvider } from '@hcengineering/analytics'
import posthog, { type CaptureResult, type Properties } from 'posthog-js'

// Fields Huly passes to Analytics.setUser from workbench and guest connect.
interface ConnectedUser {
  account_uuid?: string
  workspace_uuid?: string
  role?: string
  branding?: string
}

type EventParam = string | number | boolean | string[] | null | undefined

// Upstream events carry these as free text (login email, gmail recipient, workspace and tag names),
// a join credential (invite_id), or a slug derived from the company name (workspace).
const PERSONAL_KEYS = new Set(['email', 'to', 'name', 'key', 'title', 'text', 'query', 'invite_id', 'workspace'])
// IDs and enums never contain whitespace or '@'; titles, names and addresses do.
const FREE_TEXT = /[\s@]/
// Document link ids are `slugify(title)-<_id>` (document-resources getDocumentLinkId); keep only the _id.
const TITLE_SLUGGED_ID = /^.+-([0-9a-f]{24})$/

function clean (param: string): string | undefined {
  return FREE_TEXT.test(param) ? undefined : param.replace(TITLE_SLUGGED_ID, '$1')
}

export function scrubParams (params: Record<string, EventParam>): Record<string, EventParam> {
  const scrubbed: Record<string, EventParam> = {}
  for (const [key, param] of Object.entries(params)) {
    if (PERSONAL_KEYS.has(key)) continue
    if (Array.isArray(param)) scrubbed[key] = param.map(clean).filter((id) => id !== undefined)
    else if (typeof param !== 'string') scrubbed[key] = param
    else {
      const cleaned = clean(param)
      if (cleaned !== undefined) scrubbed[key] = cleaned
    }
  }
  return scrubbed
}

// Workbench URLs carry the company slug, document title slugs and invite tokens: keep only the module.
export function coarsenPath (pathname: string): string {
  const [route = '', second, third] = pathname.split('/').filter((segment) => segment !== '')
  if (route === 'workbench') return third === undefined ? '/workbench/:ws' : `/workbench/:ws/${third}`
  if (route === 'login' && second !== undefined) return `/login/${second}`
  return `/${route}`
}

const MODULE_BY_PLUGIN = new Map([
  ['tracker', 'tracker'],
  ['chunter', 'chat'],
  ['calendar', 'calendar'],
  ['time', 'calendar'],
  ['document', 'docs'],
  ['drive', 'drive'],
  ['process', 'workflow'],
  ['love', 'meetings'],
  ['card', 'cards']
])

export function moduleOfClass (objectClass: EventParam): string | undefined {
  return typeof objectClass === 'string' ? MODULE_BY_PLUGIN.get(objectClass.split(':')[0]) : undefined
}

export function moduleOfPath (pathname: string): string | undefined {
  const [route, , third] = pathname.split('/').filter((segment) => segment !== '')
  return route === 'workbench' ? third : undefined
}

export function coarsenUrl (raw: string): string {
  const url = new URL(raw, window.location.origin)
  if (url.origin !== window.location.origin) return url.origin
  return raw.startsWith('/') ? coarsenPath(url.pathname) : url.origin + coarsenPath(url.pathname)
}

function coarsenUrls (props: Properties | undefined): void {
  if (props === undefined) return
  for (const [key, prop] of Object.entries(props)) {
    if (typeof prop === 'string' && /(url|pathname|referrer)$/.test(key) && prop !== '$direct') props[key] = coarsenUrl(prop)
  }
}

// Error messages can quote user content; type and stack frames are enough to group issues.
function stripExceptionMessages (props: Properties): void {
  const exceptions = props.$exception_list
  if (!Array.isArray(exceptions)) return
  for (const exception of exceptions) exception.value = undefined
}

function stripUrls (capture: CaptureResult | null): CaptureResult | null {
  if (capture === null) return null
  stripExceptionMessages(capture.properties)
  coarsenUrls(capture.properties)
  coarsenUrls(capture.$set)
  coarsenUrls(capture.$set_once)
  return capture
}

interface OpenDialog {
  flow: string
  openedAt: number
  hasSaved: boolean
}

const SAVE_EVENTS = new Set(['doc_created', 'doc_updated', 'api_succeeded'])
const FAILURE_EVENTS = new Set(['doc_failed', 'api_failed'])

export class PosthogProvider implements AnalyticProvider {
  private readonly openDialogs: OpenDialog[] = []

  init (config: { POSTHOG_KEY: string, POSTHOG_HOST: string }): boolean {
    if (config.POSTHOG_KEY === '') return false
    posthog.init(config.POSTHOG_KEY, {
      api_host: config.POSTHOG_HOST,
      person_profiles: 'identified_only',
      persistence: 'memory',
      autocapture: {
        css_selector_allowlist: ['[data-track]', '#card-close'],
        element_attribute_ignorelist: ['href', 'title', 'aria-label', 'alt', 'placeholder', 'src', 'name', 'value', 'style']
      },
      mask_all_text: true,
      capture_pageview: false,
      capture_pageleave: true,
      capture_performance: { web_vitals: true, network_timing: false },
      capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
      disable_session_recording: true,
      before_send: stripUrls
    })
    window.addEventListener('popstate', () => {
      this.navigate()
    })
    return true
  }

  // Guests stay anonymous so they do not count as people.
  setUser (_email: string, user: ConnectedUser): void {
    if (user.account_uuid === undefined) return
    posthog.identify(user.account_uuid, { role: user.role, branding: user.branding })
    if (user.workspace_uuid !== undefined) {
      posthog.group('company', user.workspace_uuid)
      // Group analytics is a paid add-on; a super property keeps per-company counts possible without it.
      posthog.register({ workspace_uuid: user.workspace_uuid })
    }
  }

  setAlias (): void {}

  setTag (key: string, tag: string): void {
    posthog.register({ [key]: tag })
  }

  // Grouped by workspace UUID in setUser; the URL slug is not stable.
  setWorkspace (): void {}

  handleEvent (event: string, params: Record<string, EventParam>): void {
    const scrubbed = scrubParams(params)
    const productModule = event.startsWith('doc_') ? moduleOfClass(params.object_class) : undefined
    if (productModule !== undefined) {
      scrubbed.module = productModule
      scrubbed.core_action = !FAILURE_EVENTS.has(event)
    } else if (!event.startsWith('doc_')) {
      scrubbed.module = moduleOfPath(window.location.pathname)
    }
    const isProductWrite = productModule !== undefined || event.startsWith('api_')
    this.trackDialog(event, scrubbed, isProductWrite)
    posthog.capture(event, scrubbed)
  }

  private trackDialog (event: string, scrubbed: Record<string, EventParam>, isProductWrite: boolean): void {
    if (event === 'dialog_opened' && typeof scrubbed.flow === 'string') {
      this.openDialogs.push({ flow: scrubbed.flow, openedAt: Date.now(), hasSaved: false })
      return
    }
    if (event === 'dialog_closed') {
      const index = this.openDialogs.findLastIndex((dialog) => dialog.flow === scrubbed.flow)
      if (index === -1) return
      const closed = this.openDialogs.splice(index, 1)[0]
      scrubbed.saved = closed.hasSaved
      scrubbed.duration_s = Math.round((Date.now() - closed.openedAt) / 1000)
      return
    }
    const current = this.openDialogs.at(-1)
    if (current === undefined || !isProductWrite || !(SAVE_EVENTS.has(event) || FAILURE_EVENTS.has(event))) return
    scrubbed.flow = current.flow
    if (SAVE_EVENTS.has(event)) current.hasSaved = true
  }

  handleError (error: Error): void {
    posthog.captureException(error)
  }

  navigate (): void {
    posthog.capture('$pageview', { module: moduleOfPath(window.location.pathname) })
  }

  logout (): void {
    posthog.reset()
  }
}
