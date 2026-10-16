// kafkajs only logs a failed consumer start and never retries, so after a Redpanda restart a consumer can sit
// disconnected forever. Recreating it rejoins the same group at its committed offset.
import type { MeasureContext } from '@hcengineering/core'
import type { ConsumerHandle } from '@hcengineering/server-core'

export const CHECK_INTERVAL_MS = 30_000
// Longer than a normal connect and rebalance, so a consumer that is still joining is left alone.
export const RESTART_AFTER_MS = 2 * 60_000

export function watchConsumer (ctx: MeasureContext, create: () => ConsumerHandle): { close: () => Promise<void> } {
  let consumer = create()
  let disconnectedSince: number | undefined

  const timer = setInterval(() => {
    if (consumer.isConnected()) {
      disconnectedSince = undefined
      return
    }
    const now = Date.now()
    disconnectedSince ??= now
    if (now - disconnectedSince < RESTART_AFTER_MS) return
    ctx.warn('queue consumer disconnected, recreating it', { disconnectedMs: now - disconnectedSince })
    // The old consumer is already dead; a failed close must not keep the new one from starting.
    consumer.close().catch((error: Error) => {
      ctx.warn('closing dead queue consumer failed', { error: error.message })
    })
    consumer = create()
    disconnectedSince = undefined
  }, CHECK_INTERVAL_MS)

  return {
    close: async () => {
      clearInterval(timer)
      await consumer.close()
    }
  }
}
