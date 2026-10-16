import { type AnalyticProvider } from '@hcengineering/analytics'
import * as Sentry from '@sentry/browser'
import { coarsenUrl } from './posthog'

interface SentryConfig {
  SENTRY_DSN?: string
  SENTRY_RELEASE?: string
  SENTRY_ENVIRONMENT?: string
}

const BREADCRUMB_URL_KEYS = ['url', 'from', 'to']

function scrubEvent (event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.url !== undefined) event.request = { url: coarsenUrl(event.request.url) }
  return event
}

function scrubBreadcrumb (breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console') return null
  const crumbData = breadcrumb.data
  if (crumbData === undefined) return breadcrumb
  for (const key of BREADCRUMB_URL_KEYS) {
    const url = crumbData[key]
    if (typeof url === 'string') crumbData[key] = coarsenUrl(url)
  }
  return breadcrumb
}

async function startSentry (): Promise<void> {
  const response = await fetch('/servone-config.json', { cache: 'no-cache' })
  const isJson = response.headers.get('content-type')?.includes('json') ?? false
  if (!response.ok || !isJson) return
  const config = (await response.json()) as SentryConfig
  if (config.SENTRY_DSN === undefined) return
  Sentry.init({
    dsn: config.SENTRY_DSN,
    release: config.SENTRY_RELEASE,
    environment: config.SENTRY_ENVIRONMENT,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, urlQueryParams: false, stackFrameVariables: false },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb
  })
}

export class SentryProvider implements AnalyticProvider {
  init (): boolean {
    void startSentry()
    return true
  }

  setUser (): void {}

  setAlias (): void {}

  setTag (): void {}

  setWorkspace (): void {}

  handleEvent (): void {}

  handleError (error: Error): void {
    Sentry.captureException(error)
  }

  navigate (): void {}

  logout (): void {}
}
