// Start-of-day summary and email digest. Polls every minute because the stock s0.7.437 server has no
// scheduled triggers a Servone service can hook into.
import type { MeasureContext } from '@hcengineering/core'

import { runTick } from './scheduler'

export { createUnsubscribeHandler } from './unsubscribe'

const TICK_MS = 60_000

export function startScheduler (ctx: MeasureContext): () => void {
  // A slow tick (many workspaces, slow mail) is skipped over, never run twice at once.
  let isTicking = false
  const tick = (): void => {
    if (isTicking) return
    isTicking = true
    runTick(ctx, Date.now())
      .catch((error) => {
        ctx.error('scheduler tick failed', { error })
      })
      .finally(() => {
        isTicking = false
      })
  }
  const timer = setInterval(tick, TICK_MS)
  tick()
  return () => {
    clearInterval(timer)
  }
}
