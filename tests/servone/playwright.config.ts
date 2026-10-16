import { defineConfig, devices } from '@playwright/test'
import type { Lang } from './lib/env'

export default defineConfig<{ lang: Lang }>({
  testDir: './specs',
  // Serial: specs share signed-in users, and OTP sends are rate-limited per email.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
  },
  projects: [
    { name: 'vi', use: { lang: 'vi', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' } },
    { name: 'en', use: { lang: 'en', locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' } }
  ]
})
