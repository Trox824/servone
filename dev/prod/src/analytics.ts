//
// Copyright © 2024 Hardcore Engineering Inc
//

import { Analytics } from '@hcengineering/analytics'
import { configureAnalyticsProviders } from '@hcengineering/analytics-providers'
import { type Config } from './platform'
import { PosthogProvider } from './posthog'
import { SentryProvider } from './sentry'

export function configureAnalytics (config: Config) {
  configureAnalyticsProviders(config)
  // servone: PostHog. Baked in at build time (webpack DefinePlugin): the stock front image builds config.json without these keys.
  Analytics.init(new PosthogProvider(), {
    POSTHOG_KEY: process.env.POSTHOG_KEY ?? '',
    POSTHOG_HOST: process.env.POSTHOG_HOST ?? ''
  })
  Analytics.init(new SentryProvider(), {})
}
