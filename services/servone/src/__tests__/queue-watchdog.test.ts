import { MeasureMetricsContext } from '@hcengineering/core'
import { CHECK_INTERVAL_MS, RESTART_AFTER_MS, watchConsumer } from '../queue-watchdog'

class FakeConsumer {
  isConnected = (): boolean => this.connected
  closeCalls = 0
  constructor (public connected: boolean) {}
  close = async (): Promise<void> => {
    this.closeCalls++
  }
}

const ctx = new MeasureMetricsContext('test', {})

function watched (initiallyConnected: boolean): { consumers: FakeConsumer[], close: () => Promise<void> } {
  const consumers: FakeConsumer[] = []
  const watchdog = watchConsumer(ctx, () => {
    const consumer = new FakeConsumer(initiallyConnected)
    consumers.push(consumer)
    return consumer
  })
  return { consumers, close: watchdog.close }
}

async function advance (ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('watchConsumer', () => {
  it('keeps a connected consumer', async () => {
    const { consumers, close } = watched(true)
    await advance(RESTART_AFTER_MS * 3)
    expect(consumers).toHaveLength(1)
    await close()
  })

  it('recreates a consumer that stayed disconnected for the whole window', async () => {
    const { consumers, close } = watched(false)
    await advance(RESTART_AFTER_MS + CHECK_INTERVAL_MS)
    expect(consumers).toHaveLength(2)
    expect(consumers[0].closeCalls).toBe(1)
    await close()
  })

  it('forgives a disconnect that recovers inside the window', async () => {
    const { consumers, close } = watched(false)
    await advance(RESTART_AFTER_MS - CHECK_INTERVAL_MS)
    consumers[0].connected = true
    await advance(CHECK_INTERVAL_MS)
    consumers[0].connected = false
    await advance(RESTART_AFTER_MS - CHECK_INTERVAL_MS)
    expect(consumers).toHaveLength(1)
    await close()
  })

  it('recreates even when closing the dead consumer fails', async () => {
    const consumers: FakeConsumer[] = []
    const watchdog = watchConsumer(ctx, () => {
      const consumer = new FakeConsumer(false)
      consumer.close = async () => {
        throw new Error('broker gone')
      }
      consumers.push(consumer)
      return consumer
    })
    await advance(RESTART_AFTER_MS + CHECK_INTERVAL_MS)
    expect(consumers).toHaveLength(2)
    consumers[1].close = async () => {}
    await watchdog.close()
  })

  it('stops checking and closes the current consumer on close', async () => {
    const { consumers, close } = watched(false)
    await close()
    await advance(RESTART_AFTER_MS * 3)
    expect(consumers).toHaveLength(1)
    expect(consumers[0].closeCalls).toBe(1)
  })
})
