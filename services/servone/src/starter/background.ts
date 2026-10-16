import type { MeasureContext } from '@hcengineering/core'

const ATTEMPTS = 3
const RETRY_DELAY_MS = 2000

async function attempt (work: () => Promise<void>): Promise<void> {
  for (let tried = 1; ; tried++) {
    try {
      await work()
      return
    } catch (error) {
      if (tried === ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

export function inBackground (ctx: MeasureContext, name: string, fields: Record<string, string>, work: () => Promise<void>): void {
  attempt(work).catch((error: Error) => { ctx.error(`${name} failed`, { ...fields, error: error.message }) })
}
